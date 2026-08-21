import logger from "../utils/logger";
import { productionCommandBus } from "../composition/productionApplicationHost";
import {
  CREATE_SYSTEM_MESSAGE,
  CreateSystemMessage,
  CreateSystemMessageCommand,
} from "../application/chat/SystemMessageCommands";
import { getSocketInstance } from "./socketInstance";

export {
  broadcastToCampaign,
  broadcastToUser,
  getSocketInstance,
  setSocketInstance,
} from "./socketInstance";

const systemMessageCommands = productionCommandBus;

/**
 * WebSocket Utility Functions
 * WebSocket Event Specification
 */

/**
 * Get all sockets in a campaign room
 * @param campaignId - Campaign ID
 * @returns Array of socket IDs
 */
export async function getSocketsInCampaign(
  campaignId: string,
): Promise<string[]> {
  const io = getSocketInstance();
  const sockets = await io.in(campaignId).fetchSockets();
  return sockets.map((socket) => socket.id);
}

/**
 * Get campaign member count (connected users)
 * @param campaignId - Campaign ID
 * @returns Number of connected users
 */
export async function getCampaignMemberCount(
  campaignId: string,
): Promise<number> {
  const io = getSocketInstance();
  const sockets = await io.in(campaignId).fetchSockets();
  return sockets.length;
}

/**
 * Disconnect a user's sockets (for forced logout, bans, etc.)
 * @param userId - User ID
 * @param reason - Reason for disconnection
 */
export async function disconnectUser(
  userId: string,
  reason: string,
): Promise<void> {
  const io = getSocketInstance();
  const sockets = await io.in(userId).fetchSockets();

  sockets.forEach((socket) => {
    socket.emit("error", { message: reason });
    socket.disconnect(true);
  });

  logger.info(`❌ Disconnected user ${userId}: ${reason}`);
}

/**
 * Send a system message to a campaign
 * Creates a database record and broadcasts to all campaign members
 * System Messages
 *
 * @param campaignId - Campaign ID
 * @param content - Message content
 * @param metadata - Optional metadata (e.g., { userId, action })
 */
export async function sendSystemMessage(
  campaignId: string,
  content: string,
  metadata?: Record<string, any>,
): Promise<void> {
  try {
    // Save to database
    const message = await systemMessageCommands.dispatch<
      CreateSystemMessageCommand,
      Awaited<ReturnType<CreateSystemMessage["execute"]>>
    >({ type: CREATE_SYSTEM_MESSAGE, campaignId, content, metadata });

    // Broadcast to campaign
    const io = getSocketInstance();
    io.to(campaignId).emit("chat.system", {
      id: message.id,
      content,
      metadata: metadata || null,
      timestamp: message.createdAt.toISOString(),
    });

    logger.info(`📢 System message to campaign ${campaignId}: ${content}`);
  } catch (error) {
    // Log but never re-throw — a failed system message must not crash the server
    // (e.g. when the campaign was deleted just before the disconnect fires).
    logger.error("❌ Error sending system message", { err: error });
  }
}
