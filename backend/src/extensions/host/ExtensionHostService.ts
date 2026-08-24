import { satisfiesVersion } from "../versioning";
import type {
  ExtensionInstallation,
  DiscoveredExtensionPackage,
  ReviewedExtensionPackage,
} from "./contracts";
import { ExtensionHostError } from "./contracts";
import type {
  ExtensionInstallationRepository,
  ExtensionLifecycleRegistry,
  ExtensionPackageCatalog,
  SandboxedExtensionLifecycle,
  ExtensionTrustPolicy,
} from "./ports";

/**
 * Application boundary for trusted local packages. It deliberately has no
 * HTTP, socket, or process-global import side effects. The catalogue and trust
 * policy complete all review checks before `load` can dynamically import code.
 */
export class ExtensionHostService {
  public constructor(
    private readonly packages: ExtensionPackageCatalog,
    private readonly trust: ExtensionTrustPolicy,
    private readonly installations: ExtensionInstallationRepository,
    private readonly registry: ExtensionLifecycleRegistry,
    private readonly now: () => Date = () => new Date(),
    private readonly sandboxedLifecycle?: SandboxedExtensionLifecycle,
  ) {}

  public async install(
    packageReference: string,
    mode: ExtensionInstallation["installMode"] = "trusted",
  ): Promise<ExtensionInstallation> {
    const available = await this.packages.listAvailable();
    const discovered = available.find(
      (candidate) => candidate.packageManifest.manifest.id === packageReference,
    );
    if (!discovered) {
      throw new ExtensionHostError(
        `Extension package ${packageReference} is not available in the configured catalogue`,
        "INVALID_PACKAGE",
      );
    }
    if (mode === "sandboxed") {
      const existing = await this.installations.find(
        discovered.packageManifest.manifest.id,
      );
      if (existing) return existing;
      return this.installations.save({
        extensionId: discovered.packageManifest.manifest.id,
        version: discovered.packageManifest.manifest.version,
        packagePath: discovered.packagePath,
        packageChecksum: discovered.computedChecksum,
        packageManifest: discovered.packageManifest,
        installMode: "sandboxed",
        state: "installed",
        lastError: null,
        activatedAt: null,
      });
    }
    return this.installDiscovered(discovered, new Set());
  }

  public list(): Promise<ExtensionInstallation[]> {
    return this.installations.list();
  }

  public async listActiveThemeContributions(): Promise<
    Array<{
      extensionId: string;
      theme: import("./contracts").ThemeContribution;
    }>
  > {
    const installations = await this.installations.list();
    return installations.flatMap((installation) =>
      installation.state === "active"
        ? installation.packageManifest.contributions.themes.map((theme) => ({
            extensionId: installation.extensionId,
            theme,
          }))
        : [],
    );
  }

  public async listActiveRendererContributions(): Promise<
    Array<{
      extensionId: string;
      renderer: import("./contracts").RendererContribution;
    }>
  > {
    const installations = await this.installations.list();
    return installations.flatMap((installation) =>
      installation.state === "active" && installation.installMode === "trusted"
        ? (installation.packageManifest.contributions.renderers ?? []).map(
            (renderer) => ({ extensionId: installation.extensionId, renderer }),
          )
        : [],
    );
  }

  public async listActivePresentationContributions(
    role: import("./contracts").CampaignPresentationRole,
  ): Promise<
    Array<{
      extensionId: string;
      presentation: import("./contracts").CampaignPresentationContribution;
    }>
  > {
    const installations = await this.installations.list();
    return installations.flatMap((installation) =>
      installation.state === "active" && installation.installMode === "trusted"
        ? installation.packageManifest.contributions.presentations
            .filter((presentation) => presentation.roles.includes(role))
            .map((presentation) => ({
              extensionId: installation.extensionId,
              presentation,
            }))
        : [],
    );
  }

