export type CampaignQueryRole = "DM" | "PLAYER" | "SPECTATOR";
export interface CampaignChatItem {
  type: string;
}
export interface CampaignDiceItem {
  secret: boolean;
}
export interface CampaignQueryRepository {
  membership(
    userId: string,
    campaignId: string,
  ): Promise<CampaignQueryRole | null>;
  summary(campaignId: string): Promise<object | null>;
  maps(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<object[]>;
  currentMap(campaignId: string): Promise<object | null>;
  roster(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<object[]>;
  characters(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<object[]>;
  initiative(campaignId: string): Promise<Record<string, unknown> | null>;
  chat(campaignId: string, limit: number): Promise<CampaignChatItem[]>;
  dice(campaignId: string, limit: number): Promise<CampaignDiceItem[]>;
  assets(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<object[]>;
  templates(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<object[]>;
  creatures(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<object[]>;
}
