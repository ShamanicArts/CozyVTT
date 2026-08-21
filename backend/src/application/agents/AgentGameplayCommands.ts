import type {
  AgentGameplayEventPublisher,
  AgentGameplayMembership,
  AgentGameplayRole,
} from "../../ports/AgentGameplay";
import type { MapToken } from "../../domain/mapTokens/MapToken";
import type { InitiativeState } from "../../domain/initiative/Initiative";
import type { Command, CommandHandler } from "../commands/CommandBus";
import { CommandBus } from "../commands/CommandBus";
import {
  CREATE_MAP_TOKEN,
  CreateMapTokenCommand,
  MapTokenMutationResult,
  UPDATE_MAP_TOKEN,
  UpdateMapTokenCommand,
} from "../mapTokens/MapTokenMutations";
import {
  FINALIZE_TOKEN_MOVE,
  FinalizeTokenMoveCommand,
  FinalizeTokenMoveResult,
  START_TOKEN_MOVE,
  StartTokenMoveCommand,
  StartTokenMoveResult,
} from "../tokens/TokenMovement";
import {
  SEND_CHAT_MESSAGE,
  SendChatMessageCommand,
  SendChatMessageResult,
} from "../chat/SendChatMessage";
import { ROLL_DICE, RollDiceCommand, RollDiceResult } from "../dice/RollDice";
import {
  UPDATE_CHARACTER_HP,
  UpdateCharacterHpCommand,
} from "../characters/RealtimeCharacterCommands";
import {
  ADD_INITIATIVE_COMBATANT,
  AddInitiativeCombatantCommand,
  ADVANCE_INITIATIVE_TURN,
  AdvanceInitiativeTurnCommand,
  END_INITIATIVE_COMBAT,
  EndInitiativeCombatCommand,
  InitiativeRollBroadcast,
  REMOVE_INITIATIVE_COMBATANT,
  RemoveInitiativeCombatantCommand,
  ROLL_INITIATIVE,
  RollInitiativeCommand,
  RollInitiativeResult,
  START_INITIATIVE_COMBAT,
  StartInitiativeCombatCommand,
} from "../initiative/InitiativeCommands";
import {
  CREATE_CHARACTER,
  CharacterMutationResult,
  CreateCharacterCommand,
} from "../characters/CharacterMutations";

export const AGENT_SPAWN_ACTOR = "agent.actor.spawn" as const;
export const AGENT_UPDATE_ACTOR = "agent.actor.update" as const;
export const AGENT_MOVE_ACTOR = "agent.actor.move" as const;
export const AGENT_SPEAK_AS_ACTOR = "agent.actor.speak" as const;
export const AGENT_ROLL_AS_ACTOR = "agent.actor.roll" as const;
export const AGENT_ADJUST_CHARACTER_HP = "agent.character.hp.adjust" as const;
export const AGENT_CREATE_CHARACTER = "agent.character.create" as const;
export const AGENT_ADD_TO_COMBAT = "agent.combat.add" as const;
export const AGENT_REMOVE_FROM_COMBAT = "agent.combat.remove" as const;
export const AGENT_START_COMBAT = "agent.combat.start" as const;
export const AGENT_NEXT_TURN = "agent.combat.next" as const;
export const AGENT_END_COMBAT = "agent.combat.end" as const;

export interface AgentActorView {
  id: string;
  name: string;
  type: string;
  mapId: string;
  position: { x: number; y: number };
  controlledBy: string | null;
  hp: { current: number; max: number; temp: number } | null;
  conditions: string[];
}

interface AgentCommand<TResult> extends Command<TResult> {
  readonly campaignId: string;
  readonly actorId: string;
}

export interface SpawnAgentActorCommand extends AgentCommand<AgentActorView> {
  readonly type: typeof AGENT_SPAWN_ACTOR;
  readonly mapId: string;
  readonly name: string;
  readonly actorType: "player" | "npc";
  readonly x: number;
  readonly y: number;
  readonly controlledByUserId?: string;
  readonly imageUrl?: string;
  readonly disposition?: "friendly" | "neutral" | "hostile";
  readonly hp?: { current: number; max: number; temp?: number };
  readonly notes?: string;
  readonly visible?: boolean;
}

export interface UpdateAgentActorCommand extends AgentCommand<AgentActorView> {
  readonly type: typeof AGENT_UPDATE_ACTOR;
  readonly mapId: string;
  readonly tokenId: string;
  readonly updates: unknown;
}

export interface MoveAgentActorCommand extends AgentCommand<AgentActorView> {
  readonly type: typeof AGENT_MOVE_ACTOR;
  readonly mapId: string;
  readonly tokenId: string;
  readonly x: number;
  readonly y: number;
}

