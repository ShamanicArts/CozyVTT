import { RateLimiter } from '../../websocket/shared';
import { CampaignDiceRollRateGate } from '../../ports/CampaignDiceRollRateGate';

/** Reuses the existing process-wide Socket.IO dice limiter behind a policy port. */
export class SocketCampaignDiceRollRateGate implements CampaignDiceRollRateGate {
  constructor(private readonly limiter: RateLimiter) {}

  tryAcquire(userId: string): boolean {
    return this.limiter.check(userId, 30, 60 * 1000);
  }
}
