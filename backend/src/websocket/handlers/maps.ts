// ============================================
// Map switch handler: map.change
// ============================================

import { Server } from "socket.io";
import { AuthenticatedSocket } from "../auth";
import {
  getSpiritVisibilityBatch,
  filterMapData,
} from "../../utils/spirit-layer";
import logger from "../../utils/logger";
import { productionCommandBus } from "../../composition/productionApplicationHost";
import {
  CHANGE_MAP,
  ChangeMap,
  ChangeMapCommand,
} from "../../application/maps/MapLifecycleCommands";
import { MapLifecycleError } from "../../domain/maps/MapLifecycle";

const mapChangeCommands = productionCommandBus;

export function registerMapHandlers(
  io: Server,
  socket: AuthenticatedSocket,
): void {
  /**
   * MAP.CHANGE - DM switches to a different map.
   * Broadcasts role-filtered map data to all campaign members.
   */
  socket.on("map.change", async (data: { mapId: string }) => {
    try {
      if (!socket.campaignId) return;

      // DM only
      if (socket.role !== "DM") {
        socket.emit("error", { message: "Only DMs can change the map" });
        return;
      }

      const { mapId } = data;
      if (!mapId) {
        socket.emit("error", { message: "mapId required" });
        return;
      }

      const map = await mapChangeCommands.dispatch<
        ChangeMapCommand,
        Awaited<ReturnType<ChangeMap["execute"]>>
      >({
        type: CHANGE_MAP,
        campaignId: socket.campaignId,
        mapId,
      });

      // Broadcast role-filtered map data to each connected campaign member.
      // spiritVisible is included in the payload so the client knows whether
      // to show the spirit overlay for this specific viewer.
      const campaignSockets = await io.in(socket.campaignId).fetchSockets();
      const visibility = await getSpiritVisibilityBatch(
        socket.campaignId,
        campaignSockets
          .map((s) => (s as unknown as AuthenticatedSocket).userId)
          .filter((id): id is string => !!id),
      );
      for (const s of campaignSockets) {
        const authedSocket = s as unknown as AuthenticatedSocket;
        const spiritVisible =
          authedSocket.role === "DM"
            ? true
            : authedSocket.userId
              ? (visibility.get(authedSocket.userId) ?? false)
              : false;
        const filteredMap = filterMapData(
          {
            ...map,
            tokens: map.tokens as any,
            annotations: map.annotations as any,
          },
          authedSocket.role || "PLAYER",
          spiritVisible,
          authedSocket.userId,
        );
        s.emit("map.changed", { mapId, mapData: filteredMap, spiritVisible });
      }

      logger.info("map.change", {
        mapId,
        userId: socket.userId,
        campaignId: socket.campaignId,
      });
    } catch (error) {
      if (error instanceof MapLifecycleError) {
        // map.change intentionally does not reveal whether an ID belongs to
        // another campaign; retain its established single not-found payload.
        socket.emit("error", { message: "Map not found" });
        return;
      }
      logger.error("map.change failed", { err: error });
      socket.emit("error", { message: "Failed to broadcast map change" });
    }
  });
}
