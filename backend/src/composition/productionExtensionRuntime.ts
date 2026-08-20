import { CommandBus } from "../application/commands/CommandBus";
import { PrismaAgentAuditPort } from "../adapters/persistence/PrismaDurableFoundations";
import { PrismaAgentAccessRepository } from "../adapters/persistence/PrismaAgentAccessRepository";
import { prisma } from "../config/database";
import { ExtensionCommandBridge } from "../extensions/bridge/ExtensionCommandBridge";
import type { AgentToolAuditPort } from "../extensions/bridge/contracts";
import type { ExtensionPolicyPort } from "../application/policy/ExtensionPolicy";
import { ExtensionRegistry } from "../extensions/registry";
import { ExtensionHostService, TrustedRegistryProxy } from "../extensions/host";
import { ReviewedExtensionTrustPolicy } from "../extensions/host/ExtensionTrustPolicy";
import {
  EnvironmentExtensionTrustAllowlist,
  HmacExtensionSignatureVerifier,
} from "../extensions/host/adapters/ConfiguredExtensionTrust";
import { LocalExtensionPackageCatalog } from "../extensions/host/adapters/LocalExtensionPackageCatalog";
import { PrismaExtensionInstallationRepository } from "../extensions/host/adapters/PrismaExtensionInstallationRepository";
import { ExtensionHostError } from "../extensions/host/contracts";
import {
  NodeBubblewrapSandbox,
  SandboxRegistryProxy,
  SandboxedExtensionSupervisor,
} from "../extensions/sandbox";

class DurableBridgePolicy implements ExtensionPolicyPort {
  public constructor(private readonly access: PrismaAgentAccessRepository) {}
  async check(check: Parameters<ExtensionPolicyPort["check"]>[0]) {
    const credential = await this.access.findCredentialById(
      check.principal.id,
      new Date(),
    );
    const allowed = Boolean(
      credential &&
        (await this.access.activeCredentialDelegates({
          credentialId: credential.id,
          delegatedUserId: credential.delegatedUserId,
          campaignId: check.scope.campaignId,
          now: new Date(),
        })),
    );
    return { allowed, missing: allowed ? [] : [...check.permissions] };
  }
}
class DurableBridgeAudit implements AgentToolAuditPort {
  public constructor(private readonly audit: PrismaAgentAuditPort) {}
  async record(
    event: Parameters<AgentToolAuditPort["record"]>[0],
  ): Promise<void> {
    await this.audit.append({
      principalType: "AGENT",
      principalId: event.principalId,
      campaignId: event.campaignId,
      extensionId: event.extensionId,
      commandType: event.commandId ?? event.toolId ?? "extension.catalog",
      inputDigest: event.inputDigest ?? "sha256:catalog-no-input",
      decision:
        event.outcome === "succeeded"
          ? "EXECUTED"
          : event.outcome === "denied"
            ? "DENIED"
            : event.outcome === "failed"
              ? "FAILED"
              : "ALLOWED",
      reasonCode: event.reason,
    });
  }
}

export interface ProductionExtensionRuntime {
  registry: ExtensionRegistry;
  bridge: ExtensionCommandBridge;
  host: ExtensionHostService;
  rehydrate(): Promise<void>;
}
let runtime: ProductionExtensionRuntime | undefined;

export function productionExtensionRuntime(): ProductionExtensionRuntime {
  if (runtime) return runtime;
  const root = process.env.EXTENSION_PACKAGE_ROOT;
  if (!root)
    throw new ExtensionHostError(
      "EXTENSION_PACKAGE_ROOT must be configured before enabling extension packages",
      "INVALID_PACKAGE",
    );
  const registry = new ExtensionRegistry();
  const bus = new CommandBus();
  const bridge = new ExtensionCommandBridge(
    registry,
    bus,
    new DurableBridgePolicy(new PrismaAgentAccessRepository(prisma)),
    new DurableBridgeAudit(new PrismaAgentAuditPort(prisma)),
    [],
  );
  const catalog = new LocalExtensionPackageCatalog(root);
  const sandbox = new NodeBubblewrapSandbox(catalog);
  const proxy = new SandboxRegistryProxy(registry, bus, bridge, sandbox);
  const trustedRegistry = new TrustedRegistryProxy(registry, bus, bridge);
  const supervisor = new SandboxedExtensionSupervisor(sandbox);
  const lifecycle = {
    activate: async (installation: Parameters<typeof proxy.activate>[0]) => {
      await supervisor.activate(installation);
      await proxy.activate(installation);
    },
    deactivate: async (
      installation: Parameters<typeof proxy.deactivate> extends never
        ? never
        : import("../extensions/host/contracts").ExtensionInstallation,
    ) => {
      await proxy.deactivate(installation.extensionId);
      await supervisor.deactivate(installation);
    },
  };
  const host = new ExtensionHostService(
    catalog,
    new ReviewedExtensionTrustPolicy(
      new EnvironmentExtensionTrustAllowlist(),
      new HmacExtensionSignatureVerifier(),
    ),
    new PrismaExtensionInstallationRepository(prisma),
    trustedRegistry,
    undefined,
    lifecycle,
  );
  runtime = {
    registry,
    bridge,
    host,
    rehydrate: async () => {
      for (const installation of await host.list())
        if (installation.state === "active")
          await host.activate(installation.extensionId);
    },
  };
  return runtime;
}
