/**
 * Transport- and persistence-neutral scene state used by map-edit commands.
 * Scene data is currently embedded as JSON on Map records, so this model is
 * intentionally independent from Prisma's JSON types and Socket.IO payloads.
 */

export type SceneRole = 'DM' | 'PLAYER' | 'SPECTATOR';

export interface SceneActor {
  campaignId: string;
  role: SceneRole;
}

export type WallType = 'wall' | 'door-closed' | 'door-open' | 'door-locked' | 'window';

export interface WallSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  type: WallType;
}

export interface LightSource {
  id: string;
  x: number;
  y: number;
  brightRadius: number;
  dimRadius: number;
  color: string;
  enabled: boolean;
}

export interface FogState {
  fogCols: number;
  fogRows: number;
  cellPx: number;
  revealed: boolean[];
}

export type FogOperation =
  | { op: 'reveal'; cells: number[] }
  | { op: 'hide'; cells: number[] }
  | { op: 'reveal_all' }
  | { op: 'hide_all' };

export interface SceneMap {
  id: string;
  revision: number;
  campaignId: string;
  width: number;
  height: number;
  gridSize: number;
  wallSegments: WallSegment[];
  fogData: FogState | null;
  lights: LightSource[];
  lightingEnabled: boolean;
}

export class SceneMutationError extends Error {
  constructor(
    public readonly code:
      | 'DM_REQUIRED'
      | 'WALL_UPDATE_NOT_ALLOWED'
      | 'MAP_NOT_FOUND'
      | 'MAX_WALL_SEGMENTS'
      | 'WALL_NOT_FOUND'
      | 'DOOR_LOCKED'
      | 'PLAYER_DOOR_ONLY'
      | 'MAX_LIGHT_SOURCES'
      | 'LIGHT_NOT_FOUND',
    message: string
  ) {
    super(message);
    this.name = 'SceneMutationError';
  }
}

export function buildFogState(map: Pick<SceneMap, 'width' | 'height' | 'gridSize'>): FogState {
  const cellPx = map.gridSize;
  const fogCols = map.width;
  const fogRows = map.height;
  return { fogCols, fogRows, cellPx, revealed: new Array(fogCols * fogRows).fill(false) };
}

/** Retains the legacy behaviour of resetting fog after a grid-size/dimension change. */
export function loadFogState(map: Pick<SceneMap, 'width' | 'height' | 'gridSize'>, stored: FogState | null): FogState {
  const expected = buildFogState(map);
  if (!stored || stored.cellPx !== expected.cellPx || stored.fogCols !== expected.fogCols || stored.fogRows !== expected.fogRows) {
    return expected;
  }
  return stored;
}

export function applyFogOperation(fog: FogState, operation: FogOperation): void {
  const total = fog.fogCols * fog.fogRows;
  switch (operation.op) {
    case 'reveal_all':
      fog.revealed.fill(true);
      break;
    case 'hide_all':
      fog.revealed.fill(false);
      break;
    case 'reveal':
      for (const index of operation.cells) if (index >= 0 && index < total) fog.revealed[index] = true;
      break;
    case 'hide':
      for (const index of operation.cells) if (index >= 0 && index < total) fog.revealed[index] = false;
      break;
  }
}

export function revealedCellIndices(fog: FogState): number[] {
  return fog.revealed.reduce<number[]>((indices, revealed, index) => {
    if (revealed) indices.push(index);
    return indices;
  }, []);
}
