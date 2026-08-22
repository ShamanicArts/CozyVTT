import {
  COZYVTT_PLATFORM_VERSION,
  EXTENSION_API_VERSION,
  type PublishedCapabilityDescriptor,
  type ApplicationCommandDescriptor,
  type ExtensionHostVersion,
  type ExtensionLifecycleContext,
  type ExtensionManifest,
  type ExtensionModule,
  type RegisteredExtension,
} from './contracts';
import { validateExtensionCompatibility } from './compatibility';
import { parseExtensionManifest } from './schemas';

export class ExtensionRegistryError extends Error {
  public constructor(message: string, public readonly code: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ExtensionRegistryError';
  }
}

interface ExtensionRecord {
  module: ExtensionModule;
  state: RegisteredExtension['state'];
}

interface RegisteredPublishedCapability {
  extensionId: string;
  descriptor: PublishedCapabilityDescriptor;
}

/**
 * In-memory microkernel registry for trusted modules. It validates the complete
 * manifest before running lifecycle code, treats each lifecycle transition as a
 * critical section, and only exposes descriptors after activation succeeds.
 */
export class ExtensionRegistry {
  private readonly extensions = new Map<string, ExtensionRecord>();
  private readonly commands = new Map<string, ApplicationCommandDescriptor>();
  private readonly publishedCapabilities = new Map<string, RegisteredPublishedCapability>();
  private readonly transitions = new Set<string>();

  public constructor(
    private readonly host: ExtensionHostVersion = {
      extensionApiVersion: EXTENSION_API_VERSION,
      platformVersion: COZYVTT_PLATFORM_VERSION,
    }
  ) {}

  public async install(module: ExtensionModule): Promise<RegisteredExtension> {
    const manifest = parseExtensionManifest(module.manifest);
    const compatibility = validateExtensionCompatibility(manifest, this.host);
    if (!compatibility.compatible) {
      throw new ExtensionRegistryError(
        `Extension ${manifest.id} is incompatible: ${compatibility.reasons.join('; ')}`,
        'INCOMPATIBLE_EXTENSION'
      );
    }
    if (this.extensions.has(manifest.id)) {
      throw new ExtensionRegistryError(`Extension ${manifest.id} is already installed`, 'DUPLICATE_EXTENSION');
    }
    this.assertDescriptorIdsAvailable(manifest);

    const context = createLifecycleContext(manifest, this.host);
    try {
      await module.onInstall?.(context);
    } catch (error) {
      throw new ExtensionRegistryError(`Extension ${manifest.id} failed to install`, 'INSTALL_FAILED', error);
    }

    const record: ExtensionRecord = { module: { ...module, manifest }, state: 'installed' };
    this.extensions.set(manifest.id, record);
    return toRegisteredExtension(record);
  }

  public async activate(extensionId: string): Promise<RegisteredExtension> {
    const record = this.requireExtension(extensionId);
    if (record.state === 'active') {
      throw new ExtensionRegistryError(`Extension ${extensionId} is already active`, 'ALREADY_ACTIVE');
    }
    this.beginTransition(extensionId);
    try {
      const context = createLifecycleContext(record.module.manifest, this.host);
      try {
        await record.module.onActivate?.(context);
      } catch (error) {
        throw new ExtensionRegistryError(`Extension ${extensionId} failed to activate`, 'ACTIVATION_FAILED', error);
      }

      for (const command of record.module.manifest.commands) {
        this.commands.set(command.id, command);
      }
      for (const capability of record.module.manifest.publishedCapabilities) {
        this.publishedCapabilities.set(capability.id, { extensionId: record.module.manifest.id, descriptor: capability });
      }
      record.state = 'active';
      return toRegisteredExtension(record);
    } finally {
      this.endTransition(extensionId);
    }
  }

