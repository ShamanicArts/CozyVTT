import type {
  RealtimeMapView,
  RealtimeReadRepository,
  RealtimeRole,
} from "../../ports/RealtimeReadRepository";

interface SpiritToken {
  controlledBy?: string | null;
  layer?: string;
  visible?: boolean;
}

export class RealtimeQueries {
  constructor(private readonly repository: RealtimeReadRepository) {}

  async authenticatedUser(userId: string) {
    const user = await this.repository.user(userId);
    return user && !user.mustChangePassword ? user : null;
  }

  async campaignRole(
    userId: string,
    campaignId: string,
  ): Promise<RealtimeRole | null> {
    const [campaign, membership] = await Promise.all([
      this.repository.campaign(campaignId),
      this.repository.membership(userId, campaignId),
    ]);
    return campaign && membership ? membership.role : null;
  }

  async displayName(userId: string): Promise<string | null> {
    return (await this.repository.user(userId))?.displayName ?? null;
  }

  async mapForCampaign(
    campaignId: string,
    mapId: string,
  ): Promise<RealtimeMapView | null> {
    const map = await this.repository.map(mapId);
    return map?.campaignId === campaignId ? map : null;
  }

  mapSummaries(campaignId: string) {
    return this.repository.mapSummaries(campaignId);
  }

  initiative(campaignId: string) {
    return this.repository.initiative(campaignId);
  }

  async currentMap(campaignId: string): Promise<RealtimeMapView | null> {
    const campaign = await this.repository.campaign(campaignId);
    return campaign?.currentMapId
      ? this.mapForCampaign(campaignId, campaign.currentMapId)
      : null;
  }

  async isCampaignOwner(userId: string, campaignId: string): Promise<boolean> {
    return (await this.repository.campaign(campaignId))?.ownerId === userId;
  }

  async canSeeSpiritLayer(
    campaignId: string,
    userId: string,
  ): Promise<boolean> {
    return (
      (await this.spiritVisibility(campaignId, [userId])).get(userId) ?? false
    );
  }

  async spiritVisibility(
    campaignId: string,
    userIds: readonly string[],
  ): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) return result;

    const [memberships, campaign] = await Promise.all([
      this.repository.memberships(campaignId, uniqueIds),
      this.repository.campaign(campaignId),
    ]);
    const roleByUser = new Map(
      memberships.map((membership) => [membership.userId, membership.role]),
    );

    let spiritTokens: SpiritToken[] = [];
    const needsCrossover =
      campaign != null &&
      !campaign.spiritLayerEnabled &&
      campaign.currentMapId != null &&
      uniqueIds.some((id) => {
        const role = roleByUser.get(id);
        return role != null && role !== "DM";
      });
    if (needsCrossover && campaign?.currentMapId) {
      const map = await this.repository.map(campaign.currentMapId);
      spiritTokens = (Array.isArray(map?.tokens) ? map.tokens : []).filter(
        (token): token is SpiritToken =>
          typeof token === "object" &&
          token !== null &&
          (token as SpiritToken).layer === "spirit" &&
          (token as SpiritToken).visible === true,
      );
    }

    for (const userId of uniqueIds) {
      const role = roleByUser.get(userId);
      if (!role || !campaign) result.set(userId, false);
      else if (role === "DM" || campaign.spiritLayerEnabled)
        result.set(userId, true);
      else
        result.set(
          userId,
          spiritTokens.some((token) => token.controlledBy === userId),
        );
    }
    return result;
  }
}
