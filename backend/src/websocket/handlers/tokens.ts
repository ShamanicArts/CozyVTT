// ============================================
// Token movement handlers
// token.move.start / token.move (throttled) / token.move.end
// ============================================

import { Server } from "socket.io";
import { throttle } from "lodash";
import { AuthenticatedSocket } from "../auth";
import {
  getSpiritVisibilityBatch,
  filterTokensByLighting,
} from "../../utils/spirit-layer";
import type { WallSegment } from "../../types/walls";
import logger from "../../utils/logger";
import { tokenMoveLimiter } from "../shared";
import {
  FINALIZE_TOKEN_MOVE,
  FinalizeTokenMoveCommand,
  FinalizeTokenMoveResult,
  PREVIEW_TOKEN_MOVE,
  PreviewTokenMoveCommand,
  PreviewTokenMoveResult,
  START_TOKEN_MOVE,
  StartTokenMoveCommand,
  StartTokenMoveResult,
} from "../../application/tokens/TokenMovement";
import { productionCommandBus } from "../../composition/productionApplicationHost";
import {
  TokenMovementError,
  TokenMovementRole,
} from "../../domain/tokens/TokenMovement";

// Socket.IO remains a transport and recipient-filtering adapter. The mutation
// and its authorization now run through the same command bus future HTTP,
// import and agent adapters will use.
const tokenMovementCommands = productionCommandBus;

function actorFor(socket: AuthenticatedSocket, campaignId: string) {
  return {
    campaignId,
    userId: socket.userId!,
    role: socket.role as TokenMovementRole,
  };
}

function isTokenMovementError(error: unknown): error is TokenMovementError {
  return error instanceof TokenMovementError;
}

