import { Prisma, PrismaClient } from '@prisma/client';
import { FogState, LightSource, SceneMap, WallSegment } from '../../domain/scene/Scene';
import { SceneMutationRepository } from '../../ports/SceneMutationRepository';
import { updateMapAtRevision } from './PrismaMapRevision';

/** Prisma adapter for the scene JSON fields embedded in a map record. */
export class PrismaSceneMutationRepository implements SceneMutationRepository {
  constructor(private readonly client: PrismaClient) {}

  async findMap(mapId: string): Promise<SceneMap | null> {
    const map = await this.client.map.findUnique({
      where: { id: mapId },
      select: {
        id: true,
        revision: true,
        campaignId: true,
        width: true,
        height: true,
        gridSize: true,
        wallSegments: true,
        fogData: true,
        lights: true,
        lightingEnabled: true,
      },
    });
    if (!map) return null;

    return {
      ...map,
      wallSegments: (Array.isArray(map.wallSegments) ? map.wallSegments : []) as unknown as WallSegment[],
      fogData: map.fogData as unknown as FogState | null,
      lights: (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[],
    };
  }

  async updateWallSegments(mapId: string, expectedRevision: number, wallSegments: WallSegment[]): Promise<number> {
    const map = await updateMapAtRevision(this.client, mapId, expectedRevision, {
      wallSegments: wallSegments as unknown as Prisma.InputJsonValue,
    });
    return map.revision;
  }

  async updateFog(mapId: string, expectedRevision: number, fog: FogState): Promise<number> {
    const map = await updateMapAtRevision(this.client, mapId, expectedRevision, {
      fogData: fog as unknown as Prisma.InputJsonValue,
    });
    return map.revision;
  }

  async updateLights(mapId: string, expectedRevision: number, lights: LightSource[]): Promise<number> {
    const map = await updateMapAtRevision(this.client, mapId, expectedRevision, {
      lights: lights as unknown as Prisma.InputJsonValue,
    });
    return map.revision;
  }

  async updateLightingEnabled(mapId: string, expectedRevision: number, enabled: boolean): Promise<number> {
    const map = await updateMapAtRevision(this.client, mapId, expectedRevision, {
      lightingEnabled: enabled,
    });
    return map.revision;
  }
}
