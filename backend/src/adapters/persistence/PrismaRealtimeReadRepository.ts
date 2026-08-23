import type { PrismaClient } from "@prisma/client";
import type {
  RealtimeMapView,
  RealtimeReadRepository,
} from "../../ports/RealtimeReadRepository";

export class PrismaRealtimeReadRepository implements RealtimeReadRepository {
  constructor(private readonly client: PrismaClient) {}

  user(userId: string) {
    return this.client.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, mustChangePassword: true },
    });
  }

  campaign(campaignId: string) {
    return this.client.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        ownerId: true,
        status: true,
        spiritLayerEnabled: true,
        currentMapId: true,
      },
    });
  }

  membership(userId: string, campaignId: string) {
    return this.client.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
      select: { userId: true, role: true },
    });
  }

  memberships(campaignId: string, userIds: readonly string[]) {
    return this.client.campaignMembership.findMany({
      where: { campaignId, userId: { in: [...userIds] } },
      select: { userId: true, role: true },
    });
  }

  async map(mapId: string): Promise<RealtimeMapView | null> {
    return (await this.client.map.findUnique({
      where: { id: mapId },
    })) as unknown as RealtimeMapView | null;
  }

  async mapSummaries(campaignId: string) {
    return this.client.map.findMany({
      where: { campaignId },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        width: true,
        height: true,
        gridSize: true,
        feetPerSquare: true,
        diagonalRule: true,
        lightingEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }
  async initiative(campaignId: string) {
    const campaign = await this.client.campaign.findUnique({
      where: { id: campaignId },
      select: { initiativeState: true, initiativeRevision: true },
    });
    return campaign
      ? {
          state: {
            ...(campaign.initiativeState as Record<string, unknown>),
            revision: campaign.initiativeRevision,
          },
        }
      : null;
  }
}