  public async deactivate(extensionId: string): Promise<RegisteredExtension> {
    const record = this.requireExtension(extensionId);
    if (record.state !== 'active') {
      throw new ExtensionRegistryError(`Extension ${extensionId} is not active`, 'NOT_ACTIVE');
    }
    this.beginTransition(extensionId);
    try {
      const context = createLifecycleContext(record.module.manifest, this.host);
      try {
        await record.module.onDeactivate?.(context);
      } catch (error) {
        throw new ExtensionRegistryError(`Extension ${extensionId} failed to deactivate`, 'DEACTIVATION_FAILED', error);
      }

      for (const command of record.module.manifest.commands) {
        this.commands.delete(command.id);
      }
      for (const capability of record.module.manifest.publishedCapabilities) {
        this.publishedCapabilities.delete(capability.id);
      }
      record.state = 'installed';
      return toRegisteredExtension(record);
    } finally {
      this.endTransition(extensionId);
    }
  }

  public async uninstall(extensionId: string): Promise<void> {
    const record = this.requireExtension(extensionId);
    if (record.state === 'active') {
      throw new ExtensionRegistryError(
        `Extension ${extensionId} must be deactivated before uninstalling`,
        'ACTIVE_EXTENSION'
      );
    }
    this.beginTransition(extensionId);
    try {
      const context = createLifecycleContext(record.module.manifest, this.host);
      try {
        await record.module.onUninstall?.(context);
      } catch (error) {
        throw new ExtensionRegistryError(`Extension ${extensionId} failed to uninstall`, 'UNINSTALL_FAILED', error);
      }
      this.extensions.delete(extensionId);
    } finally {
      this.endTransition(extensionId);
    }
  }

  public getExtension(extensionId: string): RegisteredExtension | undefined {
    const record = this.extensions.get(extensionId);
    return record ? toRegisteredExtension(record) : undefined;
  }

  public listExtensions(): RegisteredExtension[] {
    return [...this.extensions.values()].map(toRegisteredExtension);
  }

  public getCommand(commandId: string): ApplicationCommandDescriptor | undefined {
    return this.commands.get(commandId);
  }

  /** Capability adapters should enumerate this catalog, then dispatch capability.commandId through the command bus. */
  public listPublishedCapabilities(): Array<PublishedCapabilityDescriptor & { extensionId: string }> {
    return [...this.publishedCapabilities.values()].map(({ extensionId, descriptor }) => ({
      ...descriptor,
      extensionId,
    }));
  }

  private assertDescriptorIdsAvailable(manifest: ExtensionManifest): void {
    const knownCommandIds = new Set<string>();
    const knownCapabilityIds = new Set<string>();
    for (const record of this.extensions.values()) {
      for (const command of record.module.manifest.commands) knownCommandIds.add(command.id);
      for (const capability of record.module.manifest.publishedCapabilities) {
        knownCapabilityIds.add(capability.id);
      }
    }
    for (const command of manifest.commands) {
      if (knownCommandIds.has(command.id)) {
        throw new ExtensionRegistryError(`Command ${command.id} is already declared`, 'DUPLICATE_COMMAND');
      }
    }
    for (const capability of manifest.publishedCapabilities) {
      if (knownCapabilityIds.has(capability.id)) {
        throw new ExtensionRegistryError(`Published capability ${capability.id} is already declared`, 'DUPLICATE_PUBLIC_TOOL');
      }
    }
  }

  private requireExtension(extensionId: string): ExtensionRecord {
    const record = this.extensions.get(extensionId);
    if (!record) {
      throw new ExtensionRegistryError(`Extension ${extensionId} is not installed`, 'UNKNOWN_EXTENSION');
    }
    return record;
  }

  private beginTransition(extensionId: string): void {
    if (this.transitions.has(extensionId)) {
      throw new ExtensionRegistryError(`Extension ${extensionId} is already changing lifecycle state`, 'BUSY');
    }
    this.transitions.add(extensionId);
  }

  private endTransition(extensionId: string): void {
    this.transitions.delete(extensionId);
  }
}

function createLifecycleContext(
  manifest: ExtensionManifest,
  host: ExtensionHostVersion
): ExtensionLifecycleContext {
  return {
    extensionId: manifest.id,
    extensionVersion: manifest.version,
    extensionApiVersion: host.extensionApiVersion,
  };
}

function toRegisteredExtension(record: ExtensionRecord): RegisteredExtension {
  return { manifest: record.module.manifest, state: record.state };
}
