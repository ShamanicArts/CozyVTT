import type {
  CapabilityGameplayEventPublisher,
  CapabilityGameplayMembership,
  CapabilityGameplayRole,
} from "../../ports/CapabilityGameplay";
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

export const PUBLIC_SPAWN_ACTOR = "vtt.actor.spawn" as const;
export const PUBLIC_UPDATE_ACTOR = "vtt.actor.update" as const;
export const PUBLIC_MOVE_ACTOR = "vtt.actor.move" as const;
export const PUBLIC_SPEAK_AS_ACTOR = "vtt.actor.speak" as const;
export const PUBLIC_ROLL_AS_ACTOR = "vtt.actor.roll" as const;
export const PUBLIC_ADJUST_CHARACTER_HP = "vtt.character.hp.adjust" as const;
export const PUBLIC_CREATE_CHARACTER = "vtt.character.create" as const;
export const PUBLIC_ADD_TO_COMBAT = "vtt.combat.add" as const;
export const PUBLIC_REMOVE_FROM_COMBAT = "vtt.combat.remove" as const;
export const PUBLIC_START_COMBAT = "vtt.combat.start" as const;
export const PUBLIC_NEXT_TURN = "vtt.combat.next" as const;
export const PUBLIC_END_COMBAT = "vtt.combat.end" as const;

export interface CapabilityActorView {
  id: string;
  name: string;
  type: string;
  mapId: string;
  position: { x: number; y: number };
  controlledBy: string | null;
  hp: { current: number; max: number; temp: number } | null;
  conditions: string[];
}

interface CapabilityCommand<TResult> extends Command<TResult> {
  readonly campaignId: string;
  readonly actorId: string;
}

export interface SpawnCapabilityActorCommand extends CapabilityCommand<CapabilityActorView> {
  readonly type: typeof PUBLIC_SPAWN_ACTOR;
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

export interface UpdateCapabilityActorCommand extends CapabilityCommand<CapabilityActorView> {
  readonly type: typeof PUBLIC_UPDATE_ACTOR;
  readonly mapId: string;
  readonly tokenId: string;
  readonly updates: unknown;
}

export interface MoveCapabilityActorCommand extends CapabilityCommand<CapabilityActorView> {
  readonly type: typeof PUBLIC_MOVE_ACTOR;
  readonly mapId: string;
  readonly tokenId: string;
  readonly x: number;
  readonly y: number;
}

export interface SpeakAsCapabilityActorCommand extends CapabilityCommand<SendChatMessageResult> {
  readonly type: typeof PUBLIC_SPEAK_AS_ACTOR;
  readonly mapId: string;
  readonly tokenId: string;
  readonly content: string;
}

export interface RollAsCapabilityActorCommand extends CapabilityCommand<RollDiceResult> {
  readonly type: typeof PUBLIC_ROLL_AS_ACTOR;
  readonly mapId: string;
  readonly tokenId: string;
  readonly expression: string;
  readonly purpose?: string;
  readonly secret?: boolean;
}

export interface AdjustCapabilityCharacterHpCommand extends CapabilityCommand<{
  current: number;
  max: number;
  temp: number;
}> {
  readonly type: typeof PUBLIC_ADJUST_CHARACTER_HP;
  readonly characterId: string;
  readonly delta: number;
}

export interface CreateCapabilityCharacterCommand extends CapabilityCommand<CharacterMutationResult> {
  readonly type: typeof PUBLIC_CREATE_CHARACTER;
  readonly name: string;
  readonly data: unknown;
  readonly gameSystem?: string;
  readonly tokenImageUrl?: string;
  readonly ownerUserId?: string;
}

export interface AddCapabilityCombatantCommand extends CapabilityCommand<CapabilityCombatResult> {
  readonly type: typeof PUBLIC_ADD_TO_COMBAT;
  readonly mapId: string;
  readonly tokenId: string;
  readonly initiativeExpression?: string;
}

export interface RemoveCapabilityCombatantCommand extends CapabilityCommand<CapabilityCombatResult> {
  readonly type: typeof PUBLIC_REMOVE_FROM_COMBAT;
  readonly tokenId: string;
}

export interface StartCapabilityCombatCommand extends CapabilityCommand<CapabilityCombatResult> {
  readonly type: typeof PUBLIC_START_COMBAT;
}

export interface NextCapabilityTurnCommand extends CapabilityCommand<CapabilityCombatResult> {
  readonly type: typeof PUBLIC_NEXT_TURN;
}

export interface EndCapabilityCombatCommand extends CapabilityCommand<CapabilityCombatResult> {
  readonly type: typeof PUBLIC_END_COMBAT;
}

export interface CapabilityCombatResult {
  state: InitiativeState;
  roll?: InitiativeRollBroadcast;
}

export class CapabilityGameplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapabilityGameplayError";
  }
}

abstract class CapabilityGameplayBase {
  constructor(
    protected readonly commands: CommandBus,
    protected readonly memberships: CapabilityGameplayMembership,
    protected readonly events: CapabilityGameplayEventPublisher,
  ) {}

