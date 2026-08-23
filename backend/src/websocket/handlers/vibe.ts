// ============================================
// Vibe tracker handler: vibe.update
// ============================================

import { Server } from "socket.io";
import { AuthenticatedSocket } from "../auth";
import { sendSystemMessage } from "../utils";
import logger from "../../utils/logger";
import {
  SET_CAMPAIGN_VIBE,
  SetCampaignVibe,
  SetCampaignVibeCommand,
  RealtimeCampaignError,
} from "../../application/campaigns/RealtimeCampaignCommands";

import { productionTransportCommands } from "../../composition/productionTransportCommands";
const commands = productionTransportCommands;

export function registerVibeHandlers(
  _io: Server,
  socket: AuthenticatedSocket,
): void {
  /**
   * VIBE.UPDATE - DM changes the current vibe period.
   * Updates campaign.currentVibe and broadcasts period data to all members.
   */
  socket.on("vibe.update", async (data: { period: string }) => {
    try {
      if (!socket.campaignId) {
        socket.emit("error", { message: "Not authenticated to a campaign" });
        return;
      }

      // DM only
      if (socket.role !== "DM") {
        socket.emit("error", { message: "Only the DM can change the vibe" });
        return;
      }

      const vibePeriod = await commands.dispatch<
        SetCampaignVibeCommand,
        Awaited<ReturnType<SetCampaignVibe["execute"]>>
      >({
        type: SET_CAMPAIGN_VIBE,
        campaignId: socket.campaignId,
        period: data.period,
        actorId: socket.userId,
      });

      // Send system message
      const periodDisplayName =
        vibePeriod.name.charAt(0).toUpperCase() + vibePeriod.name.slice(1);
      await sendSystemMessage(
        socket.campaignId,
        `Time advances to ${periodDisplayName}.`,
        {
          userId: socket.userId,
          action: "vibe.update",
          period: vibePeriod.name,
        },
      );

      logger.info("vibe.update", {
        period: vibePeriod.name,
        userId: socket.userId,
        campaignId: socket.campaignId,
      });
    } catch (error) {
      if (error instanceof RealtimeCampaignError) {
        socket.emit("error", { message: error.message });
        return;
      }
      logger.error("vibe.update failed", { err: error });
      socket.emit("error", { message: "Failed to update vibe" });
    }
  });
}