  public async readActiveRendererModule(
    extensionId: string,
    rendererId: string,
  ): Promise<import("./contracts").ExtensionBrowserModule> {
    const installation = await this.requireInstallation(extensionId);
    if (
      installation.state !== "active" ||
      installation.installMode !== "trusted"
    ) {
      throw new ExtensionHostError(
        "Renderer modules require an active trusted installation",
        "UNKNOWN_INSTALLATION",
      );
    }
    const renderer = installation.packageManifest.contributions.renderers.find(
      (candidate) => candidate.id === rendererId,
    );
    if (!renderer) {
      throw new ExtensionHostError(
        "Renderer contribution is not installed",
        "UNKNOWN_INSTALLATION",
      );
    }
    const discovered = await this.packages.discoverInstalled(
      installation.packagePath,
    );
    if (discovered.computedChecksum !== installation.packageChecksum) {
      throw new ExtensionHostError(
        "Extension package changed after installation",
        "CHECKSUM_MISMATCH",
      );
    }
    return {
      contents: await this.packages.readBrowserModule(
        discovered,
        renderer.browserEntrypoint,
      ),
      checksum: installation.packageChecksum,
    };
  }

  public async readActivePresentationModule(
    extensionId: string,
    presentationId: string,
    role: import("./contracts").CampaignPresentationRole,
  ): Promise<import("./contracts").ExtensionBrowserModule> {
    const installation = await this.requireInstallation(extensionId);
    if (
      installation.state !== "active" ||
      installation.installMode !== "trusted"
    ) {
      throw new ExtensionHostError(
        "Presentation modules require an active trusted installation",
        "UNKNOWN_INSTALLATION",
      );
    }
    const presentation =
      installation.packageManifest.contributions.presentations.find(
        (candidate) =>
          candidate.id === presentationId && candidate.roles.includes(role),
      );
    if (!presentation) {
      throw new ExtensionHostError(
        "Presentation contribution is not available",
        "UNKNOWN_INSTALLATION",
      );
    }
    const discovered = await this.packages.discoverInstalled(
      installation.packagePath,
    );
    if (discovered.computedChecksum !== installation.packageChecksum) {
      throw new ExtensionHostError(
        "Extension package changed after installation",
        "CHECKSUM_MISMATCH",
      );
    }
    return {
      contents: await this.packages.readBrowserModule(
        discovered,
        presentation.browserEntrypoint,
      ),
      checksum: installation.packageChecksum,
    };
  }

  public async listAvailable(): Promise<
    Array<{
      id: string;
      version: string;
      checksum: string;
      dependencies: Readonly<Record<string, string>>;
    }>
  > {
    const available = await this.packages.listAvailable();
    return available.map((candidate) => ({
      id: candidate.packageManifest.manifest.id,
      version: candidate.packageManifest.manifest.version,
      checksum: candidate.computedChecksum,
      dependencies: candidate.packageManifest.dependencies,
    }));
  }

  public async activate(extensionId: string): Promise<ExtensionInstallation> {
    const installation = await this.requireInstallation(extensionId);
    if (installation.installMode === "sandboxed") {
      if (!this.sandboxedLifecycle)
        throw new ExtensionHostError(
          "Sandbox runner is not configured",
          "LIFECYCLE_FAILED",
        );
      try {
        await this.sandboxedLifecycle.activate(installation);
        return this.persist(installation, "active", null, this.now());
      } catch (error) {
        await this.persist(installation, "error", describeError(error), null);
        throw new ExtensionHostError(
          "Sandbox activation failed",
          "LIFECYCLE_FAILED",
          error,
        );
      }
    }
    return this.activateOne(extensionId, new Set());
  }

  public async deactivate(extensionId: string): Promise<ExtensionInstallation> {
    const installation = await this.requireInstallation(extensionId);
    const activeDependent = (await this.installations.list()).find(
      (candidate) =>
        candidate.state === "active" &&
        candidate.packageManifest.dependencies[extensionId] !== undefined,
    );
    if (activeDependent) {
      throw new ExtensionHostError(
        `Cannot deactivate ${extensionId}; active dependent ${activeDependent.extensionId} requires it`,
        "ACTIVE_DEPENDENT",
      );
    }
    try {
      if (installation.installMode === "sandboxed") {
        if (!this.sandboxedLifecycle)
          throw new ExtensionHostError(
            "Sandbox runner is not configured",
            "LIFECYCLE_FAILED",
          );
        await this.sandboxedLifecycle.deactivate(installation);
        return await this.persist(installation, "installed", null, null);
      }
      if (this.registry.getExtension(extensionId))
        await this.registry.deactivate(extensionId);
      return await this.persist(installation, "installed", null, null);
    } catch (error) {
      await this.persist(
        installation,
        "error",
        describeError(error),
        installation.activatedAt,
      );
      throw new ExtensionHostError(
        `Could not deactivate ${extensionId}`,
        "LIFECYCLE_FAILED",
        error,
      );
    }
  }

