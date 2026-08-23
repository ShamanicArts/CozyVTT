import { PrismaClient } from "@prisma/client";
import { CampaignQueryRepository } from "../../ports/CampaignQueryRepository";
import type { CampaignHttpQueryRepository } from "../../ports/CampaignHttpQueryRepository";
export class PrismaCampaignQueryRepository
  implements CampaignQueryRepository, CampaignHttpQueryRepository
{
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
  membershipsForUser(userId: string) {
    return this.prisma.campaignMembership.findMany({
      where: { userId },
      include: {
        campaign: {
          include: {
            owner: {
              select: { id: true, displayName: true, avatarUrl: true },
            },
            memberships: {
              include: {
                user: {
                  select: { id: true, displayName: true, avatarUrl: true },
                },
              },
            },
          },
        },
      },
    }) as any;
  }
  details(campaignId: string) {
    return this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        owner: { select: { id: true, displayName: true, avatarUrl: true } },
        memberships: {
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true } },
          },
        },
        maps: {
          select: {
            id: true,
            campaignId: true,
            name: true,
            imageUrl: true,
            width: true,
            height: true,
            gridSize: true,
            feetPerSquare: true,
            diagonalRule: true,
            baseLayerUrl: true,
            spiritLayerUrl: true,
            lightingEnabled: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        characters: {
          select: {
            id: true,
            userId: true,
            campaignId: true,
            gameSystem: true,
            name: true,
            tokenImageUrl: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        sessions: {
          where: { endedAt: null },
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { id: true, sessionNumber: true, startedAt: true },
        },
      },
    }) as any;
  }
  async characterRoster(campaignId: string) {
    const memberships = await this.prisma.campaignMembership.findMany({
      where: { campaignId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    const characters = await this.prisma.character.findMany({
      where: { id: { in: memberships.flatMap((item) => item.characterIds) } },
      select: {
        id: true,
        name: true,
        tokenImageUrl: true,
        gameSystem: true,
        userId: true,
        data: true,
      },
    });
    return { memberships, characters } as any;
  }
  async invitableUsers(campaignId: string) {
    const [memberships, invitations] = await Promise.all([
      this.prisma.campaignMembership.findMany({
        where: { campaignId },
        select: { userId: true },
      }),
      this.prisma.campaignInvitation.findMany({
        where: { campaignId, status: "PENDING" },
        select: { userId: true },
      }),
    ]);
    return this.prisma.user.findMany({
      where: {
        id: {
          notIn: [...memberships, ...invitations].map(({ userId }) => userId),
        },
      },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, avatarUrl: true },
    });
  }
  allCampaigns() {
    return this.prisma.campaign.findMany({
      include: {
        owner: { select: { id: true, displayName: true, email: true } },
        _count: {
          select: { memberships: true, maps: true, characters: true },
        },
      },
    }) as any;
  }
  async messages(campaignId: string, limit: number, offset: number) {
    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { campaignId },
        include: { user: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.message.count({ where: { campaignId } }),
    ]);
    return { messages, total } as any;
  }
}
