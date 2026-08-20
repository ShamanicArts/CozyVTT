import {
  applyFogOperation,
  FogOperation,
  FogState,
  LightSource,
  SceneActor,
  SceneMap,
  SceneMutationError,
  WallSegment,
} from '../../domain/scene/Scene';
import { loadFogState } from '../../domain/scene/Scene';
import { SceneMutationRepository } from '../../ports/SceneMutationRepository';
import { Command, CommandHandler } from '../commands/CommandBus';

export const ADD_WALL_SEGMENT = 'scene.wall.add' as const;
export const REMOVE_WALL_SEGMENT = 'scene.wall.remove' as const;
export const UPDATE_WALL_SEGMENT = 'scene.wall.update' as const;
export const REPLACE_WALL_SEGMENTS = 'scene.walls.replace' as const;
export const APPLY_FOG_OPERATION = 'scene.fog.apply-operation' as const;
export const ADD_LIGHT_SOURCE = 'scene.light.add' as const;
export const REMOVE_LIGHT_SOURCE = 'scene.light.remove' as const;
export const UPDATE_LIGHT_SOURCE = 'scene.light.update' as const;
export const REPLACE_LIGHT_SOURCES = 'scene.lights.replace' as const;
export const SET_SCENE_LIGHTING_ENABLED = 'scene.lighting.set-enabled' as const;

interface SceneCommand<TResult> extends Command<TResult> {
  readonly actor: SceneActor;
  readonly mapId: string;
}

export interface AddWallSegmentCommand extends SceneCommand<WallSegment[]> {
  readonly type: typeof ADD_WALL_SEGMENT;
  readonly segment: WallSegment;
}

export interface RemoveWallSegmentCommand extends SceneCommand<WallSegment[]> {
  readonly type: typeof REMOVE_WALL_SEGMENT;
  readonly segmentId: string;
}

export interface UpdateWallSegmentCommand extends SceneCommand<WallSegment[]> {
  readonly type: typeof UPDATE_WALL_SEGMENT;
  readonly segment: WallSegment;
}

export interface ReplaceWallSegmentsCommand extends SceneCommand<WallSegment[]> {
  readonly type: typeof REPLACE_WALL_SEGMENTS;
  readonly segments: WallSegment[];
}

export interface ApplyFogOperationCommand extends SceneCommand<FogState> {
  readonly type: typeof APPLY_FOG_OPERATION;
  readonly operation: FogOperation;
}

export interface AddLightSourceCommand extends SceneCommand<LightSource[]> {
  readonly type: typeof ADD_LIGHT_SOURCE;
  readonly light: LightSource;
}

export interface RemoveLightSourceCommand extends SceneCommand<LightSource[]> {
  readonly type: typeof REMOVE_LIGHT_SOURCE;
  readonly lightId: string;
}

export interface UpdateLightSourceCommand extends SceneCommand<LightSource[]> {
  readonly type: typeof UPDATE_LIGHT_SOURCE;
  readonly light: LightSource;
}

export interface ReplaceLightSourcesCommand extends SceneCommand<LightSource[]> {
  readonly type: typeof REPLACE_LIGHT_SOURCES;
  readonly lights: LightSource[];
}

export interface SetSceneLightingEnabledCommand extends SceneCommand<boolean> {
  readonly type: typeof SET_SCENE_LIGHTING_ENABLED;
  readonly enabled: boolean;
}

abstract class SceneCommandBase {
  constructor(protected readonly repository: SceneMutationRepository) {}

  protected async loadMap(actor: SceneActor, mapId: string): Promise<SceneMap> {
    const map = await this.repository.findMap(mapId);
    if (!map || map.campaignId !== actor.campaignId) {
      throw new SceneMutationError('MAP_NOT_FOUND', 'Map not found');
    }
    return map;
  }

  protected requireDm(actor: SceneActor, message: string): void {
    if (actor.role !== 'DM') throw new SceneMutationError('DM_REQUIRED', message);
  }
}

export class AddWallSegment extends SceneCommandBase implements CommandHandler<AddWallSegmentCommand, WallSegment[]> {
  async execute(command: AddWallSegmentCommand): Promise<WallSegment[]> {
    this.requireDm(command.actor, 'Only DMs can add wall segments');
    const map = await this.loadMap(command.actor, command.mapId);
    if (map.wallSegments.length >= 5000) {
      throw new SceneMutationError('MAX_WALL_SEGMENTS', 'Maximum 5000 wall segments per map');
    }
    const segments = [...map.wallSegments, command.segment];
    await this.repository.updateWallSegments(command.mapId, segments);
    return segments;
  }
}

export class RemoveWallSegment extends SceneCommandBase implements CommandHandler<RemoveWallSegmentCommand, WallSegment[]> {
  async execute(command: RemoveWallSegmentCommand): Promise<WallSegment[]> {
    this.requireDm(command.actor, 'Only DMs can remove wall segments');
    const map = await this.loadMap(command.actor, command.mapId);
    const segments = map.wallSegments.filter((segment) => segment.id !== command.segmentId);
    await this.repository.updateWallSegments(command.mapId, segments);
    return segments;
  }
}