export function registerTokenHandlers(
  io: Server,
  socket: AuthenticatedSocket,
): void {
  /**
   * TOKEN.MOVE.START - User begins dragging a token
   * Validates permission and broadcasts to campaign
   */
  socket.on(
    "token.move.start",
    async (data: { tokenId: string; mapId: string }) => {
      try {
        if (!socket.campaignId) {
          socket.emit("error", { message: "Not authenticated to a campaign" });
          return;
        }

        const { tokenId, mapId } = data;

        if (!tokenId || !mapId) {
          socket.emit("error", { message: "tokenId and mapId required" });
          return;
        }

        const { token } = await tokenMovementCommands.dispatch<
          StartTokenMoveCommand,
          StartTokenMoveResult
        >({
          type: START_TOKEN_MOVE,
          actor: actorFor(socket, socket.campaignId),
          tokenId,
          mapId,
        });

        // Role-filtered broadcast for spirit tokens
        if (token.layer === "spirit") {
          const campaignSockets = await io.in(socket.campaignId).fetchSockets();
          const visibility = await getSpiritVisibilityBatch(
            socket.campaignId,
            campaignSockets
              .map((s) => (s as unknown as AuthenticatedSocket).userId)
              .filter((id): id is string => !!id),
          );
          for (const s of campaignSockets) {
            if (s.id === socket.id) continue; // Exclude sender
            const authedSocket = s as unknown as AuthenticatedSocket;
            if (authedSocket.role === "DM") {
              s.emit("token.move.start", {
                tokenId,
                mapId,
                movedBy: socket.userId,
              });
            } else if (
              authedSocket.userId &&
              visibility.get(authedSocket.userId)
            ) {
              s.emit("token.move.start", {
                tokenId,
                mapId,
                movedBy: socket.userId,
              });
            }
          }
        } else {
          // Normal token - broadcast to all campaign members (excluding sender)
          socket.to(socket.campaignId).emit("token.move.start", {
            tokenId,
            mapId,
            movedBy: socket.userId,
          });
        }

        logger.debug("token.move.start", {
          tokenId,
          userId: socket.userId,
          mapId,
        });
      } catch (error) {
        if (isTokenMovementError(error)) {
          socket.emit("error", { message: error.message });
          return;
        }
        logger.error("token.move.start failed", { err: error });
        socket.emit("error", { message: "Failed to start token movement" });
      }
    },
  );

  /**
   * TOKEN.MOVE - Position updates during drag (throttled to 60/s)
   * Validates coordinates and broadcasts to campaign
   */
  const handleTokenMove = throttle(
    async (
      socket: AuthenticatedSocket,
      data: { tokenId: string; mapId: string; x: number; y: number },
    ) => {
      try {
        if (!socket.campaignId) {
          return; // Silently ignore if not authenticated
        }

        // Flood ceiling: drop excess frames silently — the 16ms throttle
        // already paces legitimate drags well under this limit.
        if (!tokenMoveLimiter.check(socket.id, 150, 1000)) {
          return;
        }

        const { tokenId, mapId, x, y } = data;

        if (
          !tokenId ||
          !mapId ||
          typeof x !== "number" ||
          typeof y !== "number"
        ) {
          return; // Silently ignore invalid data during rapid updates
        }

        // The application command performs the one map read and preserves the
        // legacy silent discard for a wrong-map drag frame.
        const preview = await tokenMovementCommands.dispatch<
          PreviewTokenMoveCommand,
          PreviewTokenMoveResult | null
        >({
          type: PREVIEW_TOKEN_MOVE,
          campaignId: socket.campaignId,
          tokenId,
          mapId,
          position: { x, y },
        });

        if (!preview) {
          return; // Silently ignore invalid map during rapid updates
        }
        const { token: movingToken } = preview;

        // Role-filtered broadcast for spirit tokens
        if (movingToken && movingToken.layer === "spirit") {
          const campaignSockets = await io.in(socket.campaignId).fetchSockets();
          const visibility = await getSpiritVisibilityBatch(
            socket.campaignId,
            campaignSockets
              .map((s) => (s as unknown as AuthenticatedSocket).userId)
              .filter((id): id is string => !!id),
          );
          for (const s of campaignSockets) {
            if (s.id === socket.id) continue; // Exclude sender
            const authedSocket = s as unknown as AuthenticatedSocket;
            // Only send spirit token movement to DMs and players with spirit visibility
            if (authedSocket.role === "DM") {
              s.emit("token.moved", {
                tokenId,
                mapId,
                x,
                y,
                movedBy: socket.userId,
              });
            } else if (
              authedSocket.userId &&
              visibility.get(authedSocket.userId)
            ) {
              s.emit("token.moved", {
                tokenId,
                mapId,
                x,
                y,
                movedBy: socket.userId,
              });
            }
          }
        } else {
          // Normal token - broadcast to all campaign members (excluding sender)
          socket.to(socket.campaignId).emit("token.moved", {
            tokenId,
            mapId,
            x,
            y,
            movedBy: socket.userId,
          });
        }
      } catch (error) {
        if (isTokenMovementError(error)) {
          // As before, only an out-of-bounds transient frame is surfaced; other
          // malformed frames are silently ignored above.
          if (error.code === "POSITION_OUT_OF_BOUNDS") {
            socket.emit("error", { message: error.message });
          }
          return;
        }
        logger.error("token.move failed", { err: error });
      }
    },
    16,
  ); // 16ms = ~60fps (1000ms / 60fps = 16.67ms)

  socket.on(
    "token.move",
    (data: { tokenId: string; mapId: string; x: number; y: number }) => {
      handleTokenMove(socket, data);
    },
  );

  /**
   * TOKEN.MOVE.END - User finishes dragging (final position)
   * Updates database and broadcasts to campaign
   */
  socket.on(
    "token.move.end",
    async (data: { tokenId: string; mapId: string; x: number; y: number }) => {
      try {
        if (!socket.campaignId) {
          socket.emit("error", { message: "Not authenticated to a campaign" });
          return;
        }

        // Flood ceiling: drop excess finalize writes silently. Shares the
        // per-socket budget with token.move; a normal drag stays far under it.
        if (!tokenMoveLimiter.check(socket.id, 150, 1000)) {
          return;
        }

        const { tokenId, mapId, x, y } = data;

        if (
          !tokenId ||
          !mapId ||
          typeof x !== "number" ||
          typeof y !== "number"
        ) {
          socket.emit("error", { message: "Invalid token move data" });
          return;
        }

        const {
          map,
          token,
          tokens: updatedTokens,
        } = await tokenMovementCommands.dispatch<
          FinalizeTokenMoveCommand,
          FinalizeTokenMoveResult
        >({
          type: FINALIZE_TOKEN_MOVE,
          actor: actorFor(socket, socket.campaignId),
          tokenId,
          mapId,
          position: { x, y },
        });

        // Role-filtered broadcast for spirit tokens
        if (token.layer === "spirit") {
          const campaignSockets = await io.in(socket.campaignId).fetchSockets();
          const visibility = await getSpiritVisibilityBatch(
            socket.campaignId,
            campaignSockets
              .map((s) => (s as unknown as AuthenticatedSocket).userId)
              .filter((id): id is string => !!id),
          );
          for (const s of campaignSockets) {
            const authedSocket = s as unknown as AuthenticatedSocket;
            if (authedSocket.role === "DM") {
              s.emit("token.moved", {
                tokenId,
                mapId,
                x,
                y,
                movedBy: socket.userId,
              });
            } else if (
              authedSocket.userId &&
              visibility.get(authedSocket.userId)
            ) {
              s.emit("token.moved", {
                tokenId,
                mapId,
                x,
                y,
                movedBy: socket.userId,
              });
            }
          }
        } else if (map.lightingEnabled) {
          // Dynamic lighting: per-player visibility filtering
          const campaignSockets = await io.in(socket.campaignId).fetchSockets();
          for (const s of campaignSockets) {
            const authedSocket = s as unknown as AuthenticatedSocket;
            if (authedSocket.role === "DM") {
              s.emit("token.moved", {
                tokenId,
                mapId,
                x,
                y,
                movedBy: socket.userId,
              });
              continue;
            }
            if (!authedSocket.userId) continue;

            // Compute which tokens are visible for this player after the move
            const allVisible = filterTokensByLighting(
              updatedTokens,
              authedSocket.userId,
              map.wallSegments as unknown as WallSegment[],
              map.width,
              map.height,
              map.gridSize,
              true,
              map.lights,
            );
            const visibleIds = new Set(allVisible.map((t) => t.id));

            if (visibleIds.has(tokenId)) {
              // Token is visible: send position update AND appeared (frontend deduplicates)
              s.emit("token.moved", {
                tokenId,
                mapId,
                x,
                y,
                movedBy: socket.userId,
              });
              // Also send full token data in case this player didn't have it yet
              s.emit("token:appeared", {
                token: { ...token, position: { x, y } },
                mapId,
              });
            } else {
              s.emit("token:disappeared", { tokenId, mapId });
            }

            // If a player moved their OWN token, their view frustum changed —
            // re-sync all OTHER tokens so NPCs that left/entered view appear/disappear immediately.
            if (token.controlledBy === authedSocket.userId) {
              for (const otherToken of updatedTokens) {
                if (otherToken.id === tokenId) continue; // already handled above
                // Skip own tokens — always included by filterTokensByLighting
                if (otherToken.controlledBy === authedSocket.userId) continue;
                if (visibleIds.has(otherToken.id)) {
                  s.emit("token:appeared", { token: otherToken, mapId });
                } else {
                  s.emit("token:disappeared", {
                    tokenId: otherToken.id,
                    mapId,
                  });
                }
              }
            }
          }
        } else {
          // Normal token - broadcast to all campaign members (including sender for confirmation)
          io.to(socket.campaignId).emit("token.moved", {
            tokenId,
            mapId,
            x,
            y,
            movedBy: socket.userId,
          });
        }

        logger.debug("token.move.end", {
          tokenId,
          x,
          y,
          userId: socket.userId,
        });
      } catch (error) {
        if (isTokenMovementError(error)) {
          socket.emit("error", { message: error.message });
          return;
        }
        logger.error("token.move.end failed", { err: error });
        socket.emit("error", { message: "Failed to finalize token movement" });
      }
    },
  );
}
