import type {
  AgentGameplayEventPublisher,
  AgentGameplayMembership,
} from "../../ports/AgentGameplay";
import type {
  FogOperation,
  FogState,
  LightSource,
  WallSegment,
} from "../../domain/scene/Scene";
import type { MapCoreRecord } from "../../domain/maps/MapLifecycle";
import type { CampaignSessionRecord } from "../../domain/campaigns/SessionLifecycle";
import type { VibePeriod } from "../../utils/vibe-presets";
import type { Command, CommandHandler } from "../commands/CommandBus";
import { CommandBus } from "../commands/CommandBus";
import {
  CHANGE_MAP,
  ChangeMapCommand,
  SET_CURRENT_MAP,
  SetCurrentMapCommand,
} from "../maps/MapLifecycleCommands";
import {
  ADD_LIGHT_SOURCE,
  ADD_WALL_SEGMENT,
  AddLightSourceCommand,
  AddWallSegmentCommand,
  APPLY_FOG_OPERATION,
  ApplyFogOperationCommand,
  REMOVE_LIGHT_SOURCE,
  REMOVE_WALL_SEGMENT,
  RemoveLightSourceCommand,
  RemoveWallSegmentCommand,
  SET_SCENE_LIGHTING_ENABLED,
  SetSceneLightingEnabledCommand,
  UPDATE_LIGHT_SOURCE,
  UPDATE_WALL_SEGMENT,
  UpdateLightSourceCommand,
  UpdateWallSegmentCommand,
} from "../scene/SceneMutations";
import {
  SET_ATMOSPHERE_AUDIO,
  SET_ATMOSPHERE_EFFECT,
  SET_CAMPAIGN_VIBE,
  SetAtmosphereAudioCommand,
  SetAtmosphereEffectCommand,
  SetCampaignVibeCommand,
} from "../campaigns/RealtimeCampaignCommands";
import {
  END_CAMPAIGN_SESSION,
  EndCampaignSessionCommand,
  PAUSE_CAMPAIGN_SESSION,
  PauseCampaignSessionCommand,
  RESUME_CAMPAIGN_SESSION,
  ResumeCampaignSessionCommand,
  START_CAMPAIGN_SESSION,
  StartCampaignSessionCommand,
} from "../campaigns/SessionLifecycleCommands";
import { AgentGameplayError } from "./AgentGameplayCommands";

export const AGENT_ACTIVATE_MAP = "agent.map.activate" as const;
export const AGENT_ADD_WALL = "agent.scene.wall.add" as const;
export const AGENT_UPDATE_WALL = "agent.scene.wall.update" as const;
export const AGENT_REMOVE_WALL = "agent.scene.wall.remove" as const;
export const AGENT_APPLY_FOG = "agent.scene.fog.apply" as const;
export const AGENT_ADD_LIGHT = "agent.scene.light.add" as const;
export const AGENT_UPDATE_LIGHT = "agent.scene.light.update" as const;
export const AGENT_REMOVE_LIGHT = "agent.scene.light.remove" as const;
export const AGENT_SET_LIGHTING = "agent.scene.lighting.set" as const;
export const AGENT_SET_ATMOSPHERE_EFFECT =
  "agent.atmosphere.effect.set" as const;
export const AGENT_SET_ATMOSPHERE_AUDIO = "agent.atmosphere.audio.set" as const;
export const AGENT_SET_VIBE = "agent.campaign.vibe.set" as const;
export const AGENT_START_SESSION = "agent.session.start" as const;
export const AGENT_PAUSE_SESSION = "agent.session.pause" as const;
export const AGENT_RESUME_SESSION = "agent.session.resume" as const;
export const AGENT_END_SESSION = "agent.session.end" as const;

interface AgentGmCommand<TResult> extends Command<TResult> {
  readonly campaignId: string;
  readonly actorId: string;
}

export interface ActivateAgentMapCommand extends AgentGmCommand<MapCoreRecord> {
  readonly type: typeof AGENT_ACTIVATE_MAP;
  readonly mapId: string;
}

export interface AddAgentWallCommand extends AgentGmCommand<WallSegment[]> {
  readonly type: typeof AGENT_ADD_WALL;
  readonly mapId: string;
  readonly segment: WallSegment;
}

