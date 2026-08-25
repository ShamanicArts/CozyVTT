/**
 * Stable, transport-independent contracts for CozyVTT extensions.
 *
 * These types deliberately describe application capabilities and commands, not
 * Express routes, Socket.IO events, database tables, or renderer internals.
 * They are the backend-local source of truth until the project grows a shared
 * package with a published build pipeline.
 */

export const EXTENSION_API_VERSION = "1.0.0";
export const COZYVTT_PLATFORM_VERSION = "1.2.0-preview.1";

export const EXTENSION_CAPABILITIES = [
  "commands",
  "capability-publications",
  "scene-layers",
  "renderers",
  "presentations",
  "themes",
  "game-systems",
  "importers",
  "exporters",
  "http-transports",
] as const;

export type ExtensionCapability = (typeof EXTENSION_CAPABILITIES)[number];

/**
 * A permission is a declared request, not an automatic grant. The policy
 * adapter which executes a command must still check the caller's grants.
 */
export const EXTENSION_PERMISSIONS = [
  "campaign.read",
  "campaign.write",
  "characters.read",
  "characters.write",
  "maps.read",
  "maps.write",
  "tokens.read",
  "tokens.write",
  "chat.write",
  "dice.roll",
  "assets.read",
  "assets.write",
  "themes.read",
  "themes.write",
  "storage.read",
  "storage.write",
  "network.fetch",
] as const;

export type ExtensionPermission = (typeof EXTENSION_PERMISSIONS)[number];

export type JsonSchema = Record<string, unknown>;

/**
 * An application command is the unit which future REST, WebSocket, UI, plugin adapters all invoke. It intentionally has no transport details.
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

export type CapabilityApproval = "never" | "when-risky" | "always";
export type CapabilityRisk = "read" | "low" | "high";

/**
 * A discoverable capability for an capability adapter. `commandId` is the only execution
 * target: adapters must dispatch the application command, never issue a
 * privileged HTTP request or emit a raw socket event on the capability's behalf.
 */
export interface PublishedCapabilityDescriptor {
  id: string;
  title: string;
  description: string;
  commandId: string;
  requiredPermissions: ExtensionPermission[];
  risk: CapabilityRisk;
  approval: CapabilityApproval;
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
  manifestVersion: "1.0";
  id: string;
  name: string;
  version: string;
  description: string;
  compatibility: ExtensionCompatibility;
  capabilities: ExtensionCapability[];
  permissions: ExtensionPermission[];
  commands: ApplicationCommandDescriptor[];
  publishedCapabilities: PublishedCapabilityDescriptor[];
  httpRoutes?: HttpRouteDescriptor[];
  oauthResources?: OAuthResourceDescriptor[];
}

export type HttpRouteMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export interface HttpRouteDescriptor {
  id: string;
  method: HttpRouteMethod;
  /** Path relative to the extension's host-managed transport mount. */
  path: string;
  oauthResourceId?: string;
  requiredScopes: string[];
}

export interface OAuthResourceDescriptor {
  id: string;
  /** Path relative to the extension's host-managed transport mount. */
  path: string;
  scopes: string[];
}

export type ExtensionLifecycleState = "installed" | "active";

export interface ExtensionLifecycleContext {
  extensionId: string;
  extensionVersion: string;
  extensionApiVersion: string;
}

export interface ExtensionCommandExecutionContext {
  readonly principal: {
    readonly id: string;
    readonly kind: "plugin" | "user" | "service";
  };
  readonly scope: { readonly campaignId: string };
  /** Campaign-scoped application capabilities; no transport or database access. */
  readonly core?: CoreExtensionGateway;
}

export interface CoreExtensionGateway {
  listCommands(): Array<{
    id: string;
    version: string;
    title: string;
    description: string;
    inputSchema: JsonSchema;
    outputSchema: JsonSchema;
    requiredPermissions: readonly ExtensionPermission[];
    risk: "read" | "medium" | "high";
    approvalRequired: boolean;
    idempotencyRequired: boolean;
    openWorld: boolean;
  }>;
  dispatch(
    commandId: string,
    input: Readonly<Record<string, unknown>>,
    options?: { idempotencyKey?: string; approvalId?: string },
  ): Promise<unknown>;
  listQueries(): Array<{
    id: string;
    version: string;
    title: string;
    description: string;
    inputSchema: JsonSchema;
    outputSchema: JsonSchema;
    requiredPermissions: readonly ExtensionPermission[];
  }>;
  query(
    queryId: string,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
}

export type ExtensionCommandHandler = (
  input: Readonly<Record<string, unknown>>,
  context: ExtensionCommandExecutionContext,
) => unknown | Promise<unknown>;

export interface ExtensionHttpContext {
  readonly extensionId: string;
  readonly routeId: string;
  readonly authorization?: {
    readonly credentialId: string;
    readonly delegatedUserId: string;
    readonly campaignId: string;
    readonly resourceId: string;
    readonly scopes: readonly string[];
  };
  readonly capabilities?: CoreExtensionGateway;
}

export type ExtensionHttpHandler = (
  request: Request,
  context: ExtensionHttpContext,
) => Response | Promise<Response>;

/**
 * First-party/trusted extension module contract. Loading untrusted code is not
 * part of this first slice; it requires a process or WASM sandbox first.
 */
export interface ExtensionModule {
  manifest: ExtensionManifest;
  /** Executable handlers must exactly match the manifest command IDs. */
  commandHandlers?: Readonly<Record<string, ExtensionCommandHandler>>;
  httpHandlers?: Readonly<Record<string, ExtensionHttpHandler>>;
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