export interface SpeakAsAgentActorCommand extends AgentCommand<SendChatMessageResult> {
  readonly type: typeof AGENT_SPEAK_AS_ACTOR;
  readonly mapId: string;
  readonly tokenId: string;
  readonly content: string;
}

export interface RollAsAgentActorCommand extends AgentCommand<RollDiceResult> {
  readonly type: typeof AGENT_ROLL_AS_ACTOR;
  readonly mapId: string;
  readonly tokenId: string;
  readonly expression: string;
  readonly purpose?: string;
  readonly secret?: boolean;
}

export interface AdjustAgentCharacterHpCommand extends AgentCommand<{
  current: number;
  max: number;
  temp: number;
}> {
  readonly type: typeof AGENT_ADJUST_CHARACTER_HP;
  readonly characterId: string;
  readonly delta: number;
}

export interface CreateAgentCharacterCommand extends AgentCommand<CharacterMutationResult> {
  readonly type: typeof AGENT_CREATE_CHARACTER;
  readonly name: string;
  readonly data: unknown;
  readonly gameSystem?: string;
  readonly tokenImageUrl?: string;
  readonly ownerUserId?: string;
}

export interface AddAgentCombatantCommand extends AgentCommand<AgentCombatResult> {
  readonly type: typeof AGENT_ADD_TO_COMBAT;
  readonly mapId: string;
  readonly tokenId: string;
  readonly initiativeExpression?: string;
}

export interface RemoveAgentCombatantCommand extends AgentCommand<AgentCombatResult> {
  readonly type: typeof AGENT_REMOVE_FROM_COMBAT;
  readonly tokenId: string;
}

export interface StartAgentCombatCommand extends AgentCommand<AgentCombatResult> {
  readonly type: typeof AGENT_START_COMBAT;
}

export interface NextAgentTurnCommand extends AgentCommand<AgentCombatResult> {
  readonly type: typeof AGENT_NEXT_TURN;
}

export interface EndAgentCombatCommand extends AgentCommand<AgentCombatResult> {
  readonly type: typeof AGENT_END_COMBAT;
}

export interface AgentCombatResult {
  state: InitiativeState;
  roll?: InitiativeRollBroadcast;
}

export class AgentGameplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentGameplayError";
  }
}

abstract class AgentGameplayBase {
  constructor(
    protected readonly commands: CommandBus,
    protected readonly memberships: AgentGameplayMembership,
    protected readonly events: AgentGameplayEventPublisher,
  ) {}

  protected async role(
    command: AgentCommand<unknown>,
  ): Promise<AgentGameplayRole> {
    const role = await this.memberships.role(
      command.actorId,
      command.campaignId,
    );
    if (!role) throw new AgentGameplayError("Campaign access denied");
    if (role === "SPECTATOR") {
      throw new AgentGameplayError("Spectators cannot control campaign actors");
    }
    return role;
  }

  protected async controlledToken(
    command: AgentCommand<unknown>,
    mapId: string,
    tokenId: string,
    role: AgentGameplayRole,
  ): Promise<MapToken> {
    const result = await this.commands.dispatch<
      StartTokenMoveCommand,
      StartTokenMoveResult
    >({
      type: START_TOKEN_MOVE,
      actor: {
        campaignId: command.campaignId,
        userId: command.actorId,
        role,
      },
      mapId,
      tokenId,
    });
    return result.token;
  }

  protected async publish(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch {
      // Persistence remains authoritative when no live Socket.IO server exists.
    }
  }

  protected actorView(mapId: string, token: MapToken): AgentActorView {
    return {
      id: token.id,
      name: token.name,
      type: token.type ?? "npc",
      mapId,
      position: token.position,
      controlledBy: token.controlledBy ?? null,
      hp: token.hp ?? null,
      conditions: token.conditions,
    };
  }
}

export class SpawnAgentActor
  extends AgentGameplayBase
  implements CommandHandler<SpawnAgentActorCommand, AgentActorView>
{
  async execute(command: SpawnAgentActorCommand): Promise<AgentActorView> {
    const role = await this.role(command);
    if (role !== "DM" && command.actorType !== "player") {
      throw new AgentGameplayError("Only a DM can create NPC actors");
    }
    const controlledBy =
      role === "DM" ? (command.controlledByUserId ?? null) : command.actorId;
    if (
      controlledBy &&
      !(await this.memberships.role(controlledBy, command.campaignId))
    ) {
      throw new AgentGameplayError(
        "The controlling user is not a campaign member",
      );
    }
    const result = await this.commands.dispatch<
      CreateMapTokenCommand,
      MapTokenMutationResult
    >({
      type: CREATE_MAP_TOKEN,
      campaignId: command.campaignId,
      mapId: command.mapId,
      data: {
        name: command.name,
        type: command.actorType,
        position: { x: command.x, y: command.y },
        controlledBy,
        imageUrl: command.imageUrl,
        disposition:
          command.disposition ??
          (command.actorType === "player" ? "friendly" : "hostile"),
        hp: command.hp
          ? {
              current: command.hp.current,
              max: command.hp.max,
              temp: command.hp.temp ?? 0,
            }
          : null,
        notes: command.notes ?? "",
        visible: command.visible ?? true,
        showHpBar: Boolean(command.hp),
        metadata: { agentCreated: true },
      },
    });
    await this.publish(() =>
      this.events.syncMap(command.campaignId, result.map),
    );
    return this.actorView(command.mapId, result.token);
  }
}

