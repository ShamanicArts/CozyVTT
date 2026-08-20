import { Prisma, PrismaClient } from '@prisma/client';
import { InitiativeMap, InitiativeToken } from '../../domain/initiative/Initiative';
import { InitiativeRepository } from '../../ports/InitiativeRepository';

/** Prisma implementation for the map JSON token array used by initiative. */
export class PrismaInitiativeRepository implements InitiativeRepository {
  constructor(private readonly client: PrismaClient) {}

  async findMap(mapId: string): Promise<InitiativeMap | null> {
    const map = await this.client.map.findUnique({
      where: { id: mapId },
      select: { id: true, campaignId: true, tokens: true },
    });
    if (!map) return null;
    return {
      ...map,
      tokens: (Array.isArray(map.tokens) ? map.tokens : []) as unknown as InitiativeToken[],
    };
  }

  async updateTokens(mapId: string, tokens: InitiativeToken[]): Promise<void> {
    await this.client.map.update({
      where: { id: mapId },
      data: { tokens: tokens as unknown as Prisma.InputJsonValue },
    });
  }

  async findUserDisplayName(userId: string): Promise<string | null> {
    const user = await this.client.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    return user?.displayName ?? null;
  }
}
