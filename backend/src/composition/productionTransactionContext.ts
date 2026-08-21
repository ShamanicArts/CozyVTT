import { prisma } from "../config/database";
import { PrismaTransactionContext } from "../adapters/persistence/PrismaTransactionContext";

/** Shared ambient transaction boundary for production persistence adapters. */
export const productionTransactionContext = new PrismaTransactionContext(prisma);
export const productionPrisma = productionTransactionContext.client;