export class UpdateAgentActor
  extends AgentGameplayBase
  implements CommandHandler<UpdateAgentActorCommand, AgentActorView>
{
  async execute(command: UpdateAgentActorCommand): Promise<AgentActorView> {
    await this.role(command);
    const result = await this.commands.dispatch<
      UpdateMapTokenCommand,
      MapTokenMutationResult
    >({
      type: UPDATE_MAP_TOKEN,
      campaignId: command.campaignId,
      mapId: command.mapId,
      tokenId: command.tokenId,
      userId: command.actorId,
      updates: command.updates,
    });
    await this.publish(() =>
      this.events.syncMap(command.campaignId, result.map),
    );
    return this.actorView(command.mapId, result.token);
  }
}

export class MoveAgentActor
  extends AgentGameplayBase
  implements CommandHandler<MoveAgentActorCommand, AgentActorView>
{
  async execute(command: MoveAgentActorCommand): Promise<AgentActorView> {
    const role = await this.role(command);
    const result = await this.commands.dispatch<
      FinalizeTokenMoveCommand,
      FinalizeTokenMoveResult
    >({
      type: FINALIZE_TOKEN_MOVE,
      actor: {
        campaignId: command.campaignId,
        userId: command.actorId,
        role,
      },
      mapId: command.mapId,
      tokenId: command.tokenId,
      position: { x: command.x, y: command.y },
    });
    await this.publish(() =>
      this.events.actorMoved(command.campaignId, command.actorId, result),
    );
    return this.actorView(command.mapId, result.token);
  }
}

export class SpeakAsAgentActor
  extends AgentGameplayBase
  implements CommandHandler<SpeakAsAgentActorCommand, SendChatMessageResult>
{
  async execute(
    command: SpeakAsAgentActorCommand,
  ): Promise<SendChatMessageResult> {
    const role = await this.role(command);
    const token = await this.controlledToken(
      command,
      command.mapId,
      command.tokenId,
      role,
    );
    const message = await this.commands.dispatch<
      SendChatMessageCommand,
      SendChatMessageResult
    >({
      type: SEND_CHAT_MESSAGE,
      campaignId: command.campaignId,
      userId: command.actorId,
      content: command.content,
      messageType: "PLAYER",
      speakerName: token.name,
    });
    await this.publish(() =>
      this.events.chatMessage(command.campaignId, message),
    );
    return message;
  }
}

export class RollAsAgentActor
  extends AgentGameplayBase
  implements CommandHandler<RollAsAgentActorCommand, RollDiceResult>
{
  async execute(command: RollAsAgentActorCommand): Promise<RollDiceResult> {
    const role = await this.role(command);
    const token = await this.controlledToken(
      command,
      command.mapId,
      command.tokenId,
      role,
    );
    const roll = await this.commands.dispatch<RollDiceCommand, RollDiceResult>({
      type: ROLL_DICE,
      campaignId: command.campaignId,
      userId: command.actorId,
      expression: command.expression,
      characterName: token.name,
      purpose: command.purpose,
      secret: command.secret,
    });
    await this.publish(() => this.events.diceRolled(command.campaignId, roll));
    return roll;
  }
}

export class AdjustAgentCharacterHp
  extends AgentGameplayBase
  implements
    CommandHandler<
      AdjustAgentCharacterHpCommand,
      { current: number; max: number; temp: number }
    >
{
  async execute(
    command: AdjustAgentCharacterHpCommand,
  ): Promise<{ current: number; max: number; temp: number }> {
    const role = await this.role(command);
    const hp = await this.commands.dispatch<
      UpdateCharacterHpCommand,
      { current: number; max: number; temp: number }
    >({
      type: UPDATE_CHARACTER_HP,
      campaignId: command.campaignId,
      characterId: command.characterId,
      delta: command.delta,
      userId: command.actorId,
      isDm: role === "DM",
    });
    await this.publish(() =>
      this.events.characterHpUpdated(
        command.campaignId,
        command.characterId,
        hp,
      ),
    );
    return hp;
  }
}

