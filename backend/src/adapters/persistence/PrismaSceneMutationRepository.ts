import { Prisma, PrismaClient } from '@prisma/client';
import { FogState, LightSource, SceneMap, WallSegment } from '../../domain/scene/Scene';
import { SceneMutationRepository } from '../../ports/SceneMutationRepository';

/** Prisma adapter for the scene JSON fields embedded in a map record. */
export class PrismaSceneMutationRepository implements SceneMutationRepository {
  constructor(private readonly client: PrismaClient) {}

  async findMap(mapId: string): Promise<SceneMap | null> {
    const map = await this.client.map.findUnique({
      where: { id: mapId },
      select: {
        id: true,
        campaignId: true,
        width: true,
        height: true,
        gridSize: true,
        wallSegments: true,
        fogData: true,
        lights: true,
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

  async updateWallSegments(mapId: string, wallSegments: WallSegment[]): Promise<void> {
    await this.client.map.update({
      where: { id: mapId },
      data: { wallSegments: wallSegments as unknown as Prisma.InputJsonValue },
    });
  }

  async updateFog(mapId: string, fog: FogState): Promise<void> {
    await this.client.map.update({
      where: { id: mapId },
      data: { fogData: fog as unknown as Prisma.InputJsonValue },
    });
  }

  async updateLights(mapId: string, lights: LightSource[]): Promise<void> {
    await this.client.map.update({
      where: { id: mapId },
      data: { lights: lights as unknown as Prisma.InputJsonValue },
    });
  }
}
