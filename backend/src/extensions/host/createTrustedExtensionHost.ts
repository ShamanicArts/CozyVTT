import type { PrismaClient } from "@prisma/client";
import { ExtensionRegistry } from "../registry";
import { ExtensionHostError } from "./contracts";
import { ExtensionHostService } from "./ExtensionHostService";
import { ReviewedExtensionTrustPolicy } from "./ExtensionTrustPolicy";
import {
  EnvironmentExtensionTrustAllowlist,
  HmacExtensionSignatureVerifier,
} from "./adapters/ConfiguredExtensionTrust";
import { LocalExtensionPackageCatalog } from "./adapters/LocalExtensionPackageCatalog";
import { PrismaExtensionInstallationRepository } from "./adapters/PrismaExtensionInstallationRepository";
import {
  NodeBubblewrapSandbox,
  SandboxedExtensionSupervisor,
} from "../sandbox";

/**
 * Composition helper for a process-local trusted host. It intentionally does
 * not mount a transport: callers choose their own administrator boundary.
 */
export function createTrustedExtensionHost(
  prisma: PrismaClient,
  registry = new ExtensionRegistry(),
  packageRoot = process.env.EXTENSION_PACKAGE_ROOT,
): ExtensionHostService {
  if (!packageRoot) {
    throw new ExtensionHostError(
      "EXTENSION_PACKAGE_ROOT must be configured before enabling extension packages",
      "INVALID_PACKAGE",
    );
  }
  const catalog = new LocalExtensionPackageCatalog(packageRoot);
  const trust = new ReviewedExtensionTrustPolicy(
    new EnvironmentExtensionTrustAllowlist(),
    new HmacExtensionSignatureVerifier(),
  );
  return new ExtensionHostService(
    catalog,
    trust,
    new PrismaExtensionInstallationRepository(prisma),
    registry,
    undefined,
    new SandboxedExtensionSupervisor(new NodeBubblewrapSandbox(catalog)),
  );
}
