import { InitiativeState } from '../domain/initiative/Initiative';

export interface VersionedInitiativeState {
  state: InitiativeState;
  revision: number;
}

/** Durable, campaign-scoped combat state boundary with optimistic concurrency. */
export interface InitiativeCombatStateStore {
  get(campaignId: string): Promise<VersionedInitiativeState>;
  set(
    campaignId: string,
    expectedRevision: number,
    state: InitiativeState,
  ): Promise<VersionedInitiativeState>;
  clear(
    campaignId: string,
    expectedRevision: number,
  ): Promise<VersionedInitiativeState>;
}
