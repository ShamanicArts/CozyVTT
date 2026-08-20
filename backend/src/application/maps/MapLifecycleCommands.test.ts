import {
  CHANGE_MAP,
  CREATE_MAP,
  DELETE_MAP,
  SET_CURRENT_MAP,
  UPDATE_MAP,
  ChangeMap,
  CreateMap,
  DeleteMap,
  SetCurrentMap,
  UpdateMap,
} from './MapLifecycleCommands';
import { CurrentMapCampaign, MapCoreRecord, MapLifecycleError } from '../../domain/maps/MapLifecycle';
import { MapAssetUrlNormalizer } from '../../ports/MapAssetUrlNormalizer';
import { MapCoreRepository } from '../../ports/MapCoreRepository';

function mapWith(overrides: Partial<MapCoreRecord> = {}): MapCoreRecord {
  return {
    id: 'map-1', campaignId: 'campaign-1', name: 'Old Map', imageUrl: '/api/assets/maps/old',
    baseLayerUrl: '/api/assets/maps/old', width: 20, height: 15, gridSize: 50, feetPerSquare: 5,
    diagonalRule: 'flat', spiritLayerUrl: null, tokens: [], annotations: [], wallSegments: [], fogData: null,
    lightingEnabled: false, lights: [], createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01'), ...overrides,
  };
}

function repositoryFor(map: MapCoreRecord | null = mapWith()): jest.Mocked<MapCoreRepository> {
  return {
    findMap: jest.fn(async (_mapId: string) => map),
    createMap: jest.fn(async (data) => mapWith({ ...data })),
    updateMap: jest.fn(async (_mapId: string, data) => mapWith(data)),
    deleteMap: jest.fn(async (_mapId: string) => undefined),
    findCurrentMapId: jest.fn(async (_campaignId: string) => null),
    setCurrentMap: jest.fn(async (_campaignId: string, _mapId: string): Promise<CurrentMapCampaign> => ({ currentMap: { id: 'map-1', name: 'Old Map', imageUrl: '/api/assets/maps/old' } })),
  };
}

const assets: jest.Mocked<MapAssetUrlNormalizer> = {
  normalizeMapAssetUrl: jest.fn((url: string) => `/api/assets/maps/${url}`),
};

beforeEach(() => jest.clearAllMocks());

describe('map lifecycle commands', () => {
  it('creates a map with established defaults and normalized asset paths', async () => {
    const repository = repositoryFor();
    await new CreateMap(repository, assets).execute({
      type: CREATE_MAP, campaignId: 'campaign-1', input: { name: '  Briar Hollow  ', imageUrl: 'asset-1', width: 30, height: 20 },
    });

    expect(repository.createMap).toHaveBeenCalledWith({
      campaignId: 'campaign-1', name: 'Briar Hollow', imageUrl: '/api/assets/maps/asset-1',
      baseLayerUrl: '/api/assets/maps/asset-1', width: 30, height: 20, gridSize: 50, feetPerSquare: 5,
      diagonalRule: 'flat', spiritLayerUrl: null, tokens: [], annotations: [],
    });
  });

  it('loads a map before update validation to retain not-found precedence', async () => {
    const repository = repositoryFor(null);
    await expect(new UpdateMap(repository, assets).execute({
      type: UPDATE_MAP, campaignId: 'campaign-1', mapId: 'missing', input: { width: -1 },
    })).rejects.toEqual(new MapLifecycleError('MAP_NOT_FOUND', 404, 'Not Found', 'Map not found'));
    expect(repository.updateMap).not.toHaveBeenCalled();
  });

  it('keeps image and base-layer URLs synchronized on update while returning lighting for the scene command', async () => {
    const repository = repositoryFor();
    const result = await new UpdateMap(repository, assets).execute({
      type: UPDATE_MAP, campaignId: 'campaign-1', mapId: 'map-1', input: { imageUrl: 'replacement', lightingEnabled: true },
    });
    expect(repository.updateMap).toHaveBeenCalledWith('map-1', {
      imageUrl: '/api/assets/maps/replacement', baseLayerUrl: '/api/assets/maps/replacement',
    });
    expect(result.lightingEnabled).toBe(true);
  });

  it('does not write lighting-only updates through the map-core repository', async () => {
    const repository = repositoryFor();
    const result = await new UpdateMap(repository, assets).execute({
      type: UPDATE_MAP, campaignId: 'campaign-1', mapId: 'map-1', input: { lightingEnabled: true },
    });

    expect(repository.updateMap).not.toHaveBeenCalled();
    expect(result).toEqual({ map: mapWith(), lightingEnabled: true });
  });

  it('does not delete the current map', async () => {
    const repository = repositoryFor();
    repository.findCurrentMapId.mockResolvedValue('map-1');
    await expect(new DeleteMap(repository).execute({ type: DELETE_MAP, campaignId: 'campaign-1', mapId: 'map-1' }))
      .rejects.toEqual(new MapLifecycleError('CURRENT_MAP_CANNOT_DELETE', 400, 'Validation Error', 'Cannot delete the current map. Set a different map as current first.'));
    expect(repository.deleteMap).not.toHaveBeenCalled();
  });

  it('sets the current map only after campaign-scoped lookup', async () => {
    const repository = repositoryFor();
    await new SetCurrentMap(repository).execute({ type: SET_CURRENT_MAP, campaignId: 'campaign-1', mapId: 'map-1' });
    expect(repository.setCurrentMap).toHaveBeenCalledWith('campaign-1', 'map-1');
  });

  it('shares map-change campaign isolation with Socket.IO adapters', async () => {
    const repository = repositoryFor(mapWith({ campaignId: 'other-campaign' }));
    await expect(new ChangeMap(repository).execute({ type: CHANGE_MAP, campaignId: 'campaign-1', mapId: 'map-1' }))
      .rejects.toEqual(new MapLifecycleError('MAP_NOT_IN_CAMPAIGN', 404, 'Not Found', 'Map not found in this campaign'));
  });
});
