import type {
  CapabilityGameplayEventPublisher,
  CapabilityGameplayMembership,
} from "../../ports/CapabilityGameplay";
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
import { CapabilityGameplayError } from "./CapabilityGameplayCommands";

export const PUBLIC_ACTIVATE_MAP = "vtt.map.activate" as const;
export const PUBLIC_ADD_WALL = "vtt.scene.wall.add" as const;
export const PUBLIC_UPDATE_WALL = "vtt.scene.wall.update" as const;
export const PUBLIC_REMOVE_WALL = "vtt.scene.wall.remove" as const;
export const PUBLIC_APPLY_FOG = "vtt.scene.fog.apply" as const;
export const PUBLIC_ADD_LIGHT = "vtt.scene.light.add" as const;
export const PUBLIC_UPDATE_LIGHT = "vtt.scene.light.update" as const;
export const PUBLIC_REMOVE_LIGHT = "vtt.scene.light.remove" as const;
export const PUBLIC_SET_LIGHTING = "vtt.scene.lighting.set" as const;
export const PUBLIC_SET_ATMOSPHERE_EFFECT =
  "vtt.atmosphere.effect.set" as const;
export const PUBLIC_SET_ATMOSPHERE_AUDIO = "vtt.atmosphere.audio.set" as const;
export const PUBLIC_SET_VIBE = "vtt.campaign.vibe.set" as const;
export const PUBLIC_START_SESSION = "vtt.session.start" as const;
export const PUBLIC_PAUSE_SESSION = "vtt.session.pause" as const;
export const PUBLIC_RESUME_SESSION = "vtt.session.resume" as const;
export const PUBLIC_END_SESSION = "vtt.session.end" as const;

interface CapabilityGmCommand<TResult> extends Command<TResult> {
  readonly campaignId: string;
  readonly actorId: string;
}

export interface ActivateCapabilityMapCommand extends CapabilityGmCommand<MapCoreRecord> {
  readonly type: typeof PUBLIC_ACTIVATE_MAP;
  readonly mapId: string;
}

export interface AddCapabilityWallCommand extends CapabilityGmCommand<WallSegment[]> {
  readonly type: typeof PUBLIC_ADD_WALL;
  readonly mapId: string;
  readonly segment: WallSegment;
}

export interface UpdateCapabilityWallCommand extends CapabilityGmCommand<WallSegment[]> {
  readonly type: typeof PUBLIC_UPDATE_WALL;
  readonly mapId: string;
  readonly segment: WallSegment;
}

export interface RemoveCapabilityWallCommand extends CapabilityGmCommand<WallSegment[]> {
  readonly type: typeof PUBLIC_REMOVE_WALL;
  readonly mapId: string;
  readonly segmentId: string;
}

export interface ApplyCapabilityFogCommand extends CapabilityGmCommand<FogState> {
  readonly type: typeof PUBLIC_APPLY_FOG;
  readonly mapId: string;
  readonly operation: FogOperation;
}

export interface AddCapabilityLightCommand extends CapabilityGmCommand<LightSource[]> {
  readonly type: typeof PUBLIC_ADD_LIGHT;
  readonly mapId: string;
  readonly light: LightSource;
}

export interface UpdateCapabilityLightCommand extends CapabilityGmCommand<LightSource[]> {
  readonly type: typeof PUBLIC_UPDATE_LIGHT;
  readonly mapId: string;
  readonly light: LightSource;
}

export interface RemoveCapabilityLightCommand extends CapabilityGmCommand<LightSource[]> {
  readonly type: typeof PUBLIC_REMOVE_LIGHT;
  readonly mapId: string;
  readonly lightId: string;
}

export interface SetCapabilityLightingCommand extends CapabilityGmCommand<boolean> {
  readonly type: typeof PUBLIC_SET_LIGHTING;
  readonly mapId: string;
  readonly enabled: boolean;
}

export interface SetCapabilityAtmosphereEffectCommand extends CapabilityGmCommand<
  string | null
> {
  readonly type: typeof PUBLIC_SET_ATMOSPHERE_EFFECT;
  readonly effect: string | null;
}

export interface SetCapabilityAtmosphereAudioCommand extends CapabilityGmCommand<{
  assetId: string | null;
  audioUrl: string | null;
  volume: number;
  loop: boolean;
}> {
  readonly type: typeof PUBLIC_SET_ATMOSPHERE_AUDIO;
  readonly assetId: string | null;
  readonly volume?: number;
  readonly loop?: boolean;
}