  public async uninstall(extensionId: string): Promise<void> {
    const installation = await this.requireInstallation(extensionId);
    const dependent = (await this.installations.list()).find(
      (candidate) =>
        candidate.extensionId !== extensionId &&
        candidate.packageManifest.dependencies[extensionId] !== undefined,
    );
    if (dependent) {
      throw new ExtensionHostError(
        `Cannot uninstall ${extensionId}; installed dependent ${dependent.extensionId} requires it`,
        "ACTIVE_DEPENDENT",
      );
    }
    if (installation.state === "active") await this.deactivate(extensionId);
    try {
      if (this.registry.getExtension(extensionId))
        await this.registry.uninstall(extensionId);
      await this.installations.remove(extensionId);
    } catch (error) {
      await this.persist(
        installation,
        "error",
        describeError(error),
        installation.activatedAt,
      );
      throw new ExtensionHostError(
        `Could not uninstall ${extensionId}`,
        "LIFECYCLE_FAILED",
        error,
      );
    }
  }

  private async installDiscovered(
    discovered: DiscoveredExtensionPackage,
    visiting: Set<string>,
  ): Promise<ExtensionInstallation> {
    const { id, version } = discovered.packageManifest.manifest;
    if (visiting.has(id))
      throw new ExtensionHostError(
        `Dependency cycle includes ${id}`,
        "DEPENDENCY_CYCLE",
      );
    const existing = await this.installations.find(id);
    if (existing) {
      if (
        existing.version === version &&
        existing.packageChecksum === discovered.computedChecksum
      )
        return existing;
      if (existing.state === "active") {
        throw new ExtensionHostError(
          `Cannot replace active extension ${id}`,
          "INSTALLATION_CONFLICT",
        );
      }
      throw new ExtensionHostError(
        `Extension ${id} is already installed with a different package`,
        "INSTALLATION_CONFLICT",
      );
    }

    visiting.add(id);
    try {
      await this.trust.assertTrusted(discovered);
      for (const dependencyId of Object.keys(
        discovered.packageManifest.dependencies,
      ).sort()) {
        const requiredRange =
          discovered.packageManifest.dependencies[dependencyId];
        const installed = await this.installations.find(dependencyId);
        const dependency =
          installed ?? (await this.installDependency(dependencyId, visiting));
        if (!satisfiesVersion(dependency.version, requiredRange)) {
          throw new ExtensionHostError(
            `${id} requires ${dependencyId}@${requiredRange}, found ${dependency.version}`,
            "DEPENDENCY_UNSATISFIED",
          );
        }
      }
      const reviewed = await this.packages.load(discovered);
      await this.registry.install(reviewed.module);
      return await this.saveReviewed(reviewed, "installed", null, null);
    } catch (error) {
      // A reviewed descriptor is safe to record as an error. Rejected packages
      // are intentionally not persisted: their code has never been imported.
      if (!isTrustRejection(error)) {
        await this.saveDiscoveredError(discovered, describeError(error));
      }
      throw error;
    } finally {
      visiting.delete(id);
    }
  }

  private async installDependency(
    extensionId: string,
    visiting: Set<string>,
  ): Promise<ExtensionInstallation> {
    const available = await this.packages.listAvailable();
    const discovered = available.find(
      (candidate) => candidate.packageManifest.manifest.id === extensionId,
    );
    if (!discovered) {
      throw new ExtensionHostError(
        `Required extension ${extensionId} is not available in the configured catalogue`,
        "DEPENDENCY_UNSATISFIED",
      );
    }
    return this.installDiscovered(discovered, visiting);
  }

