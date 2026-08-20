/** Snapshot boundary: state capture/restore can later be replaced independently of sessions. */
export interface CampaignSessionState {
  capture(campaignId: string, sessionId: string): Promise<unknown>;
  restore(campaignId: string, state: unknown): Promise<void>;
}
