import type { CampaignEventPublisher } from "../../ports/CampaignEventPublisher";

export class CampaignEvents {
  constructor(private readonly publisher: CampaignEventPublisher) {}
  publish(
    campaignId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    this.publisher.publish(campaignId, event, payload);
  }
}
