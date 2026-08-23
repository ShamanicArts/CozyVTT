// ============================================
// Dice handlers: dice.roll, dice.clearHistory
// ============================================

import { Server } from "socket.io";
import { AuthenticatedSocket } from "../auth";
import { productionRealtimeQueries } from "../../composition/productionRealtimeQueries";
import logger from "../../utils/logger";
import { productionTransportCommands } from "../../composition/productionTransportCommands";
import {
  ROLL_DICE,
  RollDiceCommand,
  RollDiceResult,
} from "../../application/dice/RollDice";
import { DiceRollError } from "../../domain/dice/DiceRoll";

const diceCommands = productionTransportCommands;

export function registerDiceHandlers(
  io: Server,
  socket: AuthenticatedSocket,
): void {
  /**
   * DICE.ROLL - User rolls dice
   * Validates expression, calculates result, saves to database, and broadcasts.
   * Rate limited to 30 rolls per minute per user.
   * SECURITY: Uses server-authenticated socket.campaignId only.
   */
  socket.on(
    "dice.roll",
    async (data: {
      expression: string;
      characterName?: string;
      purpose?: string;
      secret?: boolean;
    }) => {
      try {
        if (!socket.campaignId) {
          socket.emit("error", { message: "Not authenticated to a campaign" });
          return;
        }

        const rollData = await diceCommands.dispatch<
          RollDiceCommand,
          RollDiceResult
        >({
          type: ROLL_DICE,
          campaignId: socket.campaignId,
          userId: socket.userId!,
          expression: data?.expression,
          characterName: data?.characterName,
          purpose: data?.purpose,
          secret: data?.secret,
        });

        if (rollData.secret) {
          // Secret roll - send to roller (always)
          socket.emit("dice.rolled", rollData);

          // SECURITY: Also send to DM(s) for audit/oversight
          // Follows Spirit Layer pattern: DMs see everything, players see filtered
          const campaignSockets = await io.in(socket.campaignId).fetchSockets();
          for (const s of campaignSockets) {
            const authedSocket = s as unknown as AuthenticatedSocket;
            // Send to DMs only (excluding the original roller if they're DM)
            if (
              authedSocket.role === "DM" &&
              authedSocket.userId !== socket.userId
            ) {
              s.emit("dice.rolled.secret", {
                ...rollData,
                originalRoller: socket.userId,
                isAuditView: true, // Flag so DM UI can style differently
              });
            }
          }
        } else {
          // Normal roll - broadcast to all campaign members
          io.to(socket.campaignId).emit("dice.rolled", rollData);
        }

        logger.debug("dice.roll", {
          expression: rollData.expression,
          result: rollData.result,
          userId: socket.userId,
          secret: rollData.secret,
          campaignId: socket.campaignId,
        });
      } catch (error) {
        if (error instanceof DiceRollError) {
          const message =
            error.code === "INVALID_EXPRESSION"
              ? `Invalid dice expression: ${error.message}`
              : error.code === "ROLL_FAILED"
                ? `Dice roll failed: ${error.message}`
                : error.message;
          socket.emit("error", { message });
          return;
        }
        logger.error("dice.roll failed", { err: error });
        socket.emit("error", { message: "Failed to roll dice" });
      }
    },
  );

  /**
   * DICE.CLEAR_HISTORY - DM clears dice roll history (DM-only).
   */
  socket.on("dice.clearHistory", async () => {
    try {
      if (!socket.campaignId) {
        socket.emit("error", { message: "Not authenticated to a campaign" });
        return;
      }

      // Verify user is DM
      if (
        !socket.userId ||
        !(await productionRealtimeQueries.isCampaignOwner(
          socket.userId,
          socket.campaignId,
        ))
      ) {
        socket.emit("error", { message: "Only the DM can clear roll history" });
        return;
      }

      // Broadcast to all campaign members (including DM)
      io.to(socket.campaignId).emit("dice.historyCleared");

      logger.info("dice.clearHistory", {
        campaignId: socket.campaignId,
        userId: socket.userId,
      });
    } catch (error) {
      logger.error("dice.clearHistory failed", { err: error });
      socket.emit("error", { message: "Failed to clear dice history" });
    }
  });
}