export interface SetCapabilityVibeCommand extends CapabilityGmCommand<VibePeriod> {
  readonly type: typeof PUBLIC_SET_VIBE;
  readonly period: string;
}

export interface StartCapabilitySessionCommand extends CapabilityGmCommand<CampaignSessionRecord> {
  readonly type: typeof PUBLIC_START_SESSION;
}

export interface PauseCapabilitySessionCommand extends CapabilityGmCommand<CampaignSessionRecord> {
  readonly type: typeof PUBLIC_PAUSE_SESSION;
  readonly sessionId: string;
}

export interface ResumeCapabilitySessionCommand extends CapabilityGmCommand<CampaignSessionRecord> {
  readonly type: typeof PUBLIC_RESUME_SESSION;
}

export interface EndCapabilitySessionCommand extends CapabilityGmCommand<{
  session: CampaignSessionRecord;
  stateSaved: unknown;
}> {
  readonly type: typeof PUBLIC_END_SESSION;
  readonly sessionId: string;
  readonly saveState?: boolean;
  readonly notes?: string;
}

abstract class CapabilityGmBase {
  constructor(
    protected readonly commands: CommandBus,
    private readonly memberships: CapabilityGameplayMembership,
    protected readonly events: CapabilityGameplayEventPublisher,
  ) {}

  protected async requireDm(command: CapabilityGmCommand<unknown>): Promise<void> {
    const role = await this.memberships.role(
      command.actorId,
      command.campaignId,
    );
    if (role !== "DM") {
      throw new CapabilityGameplayError(
        "Only a DM can control this campaign system",
      );
    }
  }

  protected actor(command: CapabilityGmCommand<unknown>) {
    return { campaignId: command.campaignId, role: "DM" as const };
  }

