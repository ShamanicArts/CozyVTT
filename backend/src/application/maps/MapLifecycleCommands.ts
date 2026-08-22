import {
  CurrentMapCampaign,
  MapCoreRecord,
  MapCoreUpdateData,
  MapLifecycleError,
  mapNotFound,
  mapNotInCampaign,
  validationError,
} from '../../domain/maps/MapLifecycle';
import { MapCoreRepository } from '../../ports/MapCoreRepository';
import { normalizeAssetUrl } from '../../utils/asset-urls';
import { Command, CommandHandler } from '../commands/CommandBus';

export const CREATE_MAP = 'map.create' as const;
export const UPDATE_MAP = 'map.update' as const;
export const DELETE_MAP = 'map.delete' as const;
export const SET_CURRENT_MAP = 'map.set-current' as const;
export const CHANGE_MAP = 'map.change' as const;

export interface CreateMapCommand extends Command<MapCoreRecord> {
  readonly type: typeof CREATE_MAP;
  readonly campaignId: string;
  readonly input: Record<string, unknown>;
}

export interface MapUpdateResult {
  map: MapCoreRecord;
  /** A validated lighting intent that the HTTP adapter applies via the scene command. */
  lightingEnabled?: boolean;
}

export interface UpdateMapCommand extends Command<MapUpdateResult> {
  readonly type: typeof UPDATE_MAP;
  readonly campaignId: string;
  readonly mapId: string;
  readonly input: Record<string, unknown>;
}

export interface DeleteMapCommand extends Command<void> {
  readonly type: typeof DELETE_MAP;
  readonly campaignId: string;
  readonly mapId: string;
}

export interface SetCurrentMapCommand extends Command<CurrentMapCampaign> {
  readonly type: typeof SET_CURRENT_MAP;
  readonly campaignId: string;
  readonly mapId: string;
}

/** Fetches an in-campaign map for the Socket.IO map.change adapter. */
export interface ChangeMapCommand extends Command<MapCoreRecord> {
  readonly type: typeof CHANGE_MAP;
  readonly campaignId: string;
  readonly mapId: string;
}

abstract class MapCommandBase {
  constructor(protected readonly repository: MapCoreRepository) {}

  protected async mapInCampaign(campaignId: string, mapId: string): Promise<MapCoreRecord> {
    const map = await this.repository.findMap(mapId);
    if (!map) throw mapNotFound();
    if (map.campaignId !== campaignId) throw mapNotInCampaign();
    return map;
  }
}

export class CreateMap implements CommandHandler<CreateMapCommand, MapCoreRecord> {
  constructor(private readonly repository: MapCoreRepository) {}

  async execute(command: CreateMapCommand): Promise<MapCoreRecord> {
    const { input } = command;
    const name = input.name;
    const imageUrl = input.imageUrl;
    const width = input.width;
    const height = input.height;
    if (!name || typeof name !== 'string' || name.trim().length === 0) throw validationError('Map name is required');
    if (!imageUrl || typeof imageUrl !== 'string') throw validationError('Map imageUrl (asset ID) is required');
    if (!width || typeof width !== 'number' || width <= 0) throw validationError('Map width must be a positive number');
    if (!height || typeof height !== 'number' || height <= 0) throw validationError('Map height must be a positive number');

    const normalizedImageUrl = normalizeAssetUrl(imageUrl, 'maps');
    if (!normalizedImageUrl) throw validationError('Invalid map imageUrl');
    const spiritLayerUrl = input.spiritLayerUrl ? normalizeAssetUrl(input.spiritLayerUrl as string, 'maps') : null;
    const gridSize = input.gridSize && typeof input.gridSize === 'number' && input.gridSize > 0 ? input.gridSize : 50;
    const rawFeetPerSquare = input.feetPerSquare;
    const feetPerSquare = typeof rawFeetPerSquare === 'number' && rawFeetPerSquare && Number.isInteger(rawFeetPerSquare) && rawFeetPerSquare > 0 && rawFeetPerSquare <= 100
      ? rawFeetPerSquare : 5;
    const diagonalRule = input.diagonalRule === 'flat' || input.diagonalRule === 'alternating' ? input.diagonalRule : 'flat';

    return this.repository.createMap({
      campaignId: command.campaignId, name: name.trim(), imageUrl: normalizedImageUrl, baseLayerUrl: normalizedImageUrl,
      width, height, gridSize, feetPerSquare, diagonalRule, spiritLayerUrl, tokens: [], annotations: [],
    });
  }
}

