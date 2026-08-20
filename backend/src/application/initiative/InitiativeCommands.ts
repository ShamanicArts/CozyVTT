import {
  emptyInitiativeState,
  InitiativeError,
  InitiativeState,
  sortInitiativeCombatants,
  toInitiativeCombatant,
} from '../../domain/initiative/Initiative';
import { DiceRollError, DiceRollResult } from '../../domain/dice/DiceRoll';
import { InitiativeCombatStateStore } from '../../ports/InitiativeCombatStateStore';
import { InitiativeRepository } from '../../ports/InitiativeRepository';
import { DiceExpressionRoller } from '../../ports/DiceExpressionRoller';
import { Command, CommandHandler } from '../commands/CommandBus';

export const ADD_INITIATIVE_COMBATANT = 'initiative.add' as const;
export const REMOVE_INITIATIVE_COMBATANT = 'initiative.remove' as const;
export const SET_INITIATIVE_VALUE = 'initiative.set' as const;
export const ROLL_INITIATIVE = 'initiative.roll' as const;
export const REORDER_INITIATIVE = 'initiative.reorder' as const;
export const START_INITIATIVE_COMBAT = 'initiative.start' as const;
export const ADVANCE_INITIATIVE_TURN = 'initiative.next' as const;
export const END_INITIATIVE_COMBAT = 'initiative.end' as const;

interface InitiativeCommandContext {
  campaignId: string;
  userId: string;
  role: unknown;
}

export interface AddInitiativeCombatantCommand extends Command<InitiativeState> {
  readonly type: typeof ADD_INITIATIVE_COMBATANT;
  readonly context: InitiativeCommandContext;
  readonly tokenId: unknown;
  readonly mapId: unknown;
}

export interface RemoveInitiativeCombatantCommand extends Command<InitiativeState> {
  readonly type: typeof REMOVE_INITIATIVE_COMBATANT;
  readonly context: InitiativeCommandContext;
  readonly tokenId: unknown;
}

export interface SetInitiativeValueCommand extends Command<InitiativeState> {
  readonly type: typeof SET_INITIATIVE_VALUE;
  readonly context: InitiativeCommandContext;
  readonly tokenId: unknown;
  readonly mapId: unknown;
  readonly value: unknown;
}

export interface RollInitiativeCommand extends Command<RollInitiativeResult> {
  readonly type: typeof ROLL_INITIATIVE;
  readonly context: InitiativeCommandContext;
  readonly tokenId: unknown;
  readonly mapId: unknown;
  readonly expression: unknown;
  readonly characterName?: unknown;
}

export interface ReorderInitiativeCommand extends Command<InitiativeState> {
  readonly type: typeof REORDER_INITIATIVE;
  readonly context: InitiativeCommandContext;
  readonly orderedTokenIds: unknown;
}

export interface StartInitiativeCombatCommand extends Command<InitiativeState> {
  readonly type: typeof START_INITIATIVE_COMBAT;
  readonly context: InitiativeCommandContext;
}

export interface AdvanceInitiativeTurnCommand extends Command<InitiativeState> {
  readonly type: typeof ADVANCE_INITIATIVE_TURN;
  readonly context: InitiativeCommandContext;
}

export interface EndInitiativeCombatCommand extends Command<InitiativeState> {
  readonly type: typeof END_INITIATIVE_COMBAT;
  readonly context: InitiativeCommandContext;
}

export interface InitiativeRollBroadcast {
  userId: string;
  userName: string;
  characterName: string;
  expression: string;
  result: number;
  breakdown: DiceRollResult;
  purpose: string;
  timestamp: string;
  secret: false;
}

export interface RollInitiativeResult {
  state: InitiativeState;
  roll: InitiativeRollBroadcast;
  tokenName: string;
}

abstract class InitiativeCommandBase {
  constructor(
    protected readonly repository: InitiativeRepository,
    protected readonly stateStore: InitiativeCombatStateStore
  ) {}

  protected assertDm(context: InitiativeCommandContext, message: string): void {
    if (context.role !== 'DM') throw new InitiativeError('NOT_DM', message);
  }

  protected async findCampaignMap(campaignId: string, mapId: unknown) {
    const map = await this.repository.findMap(mapId as string);
    if (!map || map.campaignId !== campaignId) {
      throw new InitiativeError('MAP_NOT_FOUND', 'Map not found');
    }
    return map;
  }
}

