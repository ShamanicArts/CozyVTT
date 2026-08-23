import type { CampaignHttpQueryRepository } from "../../ports/CampaignHttpQueryRepository";

export class CampaignHttpQueryError extends Error {
  constructor(
    readonly status: 404,
    readonly error: "Not Found",
    message: string,
  ) {
    super(message);
    this.name = "CampaignHttpQueryError";
  }
}

export class CampaignHttpQueries {
  constructor(private readonly campaigns: CampaignHttpQueryRepository) {}

  async forUser(userId: string) {
    return (await this.campaigns.membershipsForUser(userId)).map((item: any) => ({
      ...item.campaign,
      userRole: item.role,
      characterIds: item.characterIds,
    }));
  }

  async details(campaignId: string, role: string) {
    const campaign: any = await this.campaigns.details(campaignId);
    if (!campaign)
      throw new CampaignHttpQueryError(404, "Not Found", "Campaign not found");
    const { sessions, ...rest } = campaign;
    return {
      ...rest,
      activeSession: sessions?.[0] ?? null,
      userRole: role,
    };
  }

  async characterRoster(campaignId: string) {
    const { memberships, characters } =
      await this.campaigns.characterRoster(campaignId);
    return memberships.map((membership: any) => ({
      userId: membership.userId,
      userName: membership.user.displayName,
      userAvatar: membership.user.avatarUrl,
      role: membership.role,
      joinedAt: membership.joinedAt,
      characters: characters
        .filter((character: any) => membership.characterIds.includes(character.id))
        .map(({ data, ...character }: any) => ({
          ...character,
          hp: extractCharacterHp(character.gameSystem, data),
        })),
    }));
  }

  invitableUsers(campaignId: string) {
    return this.campaigns.invitableUsers(campaignId);
  }

  all() {
    return this.campaigns.allCampaigns();
  }

  async messages(campaignId: string, limit: number, offset: number) {
    const result = await this.campaigns.messages(campaignId, limit, offset);
    return {
      messages: result.messages
        .filter((message: any) => message.type !== "DICE_ROLL")
        .map((message: any) => ({
          id: message.id,
          userId: message.userId,
          userName: message.user?.displayName || null,
          user: message.user
            ? { id: message.user.id, displayName: message.user.displayName }
            : null,
          content: message.content,
          type: message.type,
          metadata: message.metadata || null,
          createdAt: message.createdAt.toISOString(),
        })),
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: offset + limit < result.total,
      },
    };
  }
}

function extractCharacterHp(gameSystem: string | null, data: any) {
  if (!data || !gameSystem) return null;
  if (["DND_5E", "PATHFINDER_2E", "FLEXIBLE"].includes(gameSystem)) {
    if (typeof data.hp?.maximum !== "number" || data.hp.maximum <= 0) return null;
    return {
      current:
        typeof data.hp.current === "number" ? data.hp.current : data.hp.maximum,
      max: data.hp.maximum,
      temp: typeof data.hp.temporary === "number" ? data.hp.temporary : 0,
    };
  }
  if (gameSystem === "CALL_OF_CTHULHU_7E") {
    const hp = data.derivedStats?.hp;
    if (typeof hp?.maximum !== "number" || hp.maximum <= 0) return null;
    return {
      current: typeof hp.current === "number" ? hp.current : hp.maximum,
      max: hp.maximum,
      temp: 0,
    };
  }
  return null;
}
