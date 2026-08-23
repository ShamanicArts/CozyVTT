import { PrismaTokenTemplateQueryRepository } from "../adapters/persistence/PrismaTokenTemplateQueryRepository";
import { TokenTemplateQueries } from "../application/tokenTemplates/TokenTemplateQueries";
import { prisma } from "../config/database";

export const productionTokenTemplateQueries = new TokenTemplateQueries(
  new PrismaTokenTemplateQueryRepository(prisma),
);