export interface UpdateAgentWallCommand extends AgentGmCommand<WallSegment[]> {
  readonly type: typeof AGENT_UPDATE_WALL;
  readonly mapId: string;
  readonly segment: WallSegment;
}

export interface RemoveAgentWallCommand extends AgentGmCommand<WallSegment[]> {
  readonly type: typeof AGENT_REMOVE_WALL;
  readonly mapId: string;
  readonly segmentId: string;
}

export interface ApplyAgentFogCommand extends AgentGmCommand<FogState> {
  readonly type: typeof AGENT_APPLY_FOG;
  readonly mapId: string;
  readonly operation: FogOperation;
}

export interface AddAgentLightCommand extends AgentGmCommand<LightSource[]> {
  readonly type: typeof AGENT_ADD_LIGHT;
  readonly mapId: string;
  readonly light: LightSource;
}

export interface UpdateAgentLightCommand extends AgentGmCommand<LightSource[]> {
  readonly type: typeof AGENT_UPDATE_LIGHT;
  readonly mapId: string;
  readonly light: LightSource;
}

export interface RemoveAgentLightCommand extends AgentGmCommand<LightSource[]> {
  readonly type: typeof AGENT_REMOVE_LIGHT;
  readonly mapId: string;
  readonly lightId: string;
}

export interface SetAgentLightingCommand extends AgentGmCommand<boolean> {
  readonly type: typeof AGENT_SET_LIGHTING;
  readonly mapId: string;
  readonly enabled: boolean;
}

export interface SetAgentAtmosphereEffectCommand extends AgentGmCommand<
  string | null
> {
  readonly type: typeof AGENT_SET_ATMOSPHERE_EFFECT;
  readonly effect: string | null;
}

export interface SetAgentAtmosphereAudioCommand extends AgentGmCommand<{
  assetId: string | null;
  audioUrl: string | null;
  volume: number;
  loop: boolean;
}> {
  readonly type: typeof AGENT_SET_ATMOSPHERE_AUDIO;
  readonly assetId: string | null;
  readonly volume?: number;
  readonly loop?: boolean;
}

export interface SetAgentVibeCommand extends AgentGmCommand<VibePeriod> {
  readonly type: typeof AGENT_SET_VIBE;
  readonly period: string;
}

export interface StartAgentSessionCommand extends AgentGmCommand<CampaignSessionRecord> {
  readonly type: typeof AGENT_START_SESSION;
}

export interface PauseAgentSessionCommand extends AgentGmCommand<CampaignSessionRecord> {
  readonly type: typeof AGENT_PAUSE_SESSION;
  readonly sessionId: string;
}

export interface ResumeAgentSessionCommand extends AgentGmCommand<CampaignSessionRecord> {
  readonly type: typeof AGENT_RESUME_SESSION;
}

export interface EndAgentSessionCommand extends AgentGmCommand<{
  session: CampaignSessionRecord;
  stateSaved: unknown;
}> {
  readonly type: typeof AGENT_END_SESSION;
  readonly sessionId: string;
  readonly saveState?: boolean;
  readonly notes?: string;
}

abstract class AgentGmBase {
  constructor(
    protected readonly commands: CommandBus,
    private readonly memberships: AgentGameplayMembership,
    protected readonly events: AgentGameplayEventPublisher,
  ) {}

  protected async requireDm(command: AgentGmCommand<unknown>): Promise<void> {
    const role = await this.memberships.role(
      command.actorId,
      command.campaignId,
    );
    if (role !== "DM") {
      throw new AgentGameplayError(
        "Only a DM can control this campaign system",
      );
    }
  }

  protected actor(command: AgentGmCommand<unknown>) {
    return { campaignId: command.campaignId, role: "DM" as const };
  }

  protected async currentMap(command: AgentGmCommand<unknown>, mapId: string) {
    const map = await this.commands.dispatch<ChangeMapCommand, MapCoreRecord>({
      type: CHANGE_MAP,
      campaignId: command.campaignId,
      mapId,
    });
    try {
      await this.events.syncMap(command.campaignId, map);
    } catch {
      // Persistence is authoritative when the live Socket.IO server is absent.
    }
    return map;
  }
}

export class ActivateAgentMap
  extends AgentGmBase
  implements CommandHandler<ActivateAgentMapCommand, MapCoreRecord>
{
  async execute(command: ActivateAgentMapCommand): Promise<MapCoreRecord> {
    await this.requireDm(command);
    await this.commands.dispatch<SetCurrentMapCommand, unknown>({
      type: SET_CURRENT_MAP,
      campaignId: command.campaignId,
      mapId: command.mapId,
    });
    return this.currentMap(command, command.mapId);
  }
}

