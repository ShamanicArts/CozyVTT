/** Transport-neutral chat concepts used by the send-message command. */
export type ChatMessageType = 'PLAYER' | 'DM';

export interface PersistedChatMessage {
  id: string;
  createdAt: Date;
}

/**
 * Expected failures are deliberately stable so HTTP, websocket, and future
 * agent adapters can preserve their own user-facing contracts.
 */
export class ChatMessageError extends Error {
  constructor(
    public readonly code: 'CONTENT_REQUIRED' | 'CONTENT_TOO_LONG' | 'INVALID_TYPE' | 'RATE_LIMITED' | 'USER_NOT_FOUND',
    message: string
  ) {
    super(message);
    this.name = 'ChatMessageError';
  }
}
