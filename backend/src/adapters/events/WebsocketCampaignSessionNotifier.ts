import type {
  CampaignSessionNotification,
  CampaignSessionNotifier,
} from "../../ports/CampaignSessionNotifier";
import { broadcastToCampaign, sendSystemMessage } from "../../websocket/utils";

export class WebsocketCampaignSessionNotifier
  implements CampaignSessionNotifier
{
  async notify(input: CampaignSessionNotification): Promise<void> {
    await sendSystemMessage(input.campaignId, input.message, {
      ...input.payload,
      action: input.event,
    });
    broadcastToCampaign(input.campaignId, input.event, input.payload);
  }
}
