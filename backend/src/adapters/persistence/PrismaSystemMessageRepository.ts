import { Prisma, PrismaClient } from "@prisma/client";
import { SystemMessageRepository } from "../../ports/SystemMessageRepository";
export class PrismaSystemMessageRepository implements SystemMessageRepository {
  constructor(private readonly client: PrismaClient) {}
  async createSystemMessage(
    campaignId: string,
    content: string,
    metadata: Record<string, unknown> | undefined,
  ) {
    return this.client.message.create({
      data: {
        campaignId,
        userId: null,
        type: "SYSTEM",
        content,
        metadata: metadata
          ? (metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
      select: { id: true, createdAt: true },
    });
  }
}
