export type CampaignQueryRole = "DM" | "PLAYER" | "SPECTATOR";
export interface CampaignQueryRepository {
  membership(
    userId: string,
    campaignId: string,
  ): Promise<CampaignQueryRole | null>;
  summary(campaignId: string): Promise<Record<string, unknown> | null>;
  maps(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<Record<string, unknown>[]>;
  currentMap(campaignId: string): Promise<Record<string, unknown> | null>;
  roster(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<Record<string, unknown>[]>;
  characters(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<Record<string, unknown>[]>;
  initiative(campaignId: string): Promise<Record<string, unknown> | null>;
  chat(campaignId: string, limit: number): Promise<Record<string, unknown>[]>;
  dice(campaignId: string, limit: number): Promise<Record<string, unknown>[]>;
  assets(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<Record<string, unknown>[]>;
  templates(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<Record<string, unknown>[]>;
  creatures(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<Record<string, unknown>[]>;
}
