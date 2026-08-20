import type { ExtensionManifest, ExtensionModule } from "../../contracts";
import { ExtensionHostService } from "../ExtensionHostService";
import { ReviewedExtensionTrustPolicy } from "../ExtensionTrustPolicy";
import type {
  DiscoveredExtensionPackage,
  ExtensionInstallation,
  ExtensionPackageManifest,
  ReviewedExtensionPackage,
} from "../contracts";
import type {
  ExtensionInstallationRepository,
  ExtensionLifecycleRegistry,
  ExtensionPackageCatalog,
  ExtensionSignatureVerifier,
  ExtensionTrustAllowlist,
} from "../ports";

const checksum = `sha256:${"a".repeat(64)}`;

function manifest(id: string, version = "1.0.0"): ExtensionManifest {
  return {
    manifestVersion: "1.0",
    id,
    name: id,
    version,
    description: "Trusted test extension",
    compatibility: { extensionApi: "^1.0.0", cozyVtt: "^1.1.0" },
    capabilities: [],
    permissions: [],
    commands: [],
    agentTools: [],
  };
}

function packageFor(
  id: string,
  dependencies: Record<string, string> = {},
): DiscoveredExtensionPackage {
  const extensionManifest = manifest(id);
  const packageManifest: ExtensionPackageManifest = {
    packageFormat: "cozyvtt-extension-package/1",
    manifest: extensionManifest,
    entrypoint: "index.js",
    checksum,
    signature: "hmac-sha256:test",
    dependencies,
    contributions: { themes: [] },
  };
  return {
    packagePath: `/reviewed/${id}`,
    manifestPath: `/reviewed/${id}/cozyvtt.extension.json`,
    entrypointPath: `/reviewed/${id}/index.js`,
    packageManifest,
    computedChecksum: checksum,
  };
}

class MemoryRepository implements ExtensionInstallationRepository {
  public readonly records = new Map<string, ExtensionInstallation>();

  async find(extensionId: string): Promise<ExtensionInstallation | null> {
    return this.records.get(extensionId) ?? null;
  }

  async list(): Promise<ExtensionInstallation[]> {
    return [...this.records.values()];
  }

  async save(
    input: Omit<ExtensionInstallation, "installedAt" | "updatedAt">,
  ): Promise<ExtensionInstallation> {
    const previous = this.records.get(input.extensionId);
    const record: ExtensionInstallation = {
      ...input,
      installedAt:
        previous?.installedAt ?? new Date("2026-08-20T00:00:00.000Z"),
      updatedAt: new Date("2026-08-20T00:00:00.000Z"),
    };
    this.records.set(input.extensionId, record);
    return record;
  }

  async remove(extensionId: string): Promise<void> {
    this.records.delete(extensionId);
  }
}

class FakeCatalog implements ExtensionPackageCatalog {
  public loadCalls: string[] = [];

  public constructor(
    private readonly packages: Map<string, DiscoveredExtensionPackage>,
  ) {}

  async listAvailable(): Promise<DiscoveredExtensionPackage[]> {
    return [...this.packages.values()];
  }

  async discover(
    packageReference: string,
  ): Promise<DiscoveredExtensionPackage> {
    const result = this.packages.get(packageReference);
    if (!result) throw new Error(`No package ${packageReference}`);
    return result;
  }

  async discoverInstalled(
    packagePath: string,
  ): Promise<DiscoveredExtensionPackage> {
    const result = [...this.packages.values()].find(
      (candidate) => candidate.packagePath === packagePath,
    );
    if (!result) throw new Error(`No installed package at ${packagePath}`);
    return result;
  }

  async load(
    discovered: DiscoveredExtensionPackage,
  ): Promise<ReviewedExtensionPackage> {
    this.loadCalls.push(discovered.packageManifest.manifest.id);
    const module: ExtensionModule = {
      manifest: discovered.packageManifest.manifest,
    };
    return { ...discovered, module };
  }
}

class FakeRegistry implements ExtensionLifecycleRegistry {
  public readonly calls: string[] = [];
  private readonly installed = new Set<string>();

