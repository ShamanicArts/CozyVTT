import { PrismaClient } from "@prisma/client";
import { CampaignQueryRepository } from "../../ports/CampaignQueryRepository";
export class PrismaCampaignQueryRepository implements CampaignQueryRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async membership(userId: string, campaignId: string) {
    return (
      (
        await this.prisma.campaignMembership.findUnique({
          where: { userId_campaignId: { userId, campaignId } },
          select: { role: true },
        })
      )?.role ?? null
    );
  }
  summary(campaignId: string) {
    return this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        currentVibe: true,
        spiritLayerEnabled: true,
      },
    }) as any;
  }
  maps(c: string, l: number, o: number) {
    return this.prisma.map.findMany({
      where: { campaignId: c },
      take: l,
      skip: o,
      orderBy: { createdAt: "desc" },
    }) as any;
  }
  async currentMap(c: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: c },
      include: { currentMap: true },
    });
    return (campaign?.currentMap as any) ?? null;
  }
  roster(c: string, l: number, o: number) {
    return this.prisma.campaignMembership.findMany({
      where: { campaignId: c },
      take: l,
      skip: o,
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    }) as any;
  }
  characters(c: string, l: number, o: number) {
    return this.prisma.character.findMany({
      where: { campaignId: c },
      take: l,
      skip: o,
    }) as any;
  }
  async initiative(c: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: c },
      select: { initiativeState: true, initiativeRevision: true },
    });
    return campaign
      ? {
          ...(campaign.initiativeState as Record<string, unknown>),
          revision: campaign.initiativeRevision,
        }
      : null;
  }
  chat(c: string, l: number) {
    return this.prisma.message.findMany({
      where: { campaignId: c },
      take: l,
      orderBy: { createdAt: "desc" },
    }) as any;
  }
  dice(c: string, l: number) {
    return this.prisma.diceRoll.findMany({
      where: { campaignId: c },
      take: l,
      orderBy: { rolledAt: "desc" },
    }) as any;
  }
  assets(c: string, l: number, o: number) {
    return this.prisma.asset.findMany({
      where: { campaignId: c },
      take: l,
      skip: o,
      orderBy: { createdAt: "desc" },
    }) as any;
  }
  templates(c: string, l: number, o: number) {
    return this.prisma.tokenTemplate.findMany({
      where: { campaignId: c },
      take: l,
      skip: o,
    }) as any;
  }
  creatures(c: string, l: number, o: number) {
    return this.prisma.creatureTemplate.findMany({
      where: { OR: [{ campaignId: c }, { campaignId: null }] },
      take: l,
      skip: o,
    }) as any;
  }
}
