import { VibePeriod } from "../utils/vibe-presets";

/**
 * Delivers the public campaign-realtime events produced by shared commands.
 *
 * The application layer owns when these events happen; a transport adapter
 * decides how connected clients receive them. Keeping the wire payloads here
 * prevents an agent invocation from becoming a persistence-only mutation.
 */
export interface CampaignRealtimeEventPublisher {
  atmosphereEffectUpdated(
    campaignId: string,
    payload: {
      effect: string | null;
      setBy: string | null;
      timestamp: string;
    },
  ): void;
  atmosphereAudioUpdated(
    campaignId: string,
    payload: {
      assetId: string | null;
      audioUrl: string | null;
      volume: number;
      loop: boolean;
      setBy: string | null;
      timestamp: string;
    },
  ): void;
  vibeUpdated(
    campaignId: string,
    payload: {
      period: VibePeriod["name"];
      hue: VibePeriod["hue"];
      filter: VibePeriod["filter"];
      audio: VibePeriod["audio"];
      updatedBy: string | null;
      timestamp: string;
    },
  ): void;
}
