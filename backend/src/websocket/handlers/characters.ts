// ============================================
// Character handler: character.hp.update
// Players update their own HP; DM can update any character's HP.
// ============================================

import { Server } from "socket.io";
import { AuthenticatedSocket } from "../auth";
import logger from "../../utils/logger";
import { productionCommandBus } from "../../composition/productionApplicationHost";
import {
  RealtimeCharacterError,
  UPDATE_CHARACTER_HP,
  UpdateCharacterHp,
  UpdateCharacterHpCommand,
} from "../../application/characters/RealtimeCharacterCommands";

const commands = productionCommandBus;

export function registerCharacterHandlers(
  io: Server,
  socket: AuthenticatedSocket,
): void {
  socket.on(
    "character.hp.update",
    async (data: { characterId: string; delta: number }) => {
      try {
        if (!socket.campaignId) {
          socket.emit("error", { message: "Not authenticated to a campaign" });
          return;
        }

        const hp = await commands.dispatch<
          UpdateCharacterHpCommand,
          Awaited<ReturnType<UpdateCharacterHp["execute"]>>
        >({
          type: UPDATE_CHARACTER_HP,
          campaignId: socket.campaignId,
          characterId: data.characterId,
          delta: data.delta,
          userId: socket.userId!,
          isDm: socket.role === "DM",
        });

        // Broadcast updated HP to all campaign members
        io.to(socket.campaignId!).emit("character.hp.updated", {
          characterId: data.characterId,
          hp,
        });
      } catch (error) {
        if (error instanceof RealtimeCharacterError) {
          socket.emit("error", { message: error.message });
          return;
        }
        logger.error("character.hp.update failed", { err: error });
        socket.emit("error", { message: "Failed to update character HP" });
      }
    },
  );
}
