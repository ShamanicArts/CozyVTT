export type CampaignActivityKind =
  | "narrative"
  | "mechanic"
  | "scene"
  | "session"
  | "system";

export type CampaignActivityImportance =
  | "routine"
  | "consequential"
  | "error";

export interface CampaignActivityRealtimePublisher {
  publish(input: {
    campaignId: string;
    id: string;
    content: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }): Promise<void>;
}
