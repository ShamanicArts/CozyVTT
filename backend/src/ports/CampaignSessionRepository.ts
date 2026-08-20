import { CampaignSessionRecord } from "../domain/campaigns/SessionLifecycle";

/** Persistence boundary for campaign session lifecycle commands. */
export interface CampaignSessionRepository {
  findCampaignStatus(campaignId: string): Promise<{ status: string } | null>;
  nextSessionNumber(campaignId: string): Promise<number>;
  createSession(
    campaignId: string,
    sessionNumber: number,
  ): Promise<CampaignSessionRecord>;
  findSession(
    campaignId: string,
    sessionId: string,
  ): Promise<CampaignSessionRecord | null>;
  findLastSession(campaignId: string): Promise<CampaignSessionRecord | null>;
  saveSessionState(sessionId: string, state: unknown): Promise<void>;
  endSession(
    sessionId: string,
    data: { endedAt: Date; savedState: unknown | null; notes?: string },
  ): Promise<void>;
  reopenSession(sessionId: string): Promise<void>;
  updateCampaignStatus(
    campaignId: string,
    status: "ACTIVE" | "PAUSED" | "INACTIVE",
    lastPlayedAt?: Date,
  ): Promise<void>;
}
