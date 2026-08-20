import { RateLimiter } from '../../websocket/shared';
import { CampaignChatCooldownGate } from '../../ports/CampaignChatCooldownGate';

/** Reuses the existing process-wide Socket.IO chat limiter behind a policy port. */
export class SocketCampaignChatCooldownGate implements CampaignChatCooldownGate {
  constructor(private readonly limiter: RateLimiter) {}

  tryAcquire(userId: string, campaignId: string, cooldownSeconds: number): boolean {
    return this.limiter.check(`${userId}:${campaignId}`, 1, cooldownSeconds * 1000);
  }
}
