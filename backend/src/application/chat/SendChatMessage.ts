import { ChatMessageError, ChatMessageType } from '../../domain/chat/ChatMessage';
import { CampaignChatCooldownGate } from '../../ports/CampaignChatCooldownGate';
import { ChatMessageRepository } from '../../ports/ChatMessageRepository';
import { Command, CommandHandler } from '../commands/CommandBus';

export const SEND_CHAT_MESSAGE = 'chat.message.send' as const;

export interface SendChatMessageCommand extends Command<SendChatMessageResult> {
  readonly type: typeof SEND_CHAT_MESSAGE;
  readonly campaignId: string;
  readonly userId: string;
  readonly content: unknown;
  readonly messageType: unknown;
}

/** The websocket adapter can fan this result out without knowing persistence details. */
export interface SendChatMessageResult {
  id: string;
  userId: string;
  userName: string;
  content: string;
  type: ChatMessageType;
  timestamp: string;
}

export class SendChatMessage implements CommandHandler<SendChatMessageCommand, SendChatMessageResult> {
  constructor(
    private readonly repository: ChatMessageRepository,
    private readonly cooldownGate: CampaignChatCooldownGate
  ) {}

  async execute(command: SendChatMessageCommand): Promise<SendChatMessageResult> {
    if (!command.content || typeof command.content !== 'string' || command.content.trim().length === 0) {
      throw new ChatMessageError('CONTENT_REQUIRED', 'Message content required');
    }
    if (command.content.length > 2000) {
      throw new ChatMessageError('CONTENT_TOO_LONG', 'Message too long. Maximum 2000 characters.');
    }
    if (command.messageType !== 'PLAYER' && command.messageType !== 'DM') {
      throw new ChatMessageError('INVALID_TYPE', 'Invalid message type. Must be PLAYER or DM.');
    }

    const settings = await this.repository.getCampaignChatSettings(command.campaignId);
    if (settings?.chatCooldownEnabled) {
      const cooldownSeconds = settings.chatCooldownSeconds ?? 5;
      if (!this.cooldownGate.tryAcquire(command.userId, command.campaignId, cooldownSeconds)) {
        throw new ChatMessageError('RATE_LIMITED', `Rate limit: wait ${settings.chatCooldownSeconds}s between messages.`);
      }
    }

    const userName = await this.repository.findUserDisplayName(command.userId);
    if (!userName) {
      throw new ChatMessageError('USER_NOT_FOUND', 'User not found');
    }

    const content = command.content.trim();
    const message = await this.repository.createMessage({
      campaignId: command.campaignId,
      userId: command.userId,
      type: command.messageType,
      content,
    });

    return {
      id: message.id,
      userId: command.userId,
      userName,
      content,
      type: command.messageType,
      timestamp: message.createdAt.toISOString(),
    };
  }
}
