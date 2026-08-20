/** Side-effect boundary for character campaign events. */
export interface CharacterEventPublisher {
  publish(campaignId: string, event: string, payload: unknown): void;
}