export class UpdateMap extends MapCommandBase implements CommandHandler<UpdateMapCommand, MapUpdateResult> {
  async execute(command: UpdateMapCommand): Promise<MapUpdateResult> {
    // Load before validation: this deliberately retains the existing REST error ordering.
    const existingMap = await this.mapInCampaign(command.campaignId, command.mapId);
    const { data, lightingEnabled } = buildMapUpdate(command.input);
    // For a lighting-only generic update, let the scene command perform the
    // sole persistence write. An empty PUT keeps the legacy no-op map update.
    const map = Object.keys(data).length === 0 && lightingEnabled !== undefined
      ? existingMap
      : await this.repository.updateMap(command.mapId, existingMap.revision, data);
    return lightingEnabled === undefined ? { map } : { map, lightingEnabled };
  }
}

export class DeleteMap extends MapCommandBase implements CommandHandler<DeleteMapCommand, void> {
  async execute(command: DeleteMapCommand): Promise<void> {
    await this.mapInCampaign(command.campaignId, command.mapId);
    if (await this.repository.findCurrentMapId(command.campaignId) === command.mapId) {
      throw new MapLifecycleError(
        'CURRENT_MAP_CANNOT_DELETE', 400, 'Validation Error',
        'Cannot delete the current map. Set a different map as current first.'
      );
    }
    await this.repository.deleteMap(command.mapId);
  }
}

export class SetCurrentMap extends MapCommandBase implements CommandHandler<SetCurrentMapCommand, CurrentMapCampaign> {
  async execute(command: SetCurrentMapCommand): Promise<CurrentMapCampaign> {
    await this.mapInCampaign(command.campaignId, command.mapId);
    return this.repository.setCurrentMap(command.campaignId, command.mapId);
  }
}

export class ChangeMap extends MapCommandBase implements CommandHandler<ChangeMapCommand, MapCoreRecord> {
  async execute(command: ChangeMapCommand): Promise<MapCoreRecord> {
    return this.mapInCampaign(command.campaignId, command.mapId);
  }
}

function buildMapUpdate(input: Record<string, unknown>): {
  data: MapCoreUpdateData;
  lightingEnabled?: boolean;
} {
  const data: MapCoreUpdateData = {};
  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || input.name.trim().length === 0) throw validationError('Map name must be a non-empty string');
    data.name = input.name.trim();
  }
  if (input.width !== undefined) {
    if (typeof input.width !== 'number' || input.width <= 0) throw validationError('Map width must be a positive number');
    data.width = input.width;
  }
  if (input.height !== undefined) {
    if (typeof input.height !== 'number' || input.height <= 0) throw validationError('Map height must be a positive number');
    data.height = input.height;
  }
  if (input.gridSize !== undefined) {
    if (typeof input.gridSize !== 'number' || input.gridSize <= 0) throw validationError('Grid size must be a positive number');
    data.gridSize = input.gridSize;
  }
  if (input.feetPerSquare !== undefined) {
    const feetPerSquare = input.feetPerSquare;
    if (typeof feetPerSquare !== 'number' || !Number.isInteger(feetPerSquare) || feetPerSquare < 1 || feetPerSquare > 100) {
      throw validationError('feetPerSquare must be a positive integer between 1 and 100');
    }
    data.feetPerSquare = feetPerSquare;
  }
  if (input.diagonalRule !== undefined) {
    if (input.diagonalRule !== 'flat' && input.diagonalRule !== 'alternating') throw validationError('diagonalRule must be "flat" or "alternating"');
    data.diagonalRule = input.diagonalRule;
  }
  if (input.imageUrl !== undefined) {
    if (typeof input.imageUrl !== 'string') throw validationError('Image URL must be a string');
    const imageUrl = normalizeAssetUrl(input.imageUrl, 'maps');
    if (!imageUrl) throw validationError('Invalid map imageUrl');
    data.imageUrl = imageUrl;
    data.baseLayerUrl = imageUrl;
  }
  if (input.spiritLayerUrl !== undefined) {
    if (input.spiritLayerUrl !== null && typeof input.spiritLayerUrl !== 'string') {
      throw validationError('Spirit layer URL must be a string or null');
    }
    data.spiritLayerUrl = input.spiritLayerUrl ? normalizeAssetUrl(input.spiritLayerUrl, 'maps') : null;
  }
  if (input.lightingEnabled !== undefined) {
    if (typeof input.lightingEnabled !== 'boolean') throw validationError('lightingEnabled must be a boolean');
    return { data, lightingEnabled: input.lightingEnabled };
  }
  return { data };
}
