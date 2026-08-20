/**
 * The cooldown policy is a port because deployments may use an in-memory,
 * Redis, or database-backed rate limiter without changing the use case.
 */
export interface CampaignChatCooldownGate {
  tryAcquire(userId: string, campaignId: string, cooldownSeconds: number): boolean;
}