export class CreateAgentCharacter
  extends AgentGameplayBase
  implements
    CommandHandler<CreateAgentCharacterCommand, CharacterMutationResult>
{
  async execute(
    command: CreateAgentCharacterCommand,
  ): Promise<CharacterMutationResult> {
    const role = await this.role(command);
    const ownerUserId =
      role === "DM"
        ? (command.ownerUserId ?? command.actorId)
        : command.actorId;
    if (!(await this.memberships.role(ownerUserId, command.campaignId))) {
      throw new AgentGameplayError(
        "The character owner is not a campaign member",
      );
    }
    const result = await this.commands.dispatch<
      CreateCharacterCommand,
      CharacterMutationResult
    >({
      type: CREATE_CHARACTER,
      userId: ownerUserId,
      input: {
        name: command.name,
        data: command.data,
        tokenImageUrl: command.tokenImageUrl,
        gameSystem: command.gameSystem,
        campaignId: command.campaignId,
      },
    });
    await this.publish(() =>
      this.events.rosterUpdated(command.campaignId, {
        action: "character.created",
        character: result.character,
        userId: ownerUserId,
      }),
    );
    return result;
  }
}

abstract class AgentCombatBase extends AgentGameplayBase {
  protected async dmContext(command: AgentCommand<unknown>) {
    const role = await this.role(command);
    if (role !== "DM") {
      throw new AgentGameplayError("Only a DM can control initiative");
    }
    return {
      campaignId: command.campaignId,
      userId: command.actorId,
      role,
    };
  }

  protected async announce(
    campaignId: string,
    state: InitiativeState,
    roll?: InitiativeRollBroadcast,
  ): Promise<AgentCombatResult> {
    await this.publish(() =>
      this.events.initiativeChanged(campaignId, state, roll),
    );
    return roll ? { state, roll } : { state };
  }
}

export class AddAgentCombatant
  extends AgentCombatBase
  implements CommandHandler<AddAgentCombatantCommand, AgentCombatResult>
{
  async execute(command: AddAgentCombatantCommand): Promise<AgentCombatResult> {
    const context = await this.dmContext(command);
    if (command.initiativeExpression) {
      const result = await this.commands.dispatch<
        RollInitiativeCommand,
        RollInitiativeResult
      >({
        type: ROLL_INITIATIVE,
        context,
        tokenId: command.tokenId,
        mapId: command.mapId,
        expression: command.initiativeExpression,
      });
      return this.announce(command.campaignId, result.state, result.roll);
    }
    const state = await this.commands.dispatch<
      AddInitiativeCombatantCommand,
      InitiativeState
    >({
      type: ADD_INITIATIVE_COMBATANT,
      context,
      tokenId: command.tokenId,
      mapId: command.mapId,
    });
    return this.announce(command.campaignId, state);
  }
}

export class RemoveAgentCombatant
  extends AgentCombatBase
  implements CommandHandler<RemoveAgentCombatantCommand, AgentCombatResult>
{
  async execute(
    command: RemoveAgentCombatantCommand,
  ): Promise<AgentCombatResult> {
    const state = await this.commands.dispatch<
      RemoveInitiativeCombatantCommand,
      InitiativeState
    >({
      type: REMOVE_INITIATIVE_COMBATANT,
      context: await this.dmContext(command),
      tokenId: command.tokenId,
    });
    return this.announce(command.campaignId, state);
  }
}

export class StartAgentCombat
  extends AgentCombatBase
  implements CommandHandler<StartAgentCombatCommand, AgentCombatResult>
{
  async execute(command: StartAgentCombatCommand): Promise<AgentCombatResult> {
    const state = await this.commands.dispatch<
      StartInitiativeCombatCommand,
      InitiativeState
    >({
      type: START_INITIATIVE_COMBAT,
      context: await this.dmContext(command),
    });
    return this.announce(command.campaignId, state);
  }
}

export class NextAgentTurn
  extends AgentCombatBase
  implements CommandHandler<NextAgentTurnCommand, AgentCombatResult>
{
  async execute(command: NextAgentTurnCommand): Promise<AgentCombatResult> {
    const state = await this.commands.dispatch<
      AdvanceInitiativeTurnCommand,
      InitiativeState
    >({
      type: ADVANCE_INITIATIVE_TURN,
      context: await this.dmContext(command),
    });
    return this.announce(command.campaignId, state);
  }
}

export class EndAgentCombat
  extends AgentCombatBase
  implements CommandHandler<EndAgentCombatCommand, AgentCombatResult>
{
  async execute(command: EndAgentCombatCommand): Promise<AgentCombatResult> {
    const state = await this.commands.dispatch<
      EndInitiativeCombatCommand,
      InitiativeState
    >({
      type: END_INITIATIVE_COMBAT,
      context: await this.dmContext(command),
    });
    return this.announce(command.campaignId, state);
  }
}
