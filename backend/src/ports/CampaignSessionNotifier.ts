export interface CampaignSessionNotification {
  campaignId: string;
  event: "session.started" | "session.paused" | "session.ended" | "session.resumed";
  message: string;
  payload: Record<string, unknown>;
}

export interface CampaignSessionNotifier {
  notify(input: CampaignSessionNotification): Promise<void>;
}
