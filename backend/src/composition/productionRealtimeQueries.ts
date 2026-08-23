import { PrismaRealtimeReadRepository } from "../adapters/persistence/PrismaRealtimeReadRepository";
import { RealtimeQueries } from "../application/queries/RealtimeQueries";
import { prisma } from "../config/database";

export const productionRealtimeQueries = new RealtimeQueries(
  new PrismaRealtimeReadRepository(prisma),
);
