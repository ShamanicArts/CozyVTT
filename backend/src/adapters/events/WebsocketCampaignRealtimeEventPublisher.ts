import { CampaignRealtimeEventPublisher } from "../../ports/CampaignRealtimeEventPublisher";
import { broadcastToCampaign } from "../../websocket/socketInstance";

/** Socket.IO adapter for public campaign-realtime command events. */
export class WebsocketCampaignRealtimeEventPublisher implements CampaignRealtimeEventPublisher {
  atmosphereEffectUpdated(
    campaignId: string,
    payload: {
      effect: string | null;
      setBy: string | null;
      timestamp: string;
    },
  ): void {
    broadcastToCampaign(campaignId, "atmosphere.effect.updated", payload);
  }

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
  ): void {
    broadcastToCampaign(campaignId, "atmosphere.audio.updated", payload);
  }

  vibeUpdated(
    campaignId: string,
    payload: {
      period: string;
      hue: string;
      filter: string;
      audio: string | null;
      updatedBy: string | null;
      timestamp: string;
    },
  ): void {
    broadcastToCampaign(campaignId, "vibe.updated", payload);
  }
}