  protected async currentMap(command: CapabilityGmCommand<unknown>, mapId: string) {
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

export class ActivateCapabilityMap
  extends CapabilityGmBase
  implements CommandHandler<ActivateCapabilityMapCommand, MapCoreRecord>
{
  async execute(command: ActivateCapabilityMapCommand): Promise<MapCoreRecord> {
    await this.requireDm(command);
    await this.commands.dispatch<SetCurrentMapCommand, unknown>({
      type: SET_CURRENT_MAP,
      campaignId: command.campaignId,
      mapId: command.mapId,
    });
    return this.currentMap(command, command.mapId);
  }
}

abstract class CapabilitySceneMutation<
  TCommand extends CapabilityGmCommand<TResult>,
  TResult,
>
  extends CapabilityGmBase
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

export class AddCapabilityWall extends CapabilitySceneMutation<
  AddCapabilityWallCommand,
  WallSegment[]
> {
  protected mapId(command: AddCapabilityWallCommand) {
    return command.mapId;
  }
  protected mutate(command: AddCapabilityWallCommand) {
    return this.commands.dispatch<AddWallSegmentCommand, WallSegment[]>({
      type: ADD_WALL_SEGMENT,
      actor: this.actor(command),
      mapId: command.mapId,
      segment: command.segment,
    });
  }
}

export class UpdateCapabilityWall extends CapabilitySceneMutation<
  UpdateCapabilityWallCommand,
  WallSegment[]
> {
  protected mapId(command: UpdateCapabilityWallCommand) {
    return command.mapId;
  }
  protected mutate(command: UpdateCapabilityWallCommand) {
    return this.commands.dispatch<UpdateWallSegmentCommand, WallSegment[]>({
      type: UPDATE_WALL_SEGMENT,
      actor: this.actor(command),
      mapId: command.mapId,
      segment: command.segment,
    });
  }
}

export class RemoveCapabilityWall extends CapabilitySceneMutation<
  RemoveCapabilityWallCommand,
  WallSegment[]
> {
  protected mapId(command: RemoveCapabilityWallCommand) {
    return command.mapId;
  }
  protected mutate(command: RemoveCapabilityWallCommand) {
    return this.commands.dispatch<RemoveWallSegmentCommand, WallSegment[]>({
      type: REMOVE_WALL_SEGMENT,
      actor: this.actor(command),
      mapId: command.mapId,
      segmentId: command.segmentId,
    });
  }
}

export class ApplyCapabilityFog extends CapabilitySceneMutation<
  ApplyCapabilityFogCommand,
  FogState
> {
  protected mapId(command: ApplyCapabilityFogCommand) {
    return command.mapId;
  }
  protected mutate(command: ApplyCapabilityFogCommand) {
    return this.commands.dispatch<ApplyFogOperationCommand, FogState>({
      type: APPLY_FOG_OPERATION,
      actor: this.actor(command),
      mapId: command.mapId,
      operation: command.operation,
    });
  }
}

export class AddCapabilityLight extends CapabilitySceneMutation<
  AddCapabilityLightCommand,
  LightSource[]
> {
  protected mapId(command: AddCapabilityLightCommand) {
    return command.mapId;
  }
  protected mutate(command: AddCapabilityLightCommand) {
    return this.commands.dispatch<AddLightSourceCommand, LightSource[]>({
      type: ADD_LIGHT_SOURCE,
      actor: this.actor(command),
      mapId: command.mapId,
      light: command.light,
    });
  }
}

export class UpdateCapabilityLight extends CapabilitySceneMutation<
  UpdateCapabilityLightCommand,
  LightSource[]
> {
  protected mapId(command: UpdateCapabilityLightCommand) {
    return command.mapId;
  }
  protected mutate(command: UpdateCapabilityLightCommand) {
    return this.commands.dispatch<UpdateLightSourceCommand, LightSource[]>({
      type: UPDATE_LIGHT_SOURCE,
      actor: this.actor(command),
      mapId: command.mapId,
      light: command.light,
    });
  }
}

export class RemoveCapabilityLight extends CapabilitySceneMutation<
  RemoveCapabilityLightCommand,
  LightSource[]
> {
  protected mapId(command: RemoveCapabilityLightCommand) {
    return command.mapId;
  }
  protected mutate(command: RemoveCapabilityLightCommand) {
    return this.commands.dispatch<RemoveLightSourceCommand, LightSource[]>({
      type: REMOVE_LIGHT_SOURCE,
      actor: this.actor(command),
      mapId: command.mapId,
      lightId: command.lightId,
    });
  }
}

export class SetCapabilityLighting extends CapabilitySceneMutation<
  SetCapabilityLightingCommand,
  boolean
> {
  protected mapId(command: SetCapabilityLightingCommand) {
    return command.mapId;
  }
  protected mutate(command: SetCapabilityLightingCommand) {
    return this.commands.dispatch<SetSceneLightingEnabledCommand, boolean>({
      type: SET_SCENE_LIGHTING_ENABLED,
      actor: this.actor(command),
      mapId: command.mapId,
      enabled: command.enabled,
    });
  }
}

export class SetCapabilityAtmosphereEffect
  extends CapabilityGmBase
  implements CommandHandler<SetCapabilityAtmosphereEffectCommand, string | null>
{
  async execute(command: SetCapabilityAtmosphereEffectCommand) {
    await this.requireDm(command);
    return this.commands.dispatch<SetAtmosphereEffectCommand, string | null>({
      type: SET_ATMOSPHERE_EFFECT,
      campaignId: command.campaignId,
      effect: command.effect,
      actorId: command.actorId,
    });
  }
}

export class SetCapabilityAtmosphereAudio
  extends CapabilityGmBase
  implements
    CommandHandler<
      SetCapabilityAtmosphereAudioCommand,
      {
        assetId: string | null;
        audioUrl: string | null;
        volume: number;
        loop: boolean;
      }
    >
{
  async execute(command: SetCapabilityAtmosphereAudioCommand) {
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

export class SetCapabilityVibe
  extends CapabilityGmBase
  implements CommandHandler<SetCapabilityVibeCommand, VibePeriod>
{
  async execute(command: SetCapabilityVibeCommand) {
    await this.requireDm(command);
    return this.commands.dispatch<SetCampaignVibeCommand, VibePeriod>({
      type: SET_CAMPAIGN_VIBE,
      campaignId: command.campaignId,
      period: command.period,
      actorId: command.actorId,
    });
  }
}

export class StartCapabilitySession
  extends CapabilityGmBase
  implements CommandHandler<StartCapabilitySessionCommand, CampaignSessionRecord>
{
  async execute(command: StartCapabilitySessionCommand) {
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

export class PauseCapabilitySession
  extends CapabilityGmBase
  implements CommandHandler<PauseCapabilitySessionCommand, CampaignSessionRecord>
{
  async execute(command: PauseCapabilitySessionCommand) {
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

export class ResumeCapabilitySession
  extends CapabilityGmBase
  implements CommandHandler<ResumeCapabilitySessionCommand, CampaignSessionRecord>
{
  async execute(command: ResumeCapabilitySessionCommand) {
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

export class EndCapabilitySession
  extends CapabilityGmBase
  implements
    CommandHandler<
      EndCapabilitySessionCommand,
      { session: CampaignSessionRecord; stateSaved: unknown }
    >
{
  async execute(command: EndCapabilitySessionCommand) {
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