  private async activateOne(
    extensionId: string,
    visiting: Set<string>,
  ): Promise<ExtensionInstallation> {
    if (visiting.has(extensionId))
      throw new ExtensionHostError(
        `Dependency cycle includes ${extensionId}`,
        "DEPENDENCY_CYCLE",
      );
    const installation = await this.requireInstallation(extensionId);
    if (
      installation.state === "active" &&
      this.registry.getExtension(extensionId)
    )
      return installation;
    visiting.add(extensionId);
    try {
      for (const [dependencyId, requiredRange] of Object.entries(
        installation.packageManifest.dependencies,
      )) {
        const dependency = await this.requireInstallation(dependencyId);
        if (!satisfiesVersion(dependency.version, requiredRange)) {
          throw new ExtensionHostError(
            `${extensionId} requires ${dependencyId}@${requiredRange}, found ${dependency.version}`,
            "DEPENDENCY_UNSATISFIED",
          );
        }
        await this.activateOne(dependencyId, visiting);
      }
      await this.ensureRegistered(installation);
      await this.registry.activate(extensionId);
      return await this.persist(installation, "active", null, this.now());
    } catch (error) {
      await this.persist(
        installation,
        "error",
        describeError(error),
        installation.activatedAt,
      );
      throw error instanceof ExtensionHostError
        ? error
        : new ExtensionHostError(
            `Could not activate ${extensionId}`,
            "LIFECYCLE_FAILED",
            error,
          );
    } finally {
      visiting.delete(extensionId);
    }
  }

  private async ensureRegistered(
    installation: ExtensionInstallation,
  ): Promise<void> {
    if (this.registry.getExtension(installation.extensionId)) return;
    const discovered = await this.packages.discoverInstalled(
      installation.packagePath,
    );
    if (
      discovered.packageManifest.manifest.id !== installation.extensionId ||
      discovered.packageManifest.manifest.version !== installation.version ||
      discovered.computedChecksum !== installation.packageChecksum
    ) {
      throw new ExtensionHostError(
        `Installed package ${installation.extensionId} no longer matches its reviewed record`,
        "CHECKSUM_MISMATCH",
      );
    }
    await this.trust.assertTrusted(discovered);
    const reviewed = await this.packages.load(discovered);
    await this.registry.install(reviewed.module);
  }

  private async requireInstallation(
    extensionId: string,
  ): Promise<ExtensionInstallation> {
    const installation = await this.installations.find(extensionId);
    if (!installation)
      throw new ExtensionHostError(
        `Extension ${extensionId} is not installed`,
        "UNKNOWN_INSTALLATION",
      );
    return installation;
  }

  private persist(
    installation: ExtensionInstallation,
    state: ExtensionInstallation["state"],
    lastError: string | null,
    activatedAt: Date | null,
  ): Promise<ExtensionInstallation> {
    return this.installations.save({
      extensionId: installation.extensionId,
      version: installation.version,
      packagePath: installation.packagePath,
      packageChecksum: installation.packageChecksum,
      installMode: installation.installMode,
      packageManifest: installation.packageManifest,
      state,
      lastError,
      activatedAt,
    });
  }

  private saveReviewed(
    reviewed: ReviewedExtensionPackage,
    state: ExtensionInstallation["state"],
    lastError: string | null,
    activatedAt: Date | null,
  ): Promise<ExtensionInstallation> {
    return this.installations.save({
      extensionId: reviewed.packageManifest.manifest.id,
      version: reviewed.packageManifest.manifest.version,
      packagePath: reviewed.packagePath,
      packageChecksum: reviewed.computedChecksum,
      installMode: "trusted",
      packageManifest: reviewed.packageManifest,
      state,
      lastError,
      activatedAt,
    });
  }

  private saveDiscoveredError(
    discovered: DiscoveredExtensionPackage,
    error: string,
  ): Promise<ExtensionInstallation> {
    return this.installations.save({
      extensionId: discovered.packageManifest.manifest.id,
      version: discovered.packageManifest.manifest.version,
      packagePath: discovered.packagePath,
      packageChecksum: discovered.computedChecksum,
      installMode: "trusted",
      packageManifest: discovered.packageManifest,
      state: "error",
      lastError: error,
      activatedAt: null,
    });
  }
}

function describeError(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 2_000)
    : "Unknown extension host error";
}

function isTrustRejection(error: unknown): boolean {
  return (
    error instanceof ExtensionHostError &&
    (error.code === "UNTRUSTED_PACKAGE" || error.code === "CHECKSUM_MISMATCH")
  );
}
