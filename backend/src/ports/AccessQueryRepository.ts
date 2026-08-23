export type CampaignAccessRole = "DM" | "PLAYER" | "SPECTATOR";

export interface CampaignAccessMembership {
  role: CampaignAccessRole;
  characterIds: string[];
  campaignId: string;
}

export interface AccessQueryRepository {
  campaignMembership(
    userId: string,
    campaignId: string,
  ): Promise<CampaignAccessMembership | null>;
  mustChangePassword(userId: string): Promise<boolean | null>;
}
