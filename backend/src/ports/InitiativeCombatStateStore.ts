import { InitiativeState } from '../domain/initiative/Initiative';

/** Ephemeral, campaign-scoped combat state boundary. */
export interface InitiativeCombatStateStore {
  get(campaignId: string): InitiativeState;
  set(campaignId: string, state: InitiativeState): void;
  clear(campaignId: string): void;
}
