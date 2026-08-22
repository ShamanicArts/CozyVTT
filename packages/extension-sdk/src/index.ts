/** Public, transport-independent CozyVTT extension SDK. */
export const EXTENSION_API_VERSION = "1.0.0";

export type JsonSchema = Readonly<Record<string, unknown>>;
export type ExtensionPermission =
  | "campaign.read"
  | "campaign.write"
  | "characters.read"
  | "characters.write"
  | "maps.read"
  | "maps.write"
  | "tokens.read"
  | "tokens.write"
  | "chat.write"
  | "dice.roll"
  | "assets.read"
  | "assets.write"
  | "themes.read"
  | "themes.write"
  | "storage.read"
  | "storage.write"
  | "network.fetch";

export type ExtensionCapability =
  | "commands"
  | "capability-publications"
  | "scene-layers"
  | "renderers"
  | "themes"
  | "game-systems"
  | "importers"
  | "exporters"
  | "http-transports";

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

export interface PublishedCapabilityDescriptor {
  id: string;
  title: string;
  description: string;
  commandId: string;
  requiredPermissions: ExtensionPermission[];
  risk: "read" | "low" | "high";
  approval: "never" | "when-risky" | "always";
}

export interface ExtensionManifest {
  manifestVersion: "1.0";
  id: string;
  name: string;
  version: string;
  description: string;
  compatibility: {
    extensionApi: string;
    cozyVtt: string;
  };
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
  path: string;
  oauthResourceId?: string;
  requiredScopes: string[];
}

export interface OAuthResourceDescriptor {
  id: string;
  path: string;
  scopes: string[];
}

export interface CoreCommandSummary {
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
  operatingRoles: readonly ("GM" | "PLAYER" | "NPC" | "SYSTEM")[];
}

export interface CoreExtensionGateway {
  listCommands(): CoreCommandSummary[];
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

export interface ExtensionCommandExecutionContext {
  readonly principal: {
    readonly id: string;
    readonly kind: "plugin" | "user" | "service";
  };
  readonly scope: { readonly campaignId: string };
  readonly core?: CoreExtensionGateway;
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

export interface ExtensionLifecycleContext {
  extensionId: string;
  extensionVersion: string;
  extensionApiVersion: string;
}

export interface ExtensionModule {
  manifest: ExtensionManifest;
  commandHandlers?: Readonly<Record<string, ExtensionCommandHandler>>;
  httpHandlers?: Readonly<Record<string, ExtensionHttpHandler>>;
  onInstall?(context: ExtensionLifecycleContext): void | Promise<void>;
  onActivate?(context: ExtensionLifecycleContext): void | Promise<void>;
  onDeactivate?(context: ExtensionLifecycleContext): void | Promise<void>;
  onUninstall?(context: ExtensionLifecycleContext): void | Promise<void>;
}

/** Preserves literal manifest/handler types while enforcing the public shape. */
export function defineExtension<T extends ExtensionModule>(extension: T): T {
  return extension;
}
