import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  TokenTemplateQuery,
  TokenTemplateQueryRepository,
} from "../../ports/TokenTemplateQueryRepository";

export class PrismaTokenTemplateQueryRepository
  implements TokenTemplateQueryRepository
{
  constructor(private readonly client: PrismaClient) {}

  async list(input: TokenTemplateQuery) {
    const where: Prisma.TokenTemplateWhereInput = {
      campaignId: input.campaignId,
      ...(input.search
        ? { name: { contains: input.search, mode: "insensitive" } }
        : {}),
      ...(input.type ? { type: input.type } : {}),
    };
    const [templates, total] = await Promise.all([
      this.client.tokenTemplate.findMany({
        where,
        orderBy: { name: "asc" },
        take: input.limit,
        skip: input.offset,
      }),
      this.client.tokenTemplate.count({ where }),
    ]);
    return { templates, total };
  }

  async find(id: string) {
    return this.client.tokenTemplate.findUnique({ where: { id } });
  }
}