abstract class AgentSceneMutation<
  TCommand extends AgentGmCommand<TResult>,
  TResult,
>
  extends AgentGmBase
  implements CommandHandler<TCommand, TResult>
{
  async execute(command: TCommand): Promise<TResult> {
    await this.requireDm(command);
    const result = await this.mutate(command);
    await this.currentMap(command, this.mapId(command));
    return result;
  }

  protected abstract mutate(command: TCommand): Promise<TResult>;
  protected abstract mapId(command: TCommand): string;
}

export class AddAgentWall extends AgentSceneMutation<
  AddAgentWallCommand,
  WallSegment[]
> {
  protected mapId(command: AddAgentWallCommand) {
    return command.mapId;
  }
  protected mutate(command: AddAgentWallCommand) {
    return this.commands.dispatch<AddWallSegmentCommand, WallSegment[]>({
      type: ADD_WALL_SEGMENT,
      actor: this.actor(command),
      mapId: command.mapId,
      segment: command.segment,
    });
  }
}

export class UpdateAgentWall extends AgentSceneMutation<
  UpdateAgentWallCommand,
  WallSegment[]
> {
  protected mapId(command: UpdateAgentWallCommand) {
    return command.mapId;
  }
  protected mutate(command: UpdateAgentWallCommand) {
    return this.commands.dispatch<UpdateWallSegmentCommand, WallSegment[]>({
      type: UPDATE_WALL_SEGMENT,
      actor: this.actor(command),
      mapId: command.mapId,
      segment: command.segment,
    });
  }
}

export class RemoveAgentWall extends AgentSceneMutation<
  RemoveAgentWallCommand,
  WallSegment[]
> {
  protected mapId(command: RemoveAgentWallCommand) {
    return command.mapId;
  }
  protected mutate(command: RemoveAgentWallCommand) {
    return this.commands.dispatch<RemoveWallSegmentCommand, WallSegment[]>({
      type: REMOVE_WALL_SEGMENT,
      actor: this.actor(command),
      mapId: command.mapId,
      segmentId: command.segmentId,
    });
  }
}

export class ApplyAgentFog extends AgentSceneMutation<
  ApplyAgentFogCommand,
  FogState
> {
  protected mapId(command: ApplyAgentFogCommand) {
    return command.mapId;
  }
  protected mutate(command: ApplyAgentFogCommand) {
    return this.commands.dispatch<ApplyFogOperationCommand, FogState>({
      type: APPLY_FOG_OPERATION,
      actor: this.actor(command),
      mapId: command.mapId,
      operation: command.operation,
    });
  }
}

export class AddAgentLight extends AgentSceneMutation<
  AddAgentLightCommand,
  LightSource[]
> {
  protected mapId(command: AddAgentLightCommand) {
    return command.mapId;
  }
  protected mutate(command: AddAgentLightCommand) {
    return this.commands.dispatch<AddLightSourceCommand, LightSource[]>({
      type: ADD_LIGHT_SOURCE,
      actor: this.actor(command),
      mapId: command.mapId,
      light: command.light,
    });
  }
}

export class UpdateAgentLight extends AgentSceneMutation<
  UpdateAgentLightCommand,
  LightSource[]
> {
  protected mapId(command: UpdateAgentLightCommand) {
    return command.mapId;
  }
  protected mutate(command: UpdateAgentLightCommand) {
    return this.commands.dispatch<UpdateLightSourceCommand, LightSource[]>({
      type: UPDATE_LIGHT_SOURCE,
      actor: this.actor(command),
      mapId: command.mapId,
      light: command.light,
    });
  }
}

export class RemoveAgentLight extends AgentSceneMutation<
  RemoveAgentLightCommand,
  LightSource[]
> {
  protected mapId(command: RemoveAgentLightCommand) {
    return command.mapId;
  }
  protected mutate(command: RemoveAgentLightCommand) {
    return this.commands.dispatch<RemoveLightSourceCommand, LightSource[]>({
      type: REMOVE_LIGHT_SOURCE,
      actor: this.actor(command),
      mapId: command.mapId,
      lightId: command.lightId,
    });
  }
}

