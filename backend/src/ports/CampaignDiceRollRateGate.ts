/** Per-user dice-rate boundary; implementations decide the backing store. */
export interface CampaignDiceRollRateGate {
  tryAcquire(userId: string): boolean;
}
