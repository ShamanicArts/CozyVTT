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
  | "presentations"
  | "themes"
  | "game-systems"
  | "importers"
  | "exporters"
  | "http-transports";

export type CampaignPresentationRole = "DM" | "PLAYER" | "SPECTATOR";

/** Executable campaign-stage contribution declared by a trusted package. */
export interface CampaignPresentationContributionDescriptor {
  readonly id: string;
  readonly title: string;
  readonly contractVersion: "1";
  /** Self-contained JavaScript module exporting `activateCampaignPresentation`. */
  readonly browserEntrypoint: string;
  readonly roles: readonly CampaignPresentationRole[];
}

export interface GameSystemCharacterTemplateDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/** Declarative rules data plus a trusted browser sheet for a game system. */
export interface GameSystemContributionDescriptor {
  /** Stable persisted ID. Existing systems retain their historical uppercase IDs. */
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly description: string;
  readonly contractVersion: "1";
  readonly selectable: boolean;
  /** Self-contained JavaScript module exporting `activateGameSystem`. */
  readonly browserEntrypoint: string;
  /** JSON Schema evaluated by the authoritative backend before character writes. */
  readonly characterDataSchema: JsonSchema;
  readonly characterTemplates: readonly GameSystemCharacterTemplateDescriptor[];
}

export interface GameSystemCharacterSheetContext {
  readonly character: {
    readonly id: string;
    readonly name: string;
    readonly gameSystem: string;
    readonly data: Readonly<Record<string, unknown>>;
    readonly tokenImageUrl?: string | null;
  };
  readonly mode: "view" | "edit";
  save(data: Readonly<Record<string, unknown>>, tokenImageUrl?: string): Promise<void>;
  cancel(): void;
  roll?(expression: string, purpose: string): void;
}

export interface GameSystemCharacterSheetInstance {
  update(context: GameSystemCharacterSheetContext): void;
  dispose(): void;
}

export interface GameSystemPluginApi {
  readonly contractVersion: "1";
  registerCharacterSheet(contribution: {
    readonly id: string;
    mount(
      element: HTMLElement,
      context: GameSystemCharacterSheetContext,
    ): GameSystemCharacterSheetInstance | Promise<GameSystemCharacterSheetInstance>;
  }): () => void;
}

export type CampaignPresentationBreakpoint = "compact" | "medium" | "wide";

export interface CampaignPresentationSceneAccess {
  getSnapshot(): CampaignPresentationSceneSnapshot;
  subscribe(listener: () => void): () => void;
  selectToken(tokenId: string | null): void;
  setInteractionMode(mode: CampaignPresentationInteractionMode): void;
  setRulerOrigin(origin: CampaignPresentationPoint | null): void;
  setRulerColor(color: "amber" | "purple" | "black"): void;
  setAoE(input: Partial<CampaignPresentationAoE>): void;
  ping(position: CampaignPresentationPoint): void;
  moveToken(input: {
    readonly tokenId: string;
    readonly x: number;
    readonly y: number;
  }): Promise<void>;
}

export interface CampaignPresentationSceneSnapshot {
  readonly version: "1";
  readonly campaignId: string;
  readonly role: CampaignPresentationRole;
  readonly selectedTokenId: string | null;
  readonly interaction: CampaignPresentationInteractionState;
  readonly map: CampaignPresentationMap | null;
}

export type CampaignPresentationInteractionMode = "none" | "ruler" | "aoe" | "ping";

export interface CampaignPresentationPoint {
  readonly x: number;
  readonly y: number;
}

export interface CampaignPresentationAoE {
  readonly origin: CampaignPresentationPoint | null;
  readonly shape: "sphere" | "cylinder" | "cone" | "line" | "cube";
  readonly sizeFt: number;
  readonly widthFt?: number;
}

export interface CampaignPresentationInteractionState {
  readonly mode: CampaignPresentationInteractionMode;
  readonly ruler: {
    readonly origin: CampaignPresentationPoint | null;
    readonly color: "amber" | "purple" | "black";
  };
  readonly aoe: CampaignPresentationAoE;
  readonly pings: readonly {
    readonly id: string;
    readonly position: CampaignPresentationPoint;
    readonly name: string;
    readonly color: string;
    readonly startedAt: number;
  }[];
}

export interface CampaignPresentationMap {
  readonly id: string;
  readonly revision: number;
  readonly name: string;
  readonly imageUrl: string;
  readonly width: number;
  readonly height: number;
  readonly gridSize: number;
  readonly feetPerSquare: number;
  readonly diagonalRule: "flat" | "alternating";
  readonly lightingEnabled: boolean;
  readonly tokens: readonly CampaignPresentationToken[];
  readonly walls: readonly CampaignPresentationWall[];
  readonly lights: readonly CampaignPresentationLight[];
  readonly fog:
    | { readonly kind: "full"; readonly state: CampaignPresentationFogState }
    | {
        readonly kind: "revealed";
        readonly cells: readonly number[];
        readonly fogCols: number;
        readonly fogRows: number;
        readonly cellPx: number;
      }
    | { readonly kind: "none" };
}

export interface CampaignPresentationToken {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly rotation: number;
  readonly disposition: string | null;
  readonly canMove: boolean;
}

export interface CampaignPresentationWall {
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly type: string;
}

export interface CampaignPresentationLight {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly brightRadius: number;
  readonly dimRadius: number;
  readonly color: string;
  readonly enabled: boolean;
}

export interface CampaignPresentationFogState {
  readonly fogCols: number;
  readonly fogRows: number;
  readonly cellPx: number;
  readonly revealed: readonly boolean[];
}

export interface CampaignPresentationContext {
  readonly layout: {
    readonly breakpoint: CampaignPresentationBreakpoint;
    readonly role: CampaignPresentationRole;
  };
  readonly campaignId: string;
  readonly scene: CampaignPresentationSceneAccess;
}

export interface CampaignPresentationInstance {
  readonly commands?: readonly CampaignPresentationCommand[];
  update(context: CampaignPresentationContext): void;
  resize(size: { readonly width: number; readonly height: number }): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export interface CampaignPresentationCommand {
  readonly id: string;
  readonly title: string;
  readonly icon: "aoe" | "fit" | "grid" | "ping" | "ruler" | "zoom-in" | "zoom-out";
  readonly active?: () => boolean;
  run(): void;
}

export interface CampaignPresentationPluginApi {
  readonly contractVersion: "1";
  registerPresentation(contribution: {
    readonly id: string;
    readonly title: string;
    activate(
      mount: HTMLElement,
      context: CampaignPresentationContext,
    ): CampaignPresentationInstance | Promise<CampaignPresentationInstance>;
  }): () => void;
}

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

export interface CampaignActivityInput {
  campaignId: string;
  /** Must be namespaced to the authenticated extension, for example weather.plugin.storm_started. */
  eventType: string;
  kind: "narrative" | "mechanic" | "scene" | "session" | "system";
  importance?: "routine" | "consequential" | "error";
  summary: string;
  payload?: Readonly<Record<string, unknown>>;
}

/** Publish extension-specific activity through CozyVTT's validated campaign stream. */
export function publishCampaignActivity(
  gateway: CoreExtensionGateway,
  input: CampaignActivityInput,
  options: { idempotencyKey: string; approvalId?: string },
): Promise<unknown> {
  return gateway.dispatch("campaign.activity.publish", { ...input }, options);
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
