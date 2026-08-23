export interface CampaignEventPublisher {
  publish(
    campaignId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void;
}
