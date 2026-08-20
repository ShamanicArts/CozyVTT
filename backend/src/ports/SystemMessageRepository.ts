export interface SystemMessageRepository {
  createSystemMessage(
    campaignId: string,
    content: string,
    metadata: Record<string, unknown> | undefined,
  ): Promise<{ id: string; createdAt: Date }>;
}
