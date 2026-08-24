import type { ExtensionManifest, ExtensionModule } from "../contracts";

export type ExtensionInstallationState = "installed" | "active" | "error";
export type ExtensionInstallMode = "trusted" | "sandboxed";

export interface ExtensionPackageManifest {
  readonly packageFormat: "cozyvtt-extension-package/1";
  readonly manifest: ExtensionManifest;
  /** Relative JavaScript entry point inside this package directory. */
  readonly entrypoint: string;
  /** SHA-256 digest of every regular package file except this manifest. */
  readonly checksum: string;
  readonly signature?: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly contributions: {
    readonly themes: readonly ThemeContribution[];
    readonly renderers: readonly RendererContribution[];
    readonly presentations: readonly CampaignPresentationContribution[];
  };
}

/** Data-only frontend contribution; executable renderer bundles remain local trusted registrations. */
export interface ThemeContribution {
  readonly id: string;
  readonly name: string;
  readonly contractVersion: "1.0";
  readonly tokens: Readonly<Record<string, string>>;
  readonly treatments?: {
    readonly pageBackground?: {
      readonly kind: "linear-gradient";
      readonly angle: number;
      readonly stops: readonly {
        readonly token: string;
        readonly position: number;
      }[];
    };
  };
}

/** Executable browser contribution available only from active trusted packages. */
export interface RendererContribution {
  readonly id: string;
  readonly name: string;
  readonly contractVersion: "1.0.0";
  /** Self-contained JavaScript module exporting `activateMapRenderer`. */
  readonly browserEntrypoint: string;
}

export type CampaignPresentationRole = "DM" | "PLAYER" | "SPECTATOR";

/** Executable campaign-stage contribution available only from active trusted packages. */
export interface CampaignPresentationContribution {
  readonly id: string;
  readonly title: string;
  readonly contractVersion: "1";
  /** Self-contained JavaScript module exporting `activateCampaignPresentation`. */
  readonly browserEntrypoint: string;
  readonly roles: readonly CampaignPresentationRole[];
}

export interface ExtensionBrowserModule {
  readonly contents: Buffer;
  readonly checksum: string;
}

export interface DiscoveredExtensionPackage {
  readonly packagePath: string;
  readonly manifestPath: string;
  readonly entrypointPath: string;
  readonly packageManifest: ExtensionPackageManifest;
  readonly computedChecksum: string;
}

export interface ReviewedExtensionPackage extends DiscoveredExtensionPackage {
  readonly module: ExtensionModule;
}

export interface ExtensionInstallation {
  readonly extensionId: string;
  readonly version: string;
  readonly packagePath: string;
  readonly packageChecksum: string;
  readonly installMode: ExtensionInstallMode;
  readonly packageManifest: ExtensionPackageManifest;
  readonly state: ExtensionInstallationState;
  readonly lastError: string | null;
  readonly installedAt: Date;
  readonly activatedAt: Date | null;
  readonly updatedAt: Date;
}

export class ExtensionHostError extends Error {
  public constructor(
    message: string,
    public readonly code:
      | "INVALID_PACKAGE"
      | "PACKAGE_OUTSIDE_ROOT"
      | "CHECKSUM_MISMATCH"
      | "UNTRUSTED_PACKAGE"
      | "DEPENDENCY_UNSATISFIED"
      | "DEPENDENCY_CYCLE"
      | "INSTALLATION_CONFLICT"
      | "UNKNOWN_INSTALLATION"
      | "ACTIVE_DEPENDENT"
      | "LIFECYCLE_FAILED",
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ExtensionHostError";
  }
}
