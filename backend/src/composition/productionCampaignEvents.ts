import { WebsocketCampaignEventPublisher } from "../adapters/events/WebsocketCampaignEventPublisher";
import { CampaignEvents } from "../application/events/CampaignEvents";

export const productionCampaignEvents = new CampaignEvents(
  new WebsocketCampaignEventPublisher(),
);
