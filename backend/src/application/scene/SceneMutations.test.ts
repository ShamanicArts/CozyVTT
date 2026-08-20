import {
  ADD_LIGHT_SOURCE,
  ADD_WALL_SEGMENT,
  APPLY_FOG_OPERATION,
  AddLightSource,
  AddWallSegment,
  ApplyFogOperation,
  UpdateWallSegment,
  UPDATE_WALL_SEGMENT,
} from './SceneMutations';
import { FogState, LightSource, SceneMap, SceneMutationError, WallSegment } from '../../domain/scene/Scene';
import { SceneMutationRepository } from '../../ports/SceneMutationRepository';

const wall = (id = 'wall-1', type: WallSegment['type'] = 'wall'): WallSegment => ({
  id, type, x1: 1, y1: 1, x2: 2, y2: 2,
});
const light = (id = 'light-1'): LightSource => ({
  id, x: 2, y: 3, brightRadius: 4, dimRadius: 8, color: '#ffcc88', enabled: true,
});

function mapWith(overrides: Partial<SceneMap> = {}): SceneMap {
  return {
    id: 'map-1', campaignId: 'campaign-1', width: 10, height: 8, gridSize: 50,
    wallSegments: [wall()], fogData: null, lights: [light()], ...overrides,
  };
}

function repositoryFor(map: SceneMap | null = mapWith()): jest.Mocked<SceneMutationRepository> {
  return {
    findMap: jest.fn(async (_mapId: string) => map),
    updateWallSegments: jest.fn(async (_mapId: string, _wallSegments: WallSegment[]) => undefined),
    updateFog: jest.fn(async (_mapId: string, _fog: FogState) => undefined),
    updateLights: jest.fn(async (_mapId: string, _lights: LightSource[]) => undefined),
  };
}

const dm = { campaignId: 'campaign-1', role: 'DM' as const };
const player = { campaignId: 'campaign-1', role: 'PLAYER' as const };

describe('scene mutation commands', () => {
  it('persists an added wall only after campaign-scoped DM authorization', async () => {
    const repository = repositoryFor();
    const segment = wall('wall-2');

    const result = await new AddWallSegment(repository).execute({
      type: ADD_WALL_SEGMENT, actor: dm, mapId: 'map-1', segment,
    });

    expect(result).toEqual([wall(), segment]);
    expect(repository.updateWallSegments).toHaveBeenCalledWith('map-1', [wall(), segment]);
  });

  it('preserves the DM-only guard before reading or writing the map', async () => {
    const repository = repositoryFor();

    await expect(new AddWallSegment(repository).execute({
      type: ADD_WALL_SEGMENT, actor: player, mapId: 'map-1', segment: wall('wall-2'),
    })).rejects.toEqual(new SceneMutationError('DM_REQUIRED', 'Only DMs can add wall segments'));
    expect(repository.findMap).not.toHaveBeenCalled();
    expect(repository.updateWallSegments).not.toHaveBeenCalled();
  });

  it('allows players to toggle unlocked doors but denies locked doors and non-door conversions', async () => {
    const unlockedRepository = repositoryFor(mapWith({ wallSegments: [wall('door-1', 'door-closed')] }));
    await new UpdateWallSegment(unlockedRepository).execute({
      type: UPDATE_WALL_SEGMENT, actor: player, mapId: 'map-1', segment: wall('door-1', 'door-open'),
    });
    expect(unlockedRepository.updateWallSegments).toHaveBeenCalledWith('map-1', [wall('door-1', 'door-open')]);

    const lockedRepository = repositoryFor(mapWith({ wallSegments: [wall('door-1', 'door-locked')] }));
    await expect(new UpdateWallSegment(lockedRepository).execute({
      type: UPDATE_WALL_SEGMENT, actor: player, mapId: 'map-1', segment: wall('door-1', 'door-open'),
    })).rejects.toEqual(new SceneMutationError('DOOR_LOCKED', 'That door is locked'));
    expect(lockedRepository.updateWallSegments).not.toHaveBeenCalled();

    const plainWallRepository = repositoryFor();
    await expect(new UpdateWallSegment(plainWallRepository).execute({
      type: UPDATE_WALL_SEGMENT, actor: player, mapId: 'map-1', segment: wall('wall-1', 'door-open'),
    })).rejects.toEqual(new SceneMutationError('PLAYER_DOOR_ONLY', 'Players may only toggle doors'));
    expect(plainWallRepository.updateWallSegments).not.toHaveBeenCalled();
  });

  it('builds aligned fog, ignores out-of-range cell indexes, then persists before returning the broadcast state', async () => {
    const repository = repositoryFor(mapWith({ width: 3, height: 2, gridSize: 25 }));

    const fog = await new ApplyFogOperation(repository).execute({
      type: APPLY_FOG_OPERATION, actor: dm, mapId: 'map-1', operation: { op: 'reveal', cells: [0, 3, 99] },
    });

    expect(fog).toEqual({ fogCols: 3, fogRows: 2, cellPx: 25, revealed: [true, false, false, true, false, false] });
    expect(repository.updateFog).toHaveBeenCalledWith('map-1', fog);
  });

  it('enforces the light-source cap before persisting', async () => {
    const repository = repositoryFor(mapWith({ lights: Array.from({ length: 200 }, (_, index) => light(`light-${index}`)) }));

    await expect(new AddLightSource(repository).execute({
      type: ADD_LIGHT_SOURCE, actor: dm, mapId: 'map-1', light: light('light-201'),
    })).rejects.toEqual(new SceneMutationError('MAX_LIGHT_SOURCES', 'Maximum 200 light sources per map'));
    expect(repository.updateLights).not.toHaveBeenCalled();
  });
});
