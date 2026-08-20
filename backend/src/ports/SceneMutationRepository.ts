import { FogState, LightSource, SceneMap, WallSegment } from '../domain/scene/Scene';

/** Persistence boundary for authoritative, map-scoped wall/fog/light mutations. */
export interface SceneMutationRepository {
  findMap(mapId: string): Promise<SceneMap | null>;
  updateWallSegments(mapId: string, wallSegments: WallSegment[]): Promise<void>;
  updateFog(mapId: string, fog: FogState): Promise<void>;
  updateLights(mapId: string, lights: LightSource[]): Promise<void>;
}
