import {
  captureGameState,
  restoreGameState,
} from "../../services/sessionState";
import { CampaignSessionState } from "../../ports/CampaignSessionState";

/** Adapts the established state service to the campaign-session application port. */
export class LegacyCampaignSessionState implements CampaignSessionState {
  capture(campaignId: string, sessionId: string): Promise<unknown> {
    return captureGameState(campaignId, sessionId);
  }

  async restore(campaignId: string, state: unknown): Promise<void> {
    await restoreGameState(
      campaignId,
      state as Parameters<typeof restoreGameState>[1],
    );
  }
}
