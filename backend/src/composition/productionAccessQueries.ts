import { PrismaAccessQueryRepository } from "../adapters/persistence/PrismaAccessQueryRepository";
import { AccessQueries } from "../application/identity/AccessQueries";
import { prisma } from "../config/database";

export const productionAccessQueries = new AccessQueries(
  new PrismaAccessQueryRepository(prisma),
);
