/** Persistence boundary for campaign-level realtime controls. */
export interface CampaignRealtimeRepository {
  findVibe(
    campaignId: string,
  ): Promise<{ vibeSettings: unknown; currentVibe: string | null } | null>;
  updateVibeSettings(campaignId: string, vibeSettings: unknown): Promise<void>;
  updateCurrentVibe(campaignId: string, currentVibe: string): Promise<void>;
  findAudioAsset(
    assetId: string,
  ): Promise<{
    id: string;
    type: string;
    scope: string;
    campaignId: string | null;
  } | null>;
}
