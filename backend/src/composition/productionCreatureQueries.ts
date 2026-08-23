import { PrismaCreatureQueryRepository } from "../adapters/persistence/PrismaCreatureQueryRepository";
import { CreatureQueries } from "../application/creatures/CreatureQueries";
import { prisma } from "../config/database";

export const productionCreatureQueries = new CreatureQueries(
  new PrismaCreatureQueryRepository(prisma),
);
