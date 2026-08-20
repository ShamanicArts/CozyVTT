import type {
  DiscoveredExtensionPackage,
  ExtensionInstallation,
  ExtensionInstallationState,
  ReviewedExtensionPackage,
} from "./contracts";

export interface ExtensionPackageCatalog {
  listAvailable(): Promise<DiscoveredExtensionPackage[]>;
  discover(packageReference: string): Promise<DiscoveredExtensionPackage>;
  discoverInstalled(packagePath: string): Promise<DiscoveredExtensionPackage>;
  load(
    discovered: DiscoveredExtensionPackage,
  ): Promise<ReviewedExtensionPackage>;
}

export interface ExtensionTrustAllowlist {
  allows(
    extensionId: string,
    version: string,
    checksum: string,
  ): Promise<boolean>;
}

export interface ExtensionSignatureVerifier {
  verify(input: {
    extensionId: string;
    version: string;
    checksum: string;
    signature: string;
  }): Promise<boolean>;
}

export interface ExtensionTrustPolicy {
  assertTrusted(discovered: DiscoveredExtensionPackage): Promise<void>;
}

export interface ExtensionInstallationRepository {
  find(extensionId: string): Promise<ExtensionInstallation | null>;
  list(): Promise<ExtensionInstallation[]>;
  save(input: {
    extensionId: string;
    version: string;
    packagePath: string;
    packageChecksum: string;
    installMode: import("./contracts").ExtensionInstallMode;
    packageManifest: ExtensionInstallation["packageManifest"];
    state: ExtensionInstallationState;
    lastError: string | null;
    activatedAt: Date | null;
  }): Promise<ExtensionInstallation>;
  remove(extensionId: string): Promise<void>;
}

export interface ExtensionLifecycleRegistry {
  install(module: ReviewedExtensionPackage["module"]): Promise<unknown>;
  activate(extensionId: string): Promise<unknown>;
  deactivate(extensionId: string): Promise<unknown>;
  uninstall(extensionId: string): Promise<void>;
  getExtension(extensionId: string): unknown | undefined;
}

export interface SandboxedExtensionLifecycle {
  activate(
    installation: import("./contracts").ExtensionInstallation,
  ): Promise<void>;
  deactivate(
    installation: import("./contracts").ExtensionInstallation,
  ): Promise<void>;
}
