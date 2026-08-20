import { Prisma, PrismaClient } from '@prisma/client';
import { MapToken, MapTokenMap } from '../../domain/mapTokens/MapToken';
import { MapTokenRepository } from '../../ports/MapTokenRepository';
import { updateMapAtRevision } from './PrismaMapRevision';

/** Prisma adapter for the JSON token array exposed by the map-token REST API. */
export class PrismaMapTokenRepository implements MapTokenRepository {
  constructor(private readonly client: PrismaClient) {}

  async findMap(mapId: string): Promise<MapTokenMap | null> {
    const map = await this.client.map.findUnique({
      where: { id: mapId },
      select: { id: true, revision: true, campaignId: true, width: true, height: true, tokens: true },
    });
    if (!map) return null;
    return { ...map, tokens: (Array.isArray(map.tokens) ? map.tokens : []) as unknown as MapToken[] };
  }

  async findMembershipRole(userId: string, campaignId: string): Promise<string | null> {
    const membership = await this.client.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  }

  async updateTokens(mapId: string, expectedRevision: number, tokens: MapToken[]): Promise<unknown> {
    return updateMapAtRevision(this.client, mapId, expectedRevision, {
      tokens: tokens as unknown as Prisma.InputJsonValue,
    });
  }
}
