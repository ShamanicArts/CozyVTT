import type { CampaignQueryRole } from "./CampaignQueryRepository";

export interface CampaignSnapshotRepository {
  load(input: {
    campaignId: string;
    principalId: string;
    role: CampaignQueryRole;
  }): Promise<Record<string, unknown> | null>;
}
