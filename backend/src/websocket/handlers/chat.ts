// ============================================
// Chat handler: chat.message
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';
import { chatMessageLimiter } from '../shared';
import { CommandBus } from '../../application/commands/CommandBus';
import {
  SEND_CHAT_MESSAGE,
  SendChatMessage,
  SendChatMessageCommand,
  SendChatMessageResult,
} from '../../application/chat/SendChatMessage';
import { ChatMessageError } from '../../domain/chat/ChatMessage';
import { PrismaChatMessageRepository } from '../../adapters/persistence/PrismaChatMessageRepository';
import { SocketCampaignChatCooldownGate } from '../../adapters/rateLimiting/SocketCampaignChatCooldownGate';

// Socket.IO authenticates the actor and fans out the result, while the
// command owns validation, cooldown policy, user lookup, and persistence.
const chatCommands = new CommandBus();
chatCommands.register(
  SEND_CHAT_MESSAGE,
  new SendChatMessage(
    new PrismaChatMessageRepository(prisma),
    new SocketCampaignChatCooldownGate(chatMessageLimiter)
  )
);

export function registerChatHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * CHAT.MESSAGE - User sends chat message.
   * Validates content, saves to database, and broadcasts to campaign.
   * Rate limited per the campaign's chatCooldown settings.
   * SECURITY: Uses server-authenticated socket.campaignId only.
   */
  socket.on('chat.message', async (data: { content: string; type: 'PLAYER' | 'DM' }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      const message = await chatCommands.dispatch<SendChatMessageCommand, SendChatMessageResult>({
        type: SEND_CHAT_MESSAGE,
        campaignId: socket.campaignId,
        userId: socket.userId!,
        content: data?.content,
        messageType: data?.type,
      });

      // Broadcast to all campaign members (including sender)
      io.to(socket.campaignId).emit('chat.message', message);

      logger.debug('chat.message', { type: message.type, userId: socket.userId, campaignId: socket.campaignId });
    } catch (error) {
      if (error instanceof ChatMessageError) {
        socket.emit('error', { message: error.message });
        return;
      }
      logger.error('chat.message failed', { err: error });
      socket.emit('error', { message: 'Failed to send chat message' });
    }
  });
}
