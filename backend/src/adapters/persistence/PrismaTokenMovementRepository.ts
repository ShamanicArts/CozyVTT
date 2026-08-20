import { Prisma, PrismaClient } from '@prisma/client';
import { MapToken, TokenMovementMap } from '../../domain/tokens/TokenMovement';
import { TokenMovementRepository } from '../../ports/TokenMovementRepository';

/** Prisma adapter for the JSON token array stored on a map. */
export class PrismaTokenMovementRepository implements TokenMovementRepository {
  constructor(private readonly client: PrismaClient) {}

  async findMap(mapId: string): Promise<TokenMovementMap | null> {
    const map = await this.client.map.findUnique({
      where: { id: mapId },
      select: {
        id: true,
        campaignId: true,
        width: true,
        height: true,
        gridSize: true,
        tokens: true,
        lightingEnabled: true,
        wallSegments: true,
        lights: true,
      },
    });

    if (!map) return null;

    return {
      ...map,
      tokens: (Array.isArray(map.tokens) ? map.tokens : []) as unknown as MapToken[],
    };
  }

  async updateTokens(mapId: string, tokens: MapToken[]): Promise<void> {
    await this.client.map.update({
      where: { id: mapId },
      data: { tokens: tokens as unknown as Prisma.InputJsonValue },
    });
  }
}
