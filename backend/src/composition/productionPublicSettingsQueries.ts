import { PrismaSystemSettingsRepository } from "../adapters/persistence/PrismaSystemSettingsRepository";
import { PublicSettingsQueries } from "../application/identity/PublicSettingsQueries";
import { prisma } from "../config/database";

export const productionSystemSettings = new PrismaSystemSettingsRepository(prisma);
export const productionPublicSettingsQueries = new PublicSettingsQueries(
  productionSystemSettings,
);
