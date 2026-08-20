import { FogState, LightSource, SceneMap, WallSegment } from '../domain/scene/Scene';

/** Persistence boundary for authoritative, map-scoped wall/fog/light mutations. */
export interface SceneMutationRepository {
  findMap(mapId: string): Promise<SceneMap | null>;
  updateWallSegments(mapId: string, expectedRevision: number, wallSegments: WallSegment[]): Promise<number>;
  updateFog(mapId: string, expectedRevision: number, fog: FogState): Promise<number>;
  updateLights(mapId: string, expectedRevision: number, lights: LightSource[]): Promise<number>;
  updateLightingEnabled(mapId: string, expectedRevision: number, enabled: boolean): Promise<number>;
}
