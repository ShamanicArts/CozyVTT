// ============================================
// Atmosphere handlers: atmosphere.effect.set / atmosphere.audio.set
// ============================================

import { Server } from "socket.io";
import { AuthenticatedSocket } from "../auth";
import logger from "../../utils/logger";
import {
  SET_ATMOSPHERE_AUDIO,
  SET_ATMOSPHERE_EFFECT,
  SetAtmosphereAudio,
  SetAtmosphereAudioCommand,
  SetAtmosphereEffectCommand,
  RealtimeCampaignError,
} from "../../application/campaigns/RealtimeCampaignCommands";

import { productionTransportCommands } from "../../composition/productionTransportCommands";
const commands = productionTransportCommands;

export function registerAtmosphereHandlers(
  _io: Server,
  socket: AuthenticatedSocket,
): void {
  /**
   * ATMOSPHERE.EFFECT.SET — DM sets a visual particle overlay on the map canvas.
   * Valid: 'rain' | 'mist' | 'leaves' | 'sparkles' | 'snow' | 'wind' | null (clear)
   */
  socket.on(
    "atmosphere.effect.set",
    async (data: { effect: string | null }) => {
      try {
        if (!socket.campaignId) return;

        if (socket.role !== "DM") {
          socket.emit("error", {
            message: "Only the DM can set atmosphere effects",
          });
          return;
        }

        const effect = await commands.dispatch<
          SetAtmosphereEffectCommand,
          string | null
        >({
          type: SET_ATMOSPHERE_EFFECT,
          campaignId: socket.campaignId,
          effect: data.effect,
          actorId: socket.userId,
        });

        logger.info("atmosphere.effect.set", {
          effect: effect ?? "none",
          userId: socket.userId,
          campaignId: socket.campaignId,
        });
      } catch (error) {
        logger.error("atmosphere.effect.set failed", { err: error });
        socket.emit("error", { message: "Failed to set atmosphere effect" });
      }
    },
  );

  /**
   * ATMOSPHERE.AUDIO.SET — DM queues or stops ambient audio for all players.
   * assetId: UUID of an AUDIO asset, or null to stop.
   */
  socket.on(
    "atmosphere.audio.set",
    async (data: {
      assetId: string | null;
      volume?: number;
      loop?: boolean;
    }) => {
      try {
        if (!socket.campaignId) return;

        if (socket.role !== "DM") {
          socket.emit("error", {
            message: "Only the DM can control ambient audio",
          });
          return;
        }

        await commands.dispatch<
          SetAtmosphereAudioCommand,
          Awaited<ReturnType<SetAtmosphereAudio["execute"]>>
        >({
          type: SET_ATMOSPHERE_AUDIO,
          campaignId: socket.campaignId,
          assetId: data.assetId,
          volume: data.volume,
          loop: data.loop,
          actorId: socket.userId,
        });

        logger.info("atmosphere.audio.set", {
          assetId: data.assetId ?? "none",
          userId: socket.userId,
          campaignId: socket.campaignId,
        });
      } catch (error) {
        if (error instanceof RealtimeCampaignError) {
          socket.emit("error", { message: error.message });
          return;
        }
        logger.error("atmosphere.audio.set failed", { err: error });
        socket.emit("error", { message: "Failed to set atmosphere audio" });
      }
    },
  );
}