export class AddInitiativeCombatant extends InitiativeCommandBase implements CommandHandler<AddInitiativeCombatantCommand, InitiativeState> {
  async execute(command: AddInitiativeCombatantCommand): Promise<InitiativeState> {
    this.assertDm(command.context, 'Only the DM can modify initiative');
    if (!command.tokenId || !command.mapId) {
      throw new InitiativeError('REQUIRED_FIELDS', 'tokenId and mapId required');
    }
    const map = await this.findCampaignMap(command.context.campaignId, command.mapId);
    const token = map.tokens.find((candidate) => candidate.id === command.tokenId);
    if (!token) throw new InitiativeError('TOKEN_NOT_FOUND', 'Token not found');

    const state = this.stateStore.get(command.context.campaignId);
    if (state.combatants.some((combatant) => combatant.tokenId === command.tokenId)) {
      throw new InitiativeError('DUPLICATE_COMBATANT', 'Token is already in initiative');
    }

    state.combatants = sortInitiativeCombatants([...state.combatants, toInitiativeCombatant(token)]);
    this.stateStore.set(command.context.campaignId, state);
    return state;
  }
}

export class RemoveInitiativeCombatant extends InitiativeCommandBase implements CommandHandler<RemoveInitiativeCombatantCommand, InitiativeState> {
  async execute(command: RemoveInitiativeCombatantCommand): Promise<InitiativeState> {
    this.assertDm(command.context, 'Only the DM can modify initiative');
    if (!command.tokenId) throw new InitiativeError('TOKEN_REQUIRED', 'tokenId required');

    const state = this.stateStore.get(command.context.campaignId);
    state.combatants = state.combatants.filter((combatant) => combatant.tokenId !== command.tokenId);
    if (state.currentTokenId === command.tokenId) {
      state.currentTokenId = state.combatants[0]?.tokenId ?? null;
    }
    this.stateStore.set(command.context.campaignId, state);
    return state;
  }
}

export class SetInitiativeValue extends InitiativeCommandBase implements CommandHandler<SetInitiativeValueCommand, InitiativeState> {
  async execute(command: SetInitiativeValueCommand): Promise<InitiativeState> {
    this.assertDm(command.context, 'Only the DM can modify initiative');
    if (!command.tokenId || !command.mapId) {
      throw new InitiativeError('REQUIRED_FIELDS', 'tokenId and mapId required');
    }
    if (command.value !== null && typeof command.value !== 'number') {
      throw new InitiativeError('INVALID_VALUE', 'value must be a number or null');
    }

    const map = await this.findCampaignMap(command.context.campaignId, command.mapId);
    const tokenIndex = map.tokens.findIndex((candidate) => candidate.id === command.tokenId);
    if (tokenIndex !== -1) {
      const tokens = [...map.tokens];
      tokens[tokenIndex] = { ...tokens[tokenIndex], initiative: command.value as number | null };
      // Preserve old ordering: persistence happens before in-memory state changes.
      await this.repository.updateTokens(map.id, tokens);
    }

    const state = this.stateStore.get(command.context.campaignId);
    const combatantIndex = state.combatants.findIndex((combatant) => combatant.tokenId === command.tokenId);
    if (combatantIndex !== -1) {
      state.combatants[combatantIndex].initiative = command.value as number | null;
      state.combatants = sortInitiativeCombatants(state.combatants);
      this.stateStore.set(command.context.campaignId, state);
    }
    return state;
  }
}

export class RollInitiative extends InitiativeCommandBase implements CommandHandler<RollInitiativeCommand, RollInitiativeResult> {
  constructor(
    repository: InitiativeRepository,
    stateStore: InitiativeCombatStateStore,
    private readonly roller: DiceExpressionRoller
  ) {
    super(repository, stateStore);
  }

