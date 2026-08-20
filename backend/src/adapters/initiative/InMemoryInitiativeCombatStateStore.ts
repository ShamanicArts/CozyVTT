import { InitiativeCombatStateStore } from '../../ports/InitiativeCombatStateStore';
import { InitiativeState } from '../../domain/initiative/Initiative';
import { clearState, getState, setState } from '../../websocket/initiativeState';

/** Adapts the existing deliberately-ephemeral Socket.IO combat-state store. */
export class InMemoryInitiativeCombatStateStore implements InitiativeCombatStateStore {
  get(campaignId: string): InitiativeState {
    return getState(campaignId) as InitiativeState;
  }

  set(campaignId: string, state: InitiativeState): void {
    setState(campaignId, state as ReturnType<typeof getState>);
  }

  clear(campaignId: string): void {
    clearState(campaignId);
  }
}
