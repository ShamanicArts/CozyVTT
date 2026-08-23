import { PrismaPluginAccessRepository } from "../adapters/persistence/PrismaPluginAccessRepository";
import { PluginCredentialService } from "../application/capabilities/PluginCredentialService";
import { sha256Digest } from "../application/capabilities/PluginCredentialAuthenticator";
import { prisma } from "../config/database";

export const productionPluginAccess = new PrismaPluginAccessRepository(prisma);
export const productionPluginCredentials = new PluginCredentialService(
  productionPluginAccess,
  sha256Digest,
);
