import type { PrismaClient } from "@prisma/client";
import type { CharacterQueryRepository } from "../../ports/CharacterQueryRepository";

export class PrismaCharacterQueryRepository
  implements CharacterQueryRepository
{
  constructor(private readonly client: PrismaClient) {}

  async ownedBy(userId: string) {
    return this.client.character.findMany({
      where: { userId },
      include: { campaign: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async find(id: string) {
    return this.client.character.findUnique({
      where: { id },
      include: {
        campaign: { select: { id: true, name: true } },
        user: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
    });
  }

  async isCampaignMember(userId: string, campaignId: string) {
    return Boolean(
      await this.client.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
        select: { userId: true },
      }),
    );
  }
}
