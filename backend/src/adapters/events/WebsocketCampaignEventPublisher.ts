import type { CampaignEventPublisher } from "../../ports/CampaignEventPublisher";
import { broadcastToCampaign } from "../../websocket/utils";

export class WebsocketCampaignEventPublisher
  implements CampaignEventPublisher
{
  publish(
    campaignId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    broadcastToCampaign(campaignId, event, payload);
  }
}