  async execute(command: RollInitiativeCommand): Promise<RollInitiativeResult> {
    this.assertDm(command.context, 'Only the DM can roll initiative');
    if (!command.tokenId || !command.mapId || !command.expression) {
      throw new InitiativeError('REQUIRED_FIELDS', 'tokenId, mapId, and expression required');
    }

    try {
      this.roller.validate(command.expression as string);
    } catch (error) {
      if (error instanceof DiceRollError && error.code === 'INVALID_EXPRESSION') {
        throw new InitiativeError('INVALID_EXPRESSION', `Invalid expression: ${error.message}`);
      }
      throw error;
    }

    const map = await this.findCampaignMap(command.context.campaignId, command.mapId);
    const tokenIndex = map.tokens.findIndex((candidate) => candidate.id === command.tokenId);
    if (tokenIndex === -1) throw new InitiativeError('TOKEN_NOT_FOUND', 'Token not found');
    const token = map.tokens[tokenIndex];
    const breakdown = this.roller.roll(command.expression as string);
    const rolledValue = breakdown.total;

    const tokens = [...map.tokens];
    tokens[tokenIndex] = { ...token, initiative: rolledValue };
    // Maintain legacy durability-before-broadcast/state ordering.
    await this.repository.updateTokens(map.id, tokens);

    const state = this.stateStore.get(command.context.campaignId);
    const existingIndex = state.combatants.findIndex((combatant) => combatant.tokenId === command.tokenId);
    if (existingIndex !== -1) {
      state.combatants[existingIndex].initiative = rolledValue;
    } else {
      state.combatants.push(toInitiativeCombatant({ ...token, initiative: rolledValue }));
    }
    state.combatants = sortInitiativeCombatants(state.combatants);
    this.stateStore.set(command.context.campaignId, state);

    const userName = (await this.repository.findUserDisplayName(command.context.userId)) ?? 'DM';
    return {
      state,
      tokenName: token.name,
      roll: {
        userId: command.context.userId,
        userName,
        characterName: (command.characterName || token.name) as string,
        expression: command.expression as string,
        result: rolledValue,
        breakdown,
        purpose: `${token.name} Initiative`,
        timestamp: new Date().toISOString(),
        secret: false,
      },
    };
  }
}

export class ReorderInitiative extends InitiativeCommandBase implements CommandHandler<ReorderInitiativeCommand, InitiativeState> {
  async execute(command: ReorderInitiativeCommand): Promise<InitiativeState> {
    this.assertDm(command.context, 'Only the DM can reorder initiative');
    if (!Array.isArray(command.orderedTokenIds)) {
      throw new InitiativeError('INVALID_ORDER', 'orderedTokenIds must be an array');
    }

    const state = this.stateStore.get(command.context.campaignId);
    const combatantMap = new Map(state.combatants.map((combatant) => [combatant.tokenId, combatant]));
    const reordered = [] as InitiativeState['combatants'];
    for (const id of command.orderedTokenIds) {
      const combatant = combatantMap.get(id);
      if (combatant) reordered.push(combatant);
    }
    for (const combatant of state.combatants) {
      if (!reordered.includes(combatant)) reordered.push(combatant);
    }
    state.combatants = reordered;
    this.stateStore.set(command.context.campaignId, state);
    return state;
  }
}

export class StartInitiativeCombat extends InitiativeCommandBase implements CommandHandler<StartInitiativeCombatCommand, InitiativeState> {
  async execute(command: StartInitiativeCombatCommand): Promise<InitiativeState> {
    this.assertDm(command.context, 'Only the DM can start combat');
    const state = this.stateStore.get(command.context.campaignId);
    if (state.combatants.length === 0) {
      throw new InitiativeError('NO_COMBATANTS', 'Add combatants before starting combat');
    }
    state.active = true;
    state.round = 1;
    state.currentTokenId = state.combatants[0].tokenId;
    this.stateStore.set(command.context.campaignId, state);
    return state;
  }
}

export class AdvanceInitiativeTurn extends InitiativeCommandBase implements CommandHandler<AdvanceInitiativeTurnCommand, InitiativeState> {
  async execute(command: AdvanceInitiativeTurnCommand): Promise<InitiativeState> {
    this.assertDm(command.context, 'Only the DM can advance the turn');
    const state = this.stateStore.get(command.context.campaignId);
    if (!state.active || state.combatants.length === 0) {
      throw new InitiativeError('COMBAT_INACTIVE', 'Combat is not active');
    }
    const currentIndex = state.combatants.findIndex((combatant) => combatant.tokenId === state.currentTokenId);
    const nextIndex = currentIndex + 1;
    if (nextIndex >= state.combatants.length) {
      state.round += 1;
      state.currentTokenId = state.combatants[0].tokenId;
    } else {
      state.currentTokenId = state.combatants[nextIndex].tokenId;
    }
    this.stateStore.set(command.context.campaignId, state);
    return state;
  }
}

export class EndInitiativeCombat extends InitiativeCommandBase implements CommandHandler<EndInitiativeCombatCommand, InitiativeState> {
  async execute(command: EndInitiativeCombatCommand): Promise<InitiativeState> {
    this.assertDm(command.context, 'Only the DM can end combat');
    this.stateStore.clear(command.context.campaignId);
    return emptyInitiativeState();
  }
}
