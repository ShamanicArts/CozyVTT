import type {
  CampaignPresentationRole,
  ExtensionHostPort,
} from "../../ports/ExtensionHostPort";

export class ExtensionOperationError extends Error {
  constructor(
    readonly status: 403 | 404 | 409 | 503,
    readonly error: string,
    message: string,
  ) {
    super(message);
    this.name = "ExtensionOperationError";
  }
}

export class ExtensionOperations {
  constructor(private readonly host: () => ExtensionHostPort) {}

  available() {
    return this.execute((host) => host.listAvailable());
  }
  list() {
    return this.execute((host) => host.list());
  }
  install(packageId: string, mode: "trusted" | "sandboxed") {
    return this.execute((host) => host.install(packageId, mode));
  }
  activate(extensionId: string) {
    return this.execute((host) => host.activate(extensionId));
  }
  deactivate(extensionId: string) {
    return this.execute((host) => host.deactivate(extensionId));
  }
  uninstall(extensionId: string) {
    return this.execute((host) => host.uninstall(extensionId));
  }
  contributions() {
    return this.execute(async (host) => {
      const renderers = await host.listActiveRendererContributions();
      const gameSystems = await host.listActiveGameSystemContributions();
      return {
        themes: await host.listActiveThemeContributions(),
        renderers: renderers.map(({ extensionId, renderer }) => ({
          extensionId,
          renderer: {
            id: renderer.id,
            name: renderer.name,
            contractVersion: renderer.contractVersion,
            moduleUrl: `/api/extensions/contributions/renderers/${encodeURIComponent(extensionId)}/${encodeURIComponent(renderer.id)}`,
          },
        })),
        gameSystems: gameSystems.map(({ extensionId, gameSystem }) => ({
          extensionId,
          gameSystem: {
            ...gameSystem,
            moduleUrl: `/api/extensions/contributions/game-systems/${encodeURIComponent(extensionId)}/${encodeURIComponent(gameSystem.id)}`,
          },
        })),
      };
    });
  }
  renderer(extensionId: string, rendererId: string) {
    return this.execute((host) =>
      host.readActiveRendererModule(extensionId, rendererId),
    );
  }
  gameSystem(extensionId: string, gameSystemId: string) {
    return this.execute((host) =>
      host.readActiveGameSystemModule(extensionId, gameSystemId),
    );
  }
  campaignContributions(campaignId: string, role: CampaignPresentationRole) {
    return this.execute(async (host) => ({
      presentations: (
        await host.listActivePresentationContributions(role)
      ).map(({ extensionId, presentation }) => ({
        extensionId,
        presentation: {
          ...presentation,
          moduleUrl: `/api/extensions/campaigns/${encodeURIComponent(campaignId)}/contributions/presentations/${encodeURIComponent(extensionId)}/${encodeURIComponent(presentation.id)}`,
        },
      })),
    }));
  }
  presentation(
    extensionId: string,
    presentationId: string,
    role: CampaignPresentationRole,
  ) {
    return this.execute((host) =>
      host.readActivePresentationModule(extensionId, presentationId, role),
    );
  }

  private async execute<T>(operation: (host: ExtensionHostPort) => Promise<T>) {
    let host: ExtensionHostPort;
    try {
      host = this.host();
    } catch {
      throw new ExtensionOperationError(
        503,
        "Extension Host Unavailable",
        "Trusted extension packages are not configured on this server",
      );
    }
    try {
      return await operation(host);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      if (code === "UNKNOWN_INSTALLATION")
        throw new ExtensionOperationError(
          404,
          "Extension Host Error",
          "Extension installation not found",
        );
      if (code === "UNTRUSTED_PACKAGE" || code === "CHECKSUM_MISMATCH")
        throw new ExtensionOperationError(
          403,
          "Extension Host Error",
          "The package is not approved for in-process execution",
        );
      throw new ExtensionOperationError(
        409,
        "Extension Host Error",
        "The extension operation could not be completed",
      );
    }
  }
}
