import { SendChatMessage, SendChatMessageCommand } from './SendChatMessage';
import { ChatMessageError } from '../../domain/chat/ChatMessage';
import { CampaignChatCooldownGate } from '../../ports/CampaignChatCooldownGate';
import { ChatMessageRepository } from '../../ports/ChatMessageRepository';

const command = (overrides: Partial<SendChatMessageCommand> = {}): SendChatMessageCommand => ({
  type: 'chat.message.send',
  campaignId: 'campaign-1',
  userId: 'user-1',
  content: '  Hello table  ',
  messageType: 'PLAYER',
  ...overrides,
});

describe('SendChatMessage', () => {
  const repository: jest.Mocked<ChatMessageRepository> = {
    getCampaignChatSettings: jest.fn(),
    findUserDisplayName: jest.fn(),
    createMessage: jest.fn(),
  };
  const cooldownGate: jest.Mocked<CampaignChatCooldownGate> = {
    tryAcquire: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    repository.getCampaignChatSettings.mockResolvedValue({ chatCooldownEnabled: false, chatCooldownSeconds: 5 });
    repository.findUserDisplayName.mockResolvedValue('Mira');
    repository.createMessage.mockResolvedValue({ id: 'message-1', createdAt: new Date('2025-01-02T03:04:05.000Z') });
    cooldownGate.tryAcquire.mockReturnValue(true);
  });

  it('validates, persists trimmed content, and returns the stable broadcast payload', async () => {
    const result = await new SendChatMessage(repository, cooldownGate).execute(command());

    expect(repository.createMessage).toHaveBeenCalledWith({
      campaignId: 'campaign-1', userId: 'user-1', type: 'PLAYER', content: 'Hello table',
    });
    expect(result).toEqual({
      id: 'message-1', userId: 'user-1', userName: 'Mira', content: 'Hello table', type: 'PLAYER',
      timestamp: '2025-01-02T03:04:05.000Z',
    });
  });

  it('keeps the campaign-specific cooldown and its legacy error message', async () => {
    repository.getCampaignChatSettings.mockResolvedValue({ chatCooldownEnabled: true, chatCooldownSeconds: 12 });
    cooldownGate.tryAcquire.mockReturnValue(false);

    await expect(new SendChatMessage(repository, cooldownGate).execute(command())).rejects.toEqual(
      new ChatMessageError('RATE_LIMITED', 'Rate limit: wait 12s between messages.')
    );
    expect(cooldownGate.tryAcquire).toHaveBeenCalledWith('user-1', 'campaign-1', 12);
    expect(repository.findUserDisplayName).not.toHaveBeenCalled();
  });

  it('rejects invalid types before touching persistence', async () => {
    await expect(new SendChatMessage(repository, cooldownGate).execute(command({ messageType: 'SYSTEM' }))).rejects.toMatchObject({
      code: 'INVALID_TYPE', message: 'Invalid message type. Must be PLAYER or DM.',
    });
    expect(repository.getCampaignChatSettings).not.toHaveBeenCalled();
  });
});
