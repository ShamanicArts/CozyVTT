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
  | "agent-tools"
  | "scene-layers"
  | "renderers"
  | "themes"
  | "game-systems"
  | "importers"
  | "exporters";

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

export interface AgentToolDescriptor {
  id: string;
  title: string;
  description: string;
  commandId: string;
  requiredPermissions: ExtensionPermission[];
  risk: "read" | "low" | "high";
  confirmation: "never" | "when-risky" | "always";
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
  agentTools: AgentToolDescriptor[];
}

export interface CoreCommandSummary {
  id: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  operatingRoles: readonly ("GM" | "PLAYER" | "NPC" | "SYSTEM")[];
}

export interface CoreExtensionGateway {
  listCommands(): CoreCommandSummary[];
  dispatch(
    commandId: string,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  listQueries(): Array<{ id: string; inputSchema: JsonSchema }>;
  query(
    queryId: string,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
}

export interface ExtensionCommandExecutionContext {
  readonly principal: {
    readonly id: string;
    readonly kind: "agent" | "user" | "service";
  };
  readonly scope: { readonly campaignId: string };
  readonly core?: CoreExtensionGateway;
}

export type ExtensionCommandHandler = (
  input: Readonly<Record<string, unknown>>,
  context: ExtensionCommandExecutionContext,
) => unknown | Promise<unknown>;

export interface ExtensionLifecycleContext {
  extensionId: string;
  extensionVersion: string;
  extensionApiVersion: string;
}

export interface ExtensionModule {
  manifest: ExtensionManifest;
  commandHandlers?: Readonly<Record<string, ExtensionCommandHandler>>;
  onInstall?(context: ExtensionLifecycleContext): void | Promise<void>;
  onActivate?(context: ExtensionLifecycleContext): void | Promise<void>;
  onDeactivate?(context: ExtensionLifecycleContext): void | Promise<void>;
  onUninstall?(context: ExtensionLifecycleContext): void | Promise<void>;
}

/** Preserves literal manifest/handler types while enforcing the public shape. */
export function defineExtension<T extends ExtensionModule>(extension: T): T {
  return extension;
}