export class SetAgentLighting extends AgentSceneMutation<
  SetAgentLightingCommand,
  boolean
> {
  protected mapId(command: SetAgentLightingCommand) {
    return command.mapId;
  }
  protected mutate(command: SetAgentLightingCommand) {
    return this.commands.dispatch<SetSceneLightingEnabledCommand, boolean>({
      type: SET_SCENE_LIGHTING_ENABLED,
      actor: this.actor(command),
      mapId: command.mapId,
      enabled: command.enabled,
    });
  }
}

export class SetAgentAtmosphereEffect
  extends AgentGmBase
  implements CommandHandler<SetAgentAtmosphereEffectCommand, string | null>
{
  async execute(command: SetAgentAtmosphereEffectCommand) {
    await this.requireDm(command);
    return this.commands.dispatch<SetAtmosphereEffectCommand, string | null>({
      type: SET_ATMOSPHERE_EFFECT,
      campaignId: command.campaignId,
      effect: command.effect,
      actorId: command.actorId,
    });
  }
}

export class SetAgentAtmosphereAudio
  extends AgentGmBase
  implements
    CommandHandler<
      SetAgentAtmosphereAudioCommand,
      {
        assetId: string | null;
        audioUrl: string | null;
        volume: number;
        loop: boolean;
      }
    >
{
  async execute(command: SetAgentAtmosphereAudioCommand) {
    await this.requireDm(command);
    return this.commands.dispatch<
      SetAtmosphereAudioCommand,
      {
        assetId: string | null;
        audioUrl: string | null;
        volume: number;
        loop: boolean;
      }
    >({
      type: SET_ATMOSPHERE_AUDIO,
      campaignId: command.campaignId,
      assetId: command.assetId,
      volume: command.volume,
      loop: command.loop,
      actorId: command.actorId,
    });
  }
}

export class SetAgentVibe
  extends AgentGmBase
  implements CommandHandler<SetAgentVibeCommand, VibePeriod>
{
  async execute(command: SetAgentVibeCommand) {
    await this.requireDm(command);
    return this.commands.dispatch<SetCampaignVibeCommand, VibePeriod>({
      type: SET_CAMPAIGN_VIBE,
      campaignId: command.campaignId,
      period: command.period,
      actorId: command.actorId,
    });
  }
}

export class StartAgentSession
  extends AgentGmBase
  implements CommandHandler<StartAgentSessionCommand, CampaignSessionRecord>
{
  async execute(command: StartAgentSessionCommand) {
    await this.requireDm(command);
    return this.commands.dispatch<
      StartCampaignSessionCommand,
      CampaignSessionRecord
    >({
      type: START_CAMPAIGN_SESSION,
      campaignId: command.campaignId,
    });
  }
}

export class PauseAgentSession
  extends AgentGmBase
  implements CommandHandler<PauseAgentSessionCommand, CampaignSessionRecord>
{
  async execute(command: PauseAgentSessionCommand) {
    await this.requireDm(command);
    return this.commands.dispatch<
      PauseCampaignSessionCommand,
      CampaignSessionRecord
    >({
      type: PAUSE_CAMPAIGN_SESSION,
      campaignId: command.campaignId,
      sessionId: command.sessionId,
    });
  }
}

export class ResumeAgentSession
  extends AgentGmBase
  implements CommandHandler<ResumeAgentSessionCommand, CampaignSessionRecord>
{
  async execute(command: ResumeAgentSessionCommand) {
    await this.requireDm(command);
    return this.commands.dispatch<
      ResumeCampaignSessionCommand,
      CampaignSessionRecord
    >({
      type: RESUME_CAMPAIGN_SESSION,
      campaignId: command.campaignId,
    });
  }
}

export class EndAgentSession
  extends AgentGmBase
  implements
    CommandHandler<
      EndAgentSessionCommand,
      { session: CampaignSessionRecord; stateSaved: unknown }
    >
{
  async execute(command: EndAgentSessionCommand) {
    await this.requireDm(command);
    return this.commands.dispatch<
      EndCampaignSessionCommand,
      { session: CampaignSessionRecord; stateSaved: unknown }
    >({
      type: END_CAMPAIGN_SESSION,
      campaignId: command.campaignId,
      sessionId: command.sessionId,
      saveState: command.saveState ?? true,
      notes: command.notes,
    });
  }
}