export class UpdateWallSegment extends SceneCommandBase implements CommandHandler<UpdateWallSegmentCommand, WallSegment[]> {
  async execute(command: UpdateWallSegmentCommand): Promise<WallSegment[]> {
    if (command.actor.role !== 'DM' && command.actor.role !== 'PLAYER') {
      throw new SceneMutationError('WALL_UPDATE_NOT_ALLOWED', 'Permission denied');
    }
    const map = await this.loadMap(command.actor, command.mapId);
    const index = map.wallSegments.findIndex((segment) => segment.id === command.segment.id);
    if (index === -1) throw new SceneMutationError('WALL_NOT_FOUND', 'Wall segment not found');

    if (command.actor.role !== 'DM') {
      const currentType = map.wallSegments[index].type;
      if (currentType === 'door-locked') {
        throw new SceneMutationError('DOOR_LOCKED', 'That door is locked');
      }
      const isDoorToggle = command.segment.type === 'door-open' || command.segment.type === 'door-closed';
      const currentIsDoor = currentType === 'door-open' || currentType === 'door-closed';
      if (!isDoorToggle || !currentIsDoor) {
        throw new SceneMutationError('PLAYER_DOOR_ONLY', 'Players may only toggle doors');
      }
    }

    const segments = [...map.wallSegments];
    segments[index] = command.segment;
    await this.repository.updateWallSegments(command.mapId, segments);
    return segments;
  }
}

export class ReplaceWallSegments extends SceneCommandBase implements CommandHandler<ReplaceWallSegmentsCommand, WallSegment[]> {
  async execute(command: ReplaceWallSegmentsCommand): Promise<WallSegment[]> {
    this.requireDm(command.actor, 'Only DMs can replace wall segments');
    await this.loadMap(command.actor, command.mapId);
    await this.repository.updateWallSegments(command.mapId, command.segments);
    return command.segments;
  }
}

export class ApplyFogOperation extends SceneCommandBase implements CommandHandler<ApplyFogOperationCommand, FogState> {
  async execute(command: ApplyFogOperationCommand): Promise<FogState> {
    this.requireDm(command.actor, 'Only DMs can modify fog of war');
    const map = await this.loadMap(command.actor, command.mapId);
    const fog = loadFogState(map, map.fogData);
    applyFogOperation(fog, command.operation);
    await this.repository.updateFog(command.mapId, fog);
    return fog;
  }
}

export class AddLightSource extends SceneCommandBase implements CommandHandler<AddLightSourceCommand, LightSource[]> {
  async execute(command: AddLightSourceCommand): Promise<LightSource[]> {
    this.requireDm(command.actor, 'Only DMs can add light sources');
    const map = await this.loadMap(command.actor, command.mapId);
    if (map.lights.length >= 200) {
      throw new SceneMutationError('MAX_LIGHT_SOURCES', 'Maximum 200 light sources per map');
    }
    const lights = [...map.lights, command.light];
    await this.repository.updateLights(command.mapId, lights);
    return lights;
  }
}

export class RemoveLightSource extends SceneCommandBase implements CommandHandler<RemoveLightSourceCommand, LightSource[]> {
  async execute(command: RemoveLightSourceCommand): Promise<LightSource[]> {
    this.requireDm(command.actor, 'Only DMs can remove light sources');
    const map = await this.loadMap(command.actor, command.mapId);
    const lights = map.lights.filter((light) => light.id !== command.lightId);
    await this.repository.updateLights(command.mapId, lights);
    return lights;
  }
}

export class UpdateLightSource extends SceneCommandBase implements CommandHandler<UpdateLightSourceCommand, LightSource[]> {
  async execute(command: UpdateLightSourceCommand): Promise<LightSource[]> {
    this.requireDm(command.actor, 'Only DMs can update light sources');
    const map = await this.loadMap(command.actor, command.mapId);
    const index = map.lights.findIndex((light) => light.id === command.light.id);
    if (index === -1) throw new SceneMutationError('LIGHT_NOT_FOUND', 'Light source not found');
    const lights = [...map.lights];
    lights[index] = command.light;
    await this.repository.updateLights(command.mapId, lights);
    return lights;
  }
}

export class ReplaceLightSources extends SceneCommandBase implements CommandHandler<ReplaceLightSourcesCommand, LightSource[]> {
  async execute(command: ReplaceLightSourcesCommand): Promise<LightSource[]> {
    this.requireDm(command.actor, 'Only DMs can replace light sources');
    await this.loadMap(command.actor, command.mapId);
    await this.repository.updateLights(command.mapId, command.lights);
    return command.lights;
  }
}

export class SetSceneLightingEnabled extends SceneCommandBase implements CommandHandler<SetSceneLightingEnabledCommand, boolean> {
  async execute(command: SetSceneLightingEnabledCommand): Promise<boolean> {
    this.requireDm(command.actor, 'Only DMs can change dynamic lighting');
    await this.loadMap(command.actor, command.mapId);
    await this.repository.updateLightingEnabled(command.mapId, command.enabled);
    return command.enabled;
  }
}