  async install(module: ExtensionModule): Promise<void> {
    this.calls.push(`install:${module.manifest.id}`);
    this.installed.add(module.manifest.id);
  }

  async activate(extensionId: string): Promise<void> {
    this.calls.push(`activate:${extensionId}`);
  }

  async deactivate(extensionId: string): Promise<void> {
    this.calls.push(`deactivate:${extensionId}`);
  }

  async uninstall(extensionId: string): Promise<void> {
    this.calls.push(`uninstall:${extensionId}`);
    this.installed.delete(extensionId);
  }

  getExtension(extensionId: string): unknown | undefined {
    return this.installed.has(extensionId) ? { extensionId } : undefined;
  }
}

function trustedService(packages: Map<string, DiscoveredExtensionPackage>): {
  service: ExtensionHostService;
  catalog: FakeCatalog;
  repository: MemoryRepository;
  registry: FakeRegistry;
} {
  const allowlist: ExtensionTrustAllowlist = { allows: async () => true };
  const verifier: ExtensionSignatureVerifier = { verify: async () => true };
  const catalog = new FakeCatalog(packages);
  const repository = new MemoryRepository();
  const registry = new FakeRegistry();
  return {
    service: new ExtensionHostService(
      catalog,
      new ReviewedExtensionTrustPolicy(allowlist, verifier),
      repository,
      registry,
    ),
    catalog,
    repository,
    registry,
  };
}

describe("ExtensionHostService", () => {
  it("installs reviewed dependencies before their dependant and activates in dependency order", async () => {
    const dependency = packageFor("cozyvtt.dice");
    const parent = packageFor("cozyvtt.encounters", {
      "cozyvtt.dice": "^1.0.0",
    });
    const { service, repository, registry } = trustedService(
      new Map([
        ["cozyvtt.dice", dependency],
        ["encounters", parent],
      ]),
    );

    await service.install("cozyvtt.encounters");
    expect(registry.calls).toEqual([
      "install:cozyvtt.dice",
      "install:cozyvtt.encounters",
    ]);
    expect(repository.records.get("cozyvtt.encounters")?.state).toBe(
      "installed",
    );

    await service.activate("cozyvtt.encounters");
    expect(registry.calls).toEqual([
      "install:cozyvtt.dice",
      "install:cozyvtt.encounters",
      "activate:cozyvtt.dice",
      "activate:cozyvtt.encounters",
    ]);
    expect(repository.records.get("cozyvtt.dice")?.state).toBe("active");
    expect(repository.records.get("cozyvtt.encounters")?.state).toBe("active");
  });

  it("refuses an unallowlisted package before it can be dynamically loaded or persisted", async () => {
    const discovered = packageFor("cozyvtt.unreviewed");
    const catalog = new FakeCatalog(new Map([["unreviewed", discovered]]));
    const repository = new MemoryRepository();
    const registry = new FakeRegistry();
    const policy = new ReviewedExtensionTrustPolicy(
      { allows: async () => false },
      { verify: async () => true },
    );
    const service = new ExtensionHostService(
      catalog,
      policy,
      repository,
      registry,
    );

    await expect(service.install("cozyvtt.unreviewed")).rejects.toMatchObject({
      code: "UNTRUSTED_PACKAGE",
    });
    expect(catalog.loadCalls).toEqual([]);
    expect(repository.records.size).toBe(0);
    expect(registry.calls).toEqual([]);
  });

  it("blocks deactivation and uninstall while another installation depends on it", async () => {
    const dependency = packageFor("cozyvtt.dice");
    const parent = packageFor("cozyvtt.encounters", {
      "cozyvtt.dice": "^1.0.0",
    });
    const { service } = trustedService(
      new Map([
        ["cozyvtt.dice", dependency],
        ["encounters", parent],
      ]),
    );
    await service.install("cozyvtt.encounters");
    await service.activate("cozyvtt.encounters");

    await expect(service.deactivate("cozyvtt.dice")).rejects.toMatchObject({
      code: "ACTIVE_DEPENDENT",
    });
    await expect(service.uninstall("cozyvtt.dice")).rejects.toMatchObject({
      code: "ACTIVE_DEPENDENT",
    });
  });
});
