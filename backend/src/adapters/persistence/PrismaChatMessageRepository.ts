import { Prisma, PrismaClient } from "@prisma/client";
import { ChatMessageRepository } from "../../ports/ChatMessageRepository";

/** Prisma implementation of the chat command persistence port. */
export class PrismaChatMessageRepository implements ChatMessageRepository {
  constructor(private readonly client: PrismaClient) {}

  async getCampaignChatSettings(campaignId: string) {
    return this.client.campaign.findUnique({
      where: { id: campaignId },
      select: { chatCooldownEnabled: true, chatCooldownSeconds: true },
    });
  }

  async findUserDisplayName(userId: string): Promise<string | null> {
    const user = await this.client.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    return user?.displayName ?? null;
  }

  async createMessage(
    input: Parameters<ChatMessageRepository["createMessage"]>[0],
  ) {
    return this.client.message.create({
      data: {
        ...input,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
      select: { id: true, createdAt: true },
    });
  }
}
