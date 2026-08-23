export interface CharacterQueryRepository {
  ownedBy(userId: string): Promise<Record<string, unknown>[]>;
  find(id: string): Promise<Record<string, unknown> | null>;
  isCampaignMember(userId: string, campaignId: string): Promise<boolean>;
}
