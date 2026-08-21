import {
  InitiativeCombatStateStore,
  VersionedInitiativeState,
} from '../../ports/InitiativeCombatStateStore';
import { InitiativeState } from '../../domain/initiative/Initiative';
import { clearState, getState, setState } from '../../websocket/initiativeState';

/** Test/compatibility adapter; production uses the Prisma-backed state store. */
export class InMemoryInitiativeCombatStateStore implements InitiativeCombatStateStore {
  private readonly revisions = new Map<string, number>();

  async get(campaignId: string): Promise<VersionedInitiativeState> {
    return {
      state: getState(campaignId) as InitiativeState,
      revision: this.revisions.get(campaignId) ?? 0,
    };
  }

  async set(
    campaignId: string,
    expectedRevision: number,
    state: InitiativeState,
  ): Promise<VersionedInitiativeState> {
    const revision = this.revisions.get(campaignId) ?? 0;
    if (revision !== expectedRevision) {
      throw new InitiativeStateConflictError();
    }
    setState(campaignId, state as ReturnType<typeof getState>);
    this.revisions.set(campaignId, revision + 1);
    return { state, revision: revision + 1 };
  }

  async clear(
    campaignId: string,
    expectedRevision: number,
  ): Promise<VersionedInitiativeState> {
    const revision = this.revisions.get(campaignId) ?? 0;
    if (revision !== expectedRevision) {
      throw new InitiativeStateConflictError();
    }
    clearState(campaignId);
    this.revisions.set(campaignId, revision + 1);
    return { state: getState(campaignId), revision: revision + 1 };
  }
}

export class InitiativeStateConflictError extends Error {
  constructor() {
    super("Initiative state changed; refresh and retry");
    this.name = "InitiativeStateConflictError";
  }
}
