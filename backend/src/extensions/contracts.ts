/**
 * Stable, transport-independent contracts for CozyVTT extensions.
 *
 * These types deliberately describe application capabilities and commands, not
 * Express routes, Socket.IO events, database tables, or renderer internals.
 * They are the backend-local source of truth until the project grows a shared
 * package with a published build pipeline.
 */

export const EXTENSION_API_VERSION = '1.0.0';
export const COZYVTT_PLATFORM_VERSION = '1.1.1';

export const EXTENSION_CAPABILITIES = [
  'commands',
  'agent-tools',
  'scene-layers',
  'renderers',
  'themes',
  'game-systems',
  'importers',
  'exporters',
] as const;

export type ExtensionCapability = (typeof EXTENSION_CAPABILITIES)[number];

/**
 * A permission is a declared request, not an automatic grant. The policy
 * adapter which executes a command must still check the caller's grants.
 */
export const EXTENSION_PERMISSIONS = [
  'campaign.read',
  'campaign.write',
  'characters.read',
  'characters.write',
  'maps.read',
  'maps.write',
  'tokens.read',
  'tokens.write',
  'chat.write',
  'dice.roll',
  'assets.read',
  'assets.write',
  'themes.read',
  'themes.write',
  'storage.read',
  'storage.write',
  'network.fetch',
] as const;

export type ExtensionPermission = (typeof EXTENSION_PERMISSIONS)[number];

export type JsonSchema = Record<string, unknown>;

/**
 * An application command is the unit which future REST, WebSocket, UI, MCP,
 * and plugin adapters all invoke. It intentionally has no transport details.
 */
export interface ApplicationCommandDescriptor {
  id: string;
  version: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  requiredPermissions: ExtensionPermission[];
  idempotent: boolean;
}

export type AgentConfirmation = 'never' | 'when-risky' | 'always';
export type AgentRisk = 'read' | 'low' | 'high';

/**
 * A discoverable tool for an agent adapter. `commandId` is the only execution
 * target: adapters must dispatch the application command, never issue a
 * privileged HTTP request or emit a raw socket event on the agent's behalf.
 */
export interface AgentToolDescriptor {
  id: string;
  title: string;
  description: string;
  commandId: string;
  requiredPermissions: ExtensionPermission[];
  risk: AgentRisk;
  confirmation: AgentConfirmation;
}

export interface ExtensionCompatibility {
  /** Semver range accepted by this extension API implementation. */
  extensionApi: string;
  /** Semver range accepted by the CozyVTT application. */
  cozyVtt: string;
}

/**
 * Declarative install manifest. This is safe to parse and inspect before any
 * extension code is activated.
 */
export interface ExtensionManifest {
  manifestVersion: '1.0';
  id: string;
  name: string;
  version: string;
  description: string;
  compatibility: ExtensionCompatibility;
  capabilities: ExtensionCapability[];
  permissions: ExtensionPermission[];
  commands: ApplicationCommandDescriptor[];
  agentTools: AgentToolDescriptor[];
}

export type ExtensionLifecycleState = 'installed' | 'active';

export interface ExtensionLifecycleContext {
  extensionId: string;
  extensionVersion: string;
  extensionApiVersion: string;
}

/**
 * First-party/trusted extension module contract. Loading untrusted code is not
 * part of this first slice; it requires a process or WASM sandbox first.
 */
export interface ExtensionModule {
  manifest: ExtensionManifest;
  onInstall?(context: ExtensionLifecycleContext): void | Promise<void>;
  onActivate?(context: ExtensionLifecycleContext): void | Promise<void>;
  onDeactivate?(context: ExtensionLifecycleContext): void | Promise<void>;
  onUninstall?(context: ExtensionLifecycleContext): void | Promise<void>;
}

export interface RegisteredExtension {
  manifest: ExtensionManifest;
  state: ExtensionLifecycleState;
}

export interface ExtensionHostVersion {
  extensionApiVersion: string;
  platformVersion: string;
}