  protected async role(
    command: CapabilityCommand<unknown>,
  ): Promise<CapabilityGameplayRole> {
    const role = await this.memberships.role(
      command.actorId,
      command.campaignId,
    );
    if (!role) throw new CapabilityGameplayError("Campaign access denied");
    if (role === "SPECTATOR") {
      throw new CapabilityGameplayError("Spectators cannot control campaign actors");
    }
    return role;
  }

  protected async controlledToken(
    command: CapabilityCommand<unknown>,
    mapId: string,
    tokenId: string,
    role: CapabilityGameplayRole,
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

  protected actorView(mapId: string, token: MapToken): CapabilityActorView {
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

export class SpawnCapabilityActor
  extends CapabilityGameplayBase
  implements CommandHandler<SpawnCapabilityActorCommand, CapabilityActorView>
{
  async execute(command: SpawnCapabilityActorCommand): Promise<CapabilityActorView> {
    const role = await this.role(command);
    if (role !== "DM" && command.actorType !== "player") {
      throw new CapabilityGameplayError("Only a DM can create NPC actors");
    }
    const controlledBy =
      role === "DM" ? (command.controlledByUserId ?? null) : command.actorId;
    if (
      controlledBy &&
      !(await this.memberships.role(controlledBy, command.campaignId))
    ) {
      throw new CapabilityGameplayError(
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
        metadata: { capabilityCreated: true },
      },
    });
    await this.publish(() =>
      this.events.syncMap(command.campaignId, result.map),
    );
    return this.actorView(command.mapId, result.token);
  }
}

export class UpdateCapabilityActor
  extends CapabilityGameplayBase
  implements CommandHandler<UpdateCapabilityActorCommand, CapabilityActorView>
{
  async execute(command: UpdateCapabilityActorCommand): Promise<CapabilityActorView> {
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

export class MoveCapabilityActor
  extends CapabilityGameplayBase
  implements CommandHandler<MoveCapabilityActorCommand, CapabilityActorView>
{
  async execute(command: MoveCapabilityActorCommand): Promise<CapabilityActorView> {
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

export class SpeakAsCapabilityActor
  extends CapabilityGameplayBase
  implements CommandHandler<SpeakAsCapabilityActorCommand, SendChatMessageResult>
{
  async execute(
    command: SpeakAsCapabilityActorCommand,
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

export class RollAsCapabilityActor
  extends CapabilityGameplayBase
  implements CommandHandler<RollAsCapabilityActorCommand, RollDiceResult>
{
  async execute(command: RollAsCapabilityActorCommand): Promise<RollDiceResult> {
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

export class AdjustCapabilityCharacterHp
  extends CapabilityGameplayBase
  implements
    CommandHandler<
      AdjustCapabilityCharacterHpCommand,
      { current: number; max: number; temp: number }
    >
{
  async execute(
    command: AdjustCapabilityCharacterHpCommand,
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

export class CreateCapabilityCharacter
  extends CapabilityGameplayBase
  implements
    CommandHandler<CreateCapabilityCharacterCommand, CharacterMutationResult>
{
  async execute(
    command: CreateCapabilityCharacterCommand,
  ): Promise<CharacterMutationResult> {
    const role = await this.role(command);
    const ownerUserId =
      role === "DM"
        ? (command.ownerUserId ?? command.actorId)
        : command.actorId;
    if (!(await this.memberships.role(ownerUserId, command.campaignId))) {
      throw new CapabilityGameplayError(
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

abstract class CapabilityCombatBase extends CapabilityGameplayBase {
  protected async dmContext(command: CapabilityCommand<unknown>) {
    const role = await this.role(command);
    if (role !== "DM") {
      throw new CapabilityGameplayError("Only a DM can control initiative");
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
  ): Promise<CapabilityCombatResult> {
    await this.publish(() =>
      this.events.initiativeChanged(campaignId, state, roll),
    );
    return roll ? { state, roll } : { state };
  }
}

export class AddCapabilityCombatant
  extends CapabilityCombatBase
  implements CommandHandler<AddCapabilityCombatantCommand, CapabilityCombatResult>
{
  async execute(command: AddCapabilityCombatantCommand): Promise<CapabilityCombatResult> {
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

export class RemoveCapabilityCombatant
  extends CapabilityCombatBase
  implements CommandHandler<RemoveCapabilityCombatantCommand, CapabilityCombatResult>
{
  async execute(
    command: RemoveCapabilityCombatantCommand,
  ): Promise<CapabilityCombatResult> {
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

export class StartCapabilityCombat
  extends CapabilityCombatBase
  implements CommandHandler<StartCapabilityCombatCommand, CapabilityCombatResult>
{
  async execute(command: StartCapabilityCombatCommand): Promise<CapabilityCombatResult> {
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

export class NextCapabilityTurn
  extends CapabilityCombatBase
  implements CommandHandler<NextCapabilityTurnCommand, CapabilityCombatResult>
{
  async execute(command: NextCapabilityTurnCommand): Promise<CapabilityCombatResult> {
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

export class EndCapabilityCombat
  extends CapabilityCombatBase
  implements CommandHandler<EndCapabilityCombatCommand, CapabilityCombatResult>
{
  async execute(command: EndCapabilityCombatCommand): Promise<CapabilityCombatResult> {
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
