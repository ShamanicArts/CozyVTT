import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CreatureListQuery,
  CreatureQueryRepository,
} from "../../ports/CreatureQueryRepository";
import { getSrdSeedStatus } from "../../services/creatureSeed";

export class PrismaCreatureQueryRepository implements CreatureQueryRepository {
  constructor(private readonly client: PrismaClient) {}

  seedStatus() {
    return getSrdSeedStatus(this.client);
  }

  async list(input: CreatureListQuery) {
    const where: Prisma.CreatureTemplateWhereInput = {
      OR: [{ campaignId: null }, { campaignId: input.campaignId }],
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" } }
        : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.challengeRating
        ? { challengeRating: input.challengeRating }
        : {}),
      ...(input.gameSystem ? { gameSystem: input.gameSystem as never } : {}),
    };
    const [creatures, total] = await Promise.all([
      this.client.creatureTemplate.findMany({
        where,
        orderBy: { name: "asc" },
        take: input.limit,
        skip: input.offset,
      }),
      this.client.creatureTemplate.count({ where }),
    ]);
    return { creatures, total };
  }

  async find(id: string) {
    return this.client.creatureTemplate.findUnique({ where: { id } });
  }

  async favorites(campaignId: string, userId: string) {
    return this.client.creatureFavorite.findMany({
      where: { campaignId, userId },
      include: { creature: true },
      orderBy: { creature: { name: "asc" } },
    });
  }
}
