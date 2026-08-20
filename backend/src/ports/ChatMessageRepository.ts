import { ChatMessageType, PersistedChatMessage } from '../domain/chat/ChatMessage';

/** Persistence boundary for chat commands. */
export interface ChatMessageRepository {
  getCampaignChatSettings(campaignId: string): Promise<{
    chatCooldownEnabled: boolean;
    chatCooldownSeconds: number | null;
  } | null>;
  findUserDisplayName(userId: string): Promise<string | null>;
  createMessage(input: {
    campaignId: string;
    userId: string;
    type: ChatMessageType;
    content: string;
  }): Promise<PersistedChatMessage>;
}
