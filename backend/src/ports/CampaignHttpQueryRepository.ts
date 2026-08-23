export interface CampaignHttpQueryRepository {
  membershipsForUser(userId: string): Promise<Record<string, unknown>[]>;
  details(campaignId: string): Promise<Record<string, unknown> | null>;
  characterRoster(campaignId: string): Promise<{
    memberships: Record<string, any>[];
    characters: Record<string, any>[];
  }>;
  invitableUsers(campaignId: string): Promise<Record<string, unknown>[]>;
  allCampaigns(): Promise<Record<string, unknown>[]>;
  messages(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<{ messages: Record<string, any>[]; total: number }>;
}
