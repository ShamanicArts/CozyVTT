import {
  AddInitiativeCombatant,
  AdvanceInitiativeTurn,
  EndInitiativeCombat,
  RemoveInitiativeCombatant,
  ReorderInitiative,
  RollInitiative,
  SetInitiativeValue,
  StartInitiativeCombat,
} from './InitiativeCommands';
import { DiceRollError, DiceRollResult } from '../../domain/dice/DiceRoll';
import { InitiativeState, InitiativeToken } from '../../domain/initiative/Initiative';
import { DiceExpressionRoller } from '../../ports/DiceExpressionRoller';
import { InitiativeCombatStateStore } from '../../ports/InitiativeCombatStateStore';
import { InitiativeRepository } from '../../ports/InitiativeRepository';

const token = (id: string, name: string, initiative: number | null = null): InitiativeToken => ({
  id,
  name,
  imageUrl: `/${id}.png`,
  initiative,
  hp: { current: 10, max: 10, temp: 0 },
  type: 'npc',
  disposition: 'hostile',
});

function emptyState(): InitiativeState {
  return { active: false, round: 0, currentTokenId: null, combatants: [] };
}

function makeStore(initial: InitiativeState = emptyState()): InitiativeCombatStateStore {
  let state = initial;
  return {
    get: jest.fn(() => state),
    set: jest.fn((_campaignId, next) => { state = next; }),
    clear: jest.fn(() => { state = emptyState(); }),
  };
}

function makeRepository(tokens: InitiativeToken[] = [token('token-1', 'Mira')]): InitiativeRepository {
  return {
    findMap: jest.fn(async () => ({ id: 'map-1', campaignId: 'campaign-1', tokens })),
    updateTokens: jest.fn(async () => undefined),
    findUserDisplayName: jest.fn(async () => 'The DM'),
  };
}

const dm = { campaignId: 'campaign-1', userId: 'dm-1', role: 'DM' };

const roller: DiceExpressionRoller = {
  validate: jest.fn(() => undefined),
  roll: jest.fn((): DiceRollResult => ({ expression: '1d20+3', rolls: [], total: 18, formula: '15 + 3' })),
};

describe('initiative application commands', () => {
  it('authorizes an add, creates a combatant from the map token, and sorts the state', async () => {
    const repository = makeRepository([token('slow', 'Slow', 4), token('fast', 'Fast', 18)]);
    const store = makeStore();
    const command = new AddInitiativeCombatant(repository, store);

    await command.execute({ type: 'initiative.add', context: dm, tokenId: 'slow', mapId: 'map-1' });
    const state = await command.execute({ type: 'initiative.add', context: dm, tokenId: 'fast', mapId: 'map-1' });

    expect(state.combatants.map((combatant) => combatant.tokenId)).toEqual(['fast', 'slow']);
    await expect(command.execute({ type: 'initiative.add', context: { ...dm, role: 'PLAYER' }, tokenId: 'slow', mapId: 'map-1' }))
      .rejects.toMatchObject({ message: 'Only the DM can modify initiative' });
  });

  it('persists a set token value before it updates the ephemeral combat state', async () => {
    const calls: string[] = [];
    const repository = makeRepository();
    repository.updateTokens = jest.fn(async () => { calls.push('persist'); });
    const store = makeStore({
      ...emptyState(),
      combatants: [{ tokenId: 'token-1', name: 'Mira', imageUrl: '/token-1.png', initiative: null, hp: { current: 10, max: 10, temp: 0 }, type: 'npc', disposition: 'hostile' }],
    });
    store.set = jest.fn(() => { calls.push('state'); });

    const state = await new SetInitiativeValue(repository, store).execute({
      type: 'initiative.set', context: dm, tokenId: 'token-1', mapId: 'map-1', value: 12,
    });

    expect(calls).toEqual(['persist', 'state']);
    expect(state.combatants[0].initiative).toBe(12);
  });

  it('rolls initiative, persists it, adds a missing combatant, and returns the legacy dice broadcast shape', async () => {
    const repository = makeRepository();
    const result = await new RollInitiative(repository, makeStore(), roller).execute({
      type: 'initiative.roll', context: dm, tokenId: 'token-1', mapId: 'map-1', expression: '1d20+3', characterName: 'Mira Fen',
    });

    expect(repository.updateTokens).toHaveBeenCalledWith('map-1', expect.arrayContaining([expect.objectContaining({ id: 'token-1', initiative: 18 })]));
    expect(result.state.combatants).toEqual([expect.objectContaining({ tokenId: 'token-1', initiative: 18 })]);
    expect(result.roll).toMatchObject({ userId: 'dm-1', userName: 'The DM', characterName: 'Mira Fen', expression: '1d20+3', result: 18, purpose: 'Mira Initiative', secret: false });
  });

  it('maps dice syntax failures to the established initiative validation error', async () => {
    const invalidRoller: DiceExpressionRoller = {
      validate: jest.fn(() => { throw new DiceRollError('INVALID_EXPRESSION', 'Invalid token: nope'); }),
      roll: jest.fn(),
    };
    await expect(new RollInitiative(makeRepository(), makeStore(), invalidRoller).execute({
      type: 'initiative.roll', context: dm, tokenId: 'token-1', mapId: 'map-1', expression: 'nope',
    })).rejects.toMatchObject({ message: 'Invalid expression: Invalid token: nope' });
  });

  it('keeps custom reordering and progresses round state through start, next, remove, and end', async () => {
    const initial: InitiativeState = {
      active: false,
      round: 0,
      currentTokenId: null,
      combatants: [
        { tokenId: 'a', name: 'A', imageUrl: '', initiative: 10, hp: null, type: 'npc', disposition: null },
        { tokenId: 'b', name: 'B', imageUrl: '', initiative: 8, hp: null, type: 'npc', disposition: null },
        { tokenId: 'c', name: 'C', imageUrl: '', initiative: 5, hp: null, type: 'npc', disposition: null },
      ],
    };
    const store = makeStore(initial);
    const repository = makeRepository();
    const reordered = await new ReorderInitiative(repository, store).execute({ type: 'initiative.reorder', context: dm, orderedTokenIds: ['b', 'a'] });
    expect(reordered.combatants.map((combatant) => combatant.tokenId)).toEqual(['b', 'a', 'c']);

    const started = await new StartInitiativeCombat(repository, store).execute({ type: 'initiative.start', context: dm });
    expect(started).toMatchObject({ active: true, round: 1, currentTokenId: 'b' });
    await new AdvanceInitiativeTurn(repository, store).execute({ type: 'initiative.next', context: dm });
    await new AdvanceInitiativeTurn(repository, store).execute({ type: 'initiative.next', context: dm });
    const wrapped = await new AdvanceInitiativeTurn(repository, store).execute({ type: 'initiative.next', context: dm });
    expect(wrapped).toMatchObject({ round: 2, currentTokenId: 'b' });

    const removed = await new RemoveInitiativeCombatant(repository, store).execute({ type: 'initiative.remove', context: dm, tokenId: 'b' });
    expect(removed.currentTokenId).toBe('a');
    const ended = await new EndInitiativeCombat(repository, store).execute({ type: 'initiative.end', context: dm });
    expect(ended).toEqual(emptyState());
    expect(store.clear).toHaveBeenCalledWith('campaign-1');
  });
});
