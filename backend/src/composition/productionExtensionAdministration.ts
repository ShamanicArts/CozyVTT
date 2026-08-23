import { PrismaExtensionAdministrationRepository } from "../adapters/persistence/PrismaExtensionAdministrationRepository";
import { ExtensionAdministrationService } from "../application/extensions/ExtensionAdministration";
import { prisma } from "../config/database";

export const productionExtensionAdministration =
  new ExtensionAdministrationService(
    new PrismaExtensionAdministrationRepository(prisma),
  );
