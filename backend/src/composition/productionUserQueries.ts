import { PrismaUserQueryRepository } from "../adapters/persistence/PrismaUserQueryRepository";
import { UserQueries } from "../application/users/UserQueries";
import { prisma } from "../config/database";

export const productionUserQueries = new UserQueries(
  new PrismaUserQueryRepository(prisma),
);
