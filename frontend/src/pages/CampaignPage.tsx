// ============================================
// Campaign Page
// Main campaign view with three-panel layout
// Left: Campaign info, character, party
// Center: Map canvas
// Right: Chat, dice roller, controls
// ============================================

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import { useNavigate } from "react-router-dom";
import { CampaignProvider, useCampaign } from "@/contexts/CampaignContext";
import { WebSocketProvider, useWebSocket } from "@/contexts/WebSocketContext";
import { useAuth } from "@/contexts/AuthContext";
import { useGameStore } from "@/stores/gameStore";
import { useInitiativeSync } from "@/hooks/useInitiativeSync";
import {
  ArrowLeft,
  Grid3x3,
  Loader2,
  Maximize2,
  Sun,
  PauseCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Map as MapIcon,
  MapPin,
  Ruler,
  Users,
  MessageCircle,
  Wrench,
  ZoomIn,
  ZoomOut,
  Zap,
} from "lucide-react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
  type PanelImperativeHandle,
} from "react-resizable-panels";

// Campaign components
import CampaignInfo from "@/components/campaign/CampaignInfo";
import CampaignRoster from "@/components/campaign/CampaignRoster";
import { MapRendererProvider } from "@/components/campaign/MapRendererProvider";
// Lazy-loaded — MapCanvas is by far the largest component in the app; splitting
// it into its own chunk keeps the CampaignPage shell fast to load and paints
// the sidebars while the canvas code downloads.
const MapCanvas = lazy(() => import("@/components/campaign/MapCanvas"));
import MapManager from "@/components/campaign/MapManager";
import TokenManager from "@/components/campaign/TokenManager";
import SpiritLayerControls from "@/components/campaign/SpiritLayerControls";
import AtmospherePanel from "@/components/campaign/AtmospherePanel";
import AtmospherePlayer from "@/components/campaign/AtmospherePlayer";
import NpcQuickEditor from "@/components/campaign/NpcQuickEditor";
import CreatureLibrary from "@/components/campaign/CreatureLibrary";
import TokenTemplateLibrary from "@/components/campaign/TokenTemplateLibrary";
import TokenRoster from "@/components/campaign/TokenRoster";
import CampaignSettingsModal from "@/components/campaign/CampaignSettingsModal";
import SessionSidebar from "@/components/campaign/SessionSidebar";
import SessionToolbar, {
  type SessionToolKey,
} from "@/components/campaign/SessionToolbar";
import ConnectionStatus from "@/components/ConnectionStatus";
import { CampaignStatus, TokenType } from "@/types";
import type { Token } from "@/types";
import Button from "@/components/ui/Button";
import Tooltip from "@/components/ui/Tooltip";
import {
  WORKSPACE_LAYOUT_CONTRACT_VERSION,
  WorkspaceLayoutProvider,
  useWorkspaceBreakpoint,
  useWorkspaceLayoutHost,
  useWorkspaceRegion,
  type WorkspaceLayoutContext,
  type WorkspaceLayoutRegion,
  type WorkspaceContributionProps,
} from "@/layout";
import {
  CAMPAIGN_PRESENTATION_CONTRACT_VERSION,
  CampaignPresentationProvider,
  CampaignPresentationSwitcherProvider,
  CampaignSceneAccess,
  CampaignStageHost,
  PresentationRegistry,
  type CampaignPresentationCommand,
  type ReactCampaignPresentationContribution,
} from "@/presentations";
import { PresentationSelector } from "@/components/campaign/PresentationSelector";

interface CampaignWorkspaceRuntime {
  readonly onEditToken: (token: Token) => void;
  readonly openPanels: Partial<Record<SessionToolKey, boolean>>;
  readonly onOpenTool: (key: SessionToolKey) => void;
  readonly spiritLayerEnabled: boolean;
}

const CampaignWorkspaceRuntimeContext =
  createContext<CampaignWorkspaceRuntime | null>(null);

function useCampaignWorkspaceRuntime(): CampaignWorkspaceRuntime {
  const runtime = useContext(CampaignWorkspaceRuntimeContext);
  if (!runtime) throw new Error("Campaign workspace runtime is not mounted.");
  return runtime;
}

function CoreCampaignNavigator() {
  const { userRole } = useCampaign();
  const { onEditToken } = useCampaignWorkspaceRuntime();
  return (
    <div className="overflow-hidden rounded-cozy border border-brand/15 bg-surface-light">
      <CampaignInfo />
      <CampaignRoster />
      {userRole === "DM" && <TokenRoster onEditToken={onEditToken} />}
    </div>
  );
}

export const CORE_MAP_2D_PRESENTATION_ID = "cozyvtt.core.map-2d";

function CoreMap2DPresentation({
  scene,
}: {
  readonly scene: CampaignSceneAccess;
}) {
  const { onEditToken } = useCampaignWorkspaceRuntime();
  return (
    <Suspense
      fallback={
        <div
          className="flex h-full w-full items-center justify-center"
          aria-live="polite"
          aria-label="Loading map"
        >
          <Loader2
            className="h-8 w-8 animate-spin text-brand"
            aria-hidden="true"
          />
        </div>
      }
    >
      <MapRendererProvider>
        <MapCanvas onEditToken={onEditToken} sceneAccess={scene} />
      </MapRendererProvider>
    </Suspense>
  );
}

const CORE_MAP_2D_PRESENTATION: ReactCampaignPresentationContribution = {
  contractVersion: CAMPAIGN_PRESENTATION_CONTRACT_VERSION,
  id: CORE_MAP_2D_PRESENTATION_ID,
  ownerId: "cozyvtt.core",
  title: "Map",
  kind: "react",
  render: (context) => <CoreMap2DPresentation scene={context.scene as CampaignSceneAccess} />,
};

function CoreCampaignStage({ layoutContext }: WorkspaceContributionProps) {
  const {
    campaign,
    currentMap,
    userRole,
    setCurrentMap,
    setPlayerSpiritVisible,
    updateActivePresentation,
  } = useCampaign();
  const { user } = useAuth();
  const { socket, status } = useWebSocket();
  const [presentationCommands, setPresentationCommands] = useState<
    readonly CampaignPresentationCommand[]
  >([]);
  const [, setCommandRevision] = useState(0);
  const registryRef = useRef<PresentationRegistry | null>(null);
  if (registryRef.current === null) {
    registryRef.current = new PresentationRegistry();
    registryRef.current.register(CORE_MAP_2D_PRESENTATION);
  }
  const sceneRef = useRef<CampaignSceneAccess | null>(null);
  if (campaign && userRole && sceneRef.current === null) {
    sceneRef.current = new CampaignSceneAccess(
      {
        campaign,
        map: currentMap,
        role: userRole,
        userId: user?.id ?? "",
      },
      (map, spiritVisible) => {
        setCurrentMap(map);
        if (spiritVisible !== undefined) setPlayerSpiritVisible(spiritVisible);
      },
    );
  }
  const activePresentationId =
    campaign?.activePresentationId ?? CORE_MAP_2D_PRESENTATION_ID;

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !campaign || !userRole) return;
    scene.update(
      {
        campaign,
        map: currentMap,
        role: userRole,
        userId: user?.id ?? "",
      },
      (map, spiritVisible) => {
        setCurrentMap(map);
        if (spiritVisible !== undefined) setPlayerSpiritVisible(spiritVisible);
      },
    );
  }, [
    campaign,
    currentMap,
    setCurrentMap,
    setPlayerSpiritVisible,
    user?.id,
    userRole,
  ]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setSocket(status === "connected" ? socket : null);
    return () => scene.setSocket(null);
  }, [socket, status]);

  useEffect(() => () => sceneRef.current?.dispose(), []);

  const presentationSwitcher = campaign && userRole === "DM" ? (
    <PresentationSelector
      campaignId={campaign.id}
      activePresentationId={activePresentationId}
      registry={registryRef.current}
      onChanged={updateActivePresentation}
    />
  ) : null;
  const commandIcons = {
    fit: Maximize2,
    grid: Grid3x3,
    ruler: Ruler,
    aoe: Zap,
    ping: MapPin,
    "zoom-in": ZoomIn,
    "zoom-out": ZoomOut,
  } as const;
  const stage = campaign && sceneRef.current ? (
    <div className="relative h-full w-full">
      <CampaignPresentationSwitcherProvider switcher={presentationSwitcher}>
        <CampaignStageHost
          registry={registryRef.current}
          activePresentationId={activePresentationId}
          fallbackPresentationId={CORE_MAP_2D_PRESENTATION_ID}
          context={{
            layout: layoutContext,
            campaignId: campaign.id,
            scene: sceneRef.current,
          }}
          onCommandsChanged={setPresentationCommands}
        />
      </CampaignPresentationSwitcherProvider>
      {activePresentationId !== CORE_MAP_2D_PRESENTATION_ID &&
        (presentationSwitcher || presentationCommands.length > 0) && (
          <div
            className="absolute left-2 top-2 z-30 flex max-w-[calc(100%-1rem)] items-center gap-1 overflow-x-auto rounded-cozy border border-brand/20 bg-surface-light p-1.5 shadow-lg sm:left-4 sm:top-4 sm:gap-2"
            role="toolbar"
            aria-label="Map controls"
          >
            {presentationSwitcher}
            {presentationCommands.length > 0 && (
              <div className="hidden h-6 w-px bg-moss-green/20 sm:block" />
            )}
            {presentationCommands.map((command) => {
              const Icon = commandIcons[command.icon];
              return (
                <Button
                  key={command.id}
                  variant="secondary"
                  className={`min-h-11 min-w-11 p-2 sm:min-h-9 sm:min-w-9 ${command.active?.() ? "bg-moss-green/20 text-moss-green" : ""}`}
                  title={command.title}
                  aria-label={command.title}
                  aria-pressed={command.active ? command.active() : undefined}
                  onClick={() => {
                    command.run();
                    setCommandRevision((revision) => revision + 1);
                  }}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </Button>
              );
            })}
          </div>
        )}
    </div>
  ) : (
    <div className="h-full w-full" />
  );
  return campaign ? (
    <CampaignPresentationProvider
      campaignId={campaign.id}
      registry={registryRef.current}
    >
      {stage}
    </CampaignPresentationProvider>
  ) : (
    stage
  );
}

function CoreCampaignInspector() {
  return <SessionSidebar />;
}

function CoreCampaignTools({ layoutContext }: WorkspaceContributionProps) {
  const { openPanels, onOpenTool, spiritLayerEnabled } =
    useCampaignWorkspaceRuntime();
  return (
    <SessionToolbar
      openPanels={openPanels}
      onOpen={onOpenTool}
      spiritLayerEnabled={spiritLayerEnabled}
      presentation={layoutContext.breakpoint === "wide" ? "toolbar" : "menu"}
    />
  );
}

const CORE_WORKSPACE_CONTRIBUTIONS = [
  {
    contractVersion: WORKSPACE_LAYOUT_CONTRACT_VERSION,
    id: "cozyvtt.core.campaign-navigator",
    ownerId: "cozyvtt.core",
    region: "campaign.navigator",
    title: "Party",
    component: CoreCampaignNavigator,
    order: 0,
  },
  {
    contractVersion: WORKSPACE_LAYOUT_CONTRACT_VERSION,
    id: "cozyvtt.core.campaign-stage",
    ownerId: "cozyvtt.core",
    region: "campaign.stage",
    title: "Map",
    component: CoreCampaignStage,
    order: 0,
  },
  {
    contractVersion: WORKSPACE_LAYOUT_CONTRACT_VERSION,
    id: "cozyvtt.core.campaign-inspector",
    ownerId: "cozyvtt.core",
    region: "campaign.inspector",
    title: "Activity",
    component: CoreCampaignInspector,
    order: 0,
  },
  {
    contractVersion: WORKSPACE_LAYOUT_CONTRACT_VERSION,
    id: "cozyvtt.core.campaign-tools",
    ownerId: "cozyvtt.core",
    region: "campaign.header.tools",
    title: "Campaign tools",
    component: CoreCampaignTools,
    order: 0,
    visibility: { roles: ["DM"] },
  },
] as const;

function useCoreWorkspaceContributions() {
  const host = useWorkspaceLayoutHost();
  useEffect(() => {
    const registrations = CORE_WORKSPACE_CONTRIBUTIONS.map((contribution) =>
      host.register(contribution),
    );
    return () => registrations.forEach(({ dispose }) => dispose());
  }, [host]);
}

function WorkspaceRegion({
  region,
  layoutContext,
  className,
}: {
  readonly region: WorkspaceLayoutRegion;
  readonly layoutContext: WorkspaceLayoutContext;
  readonly className?: string;
}) {
  const contributions = useWorkspaceRegion(region, layoutContext);
  return contributions.map(({ id, component: Contribution }) => (
    <div key={id} className={className} data-workspace-contribution={id}>
      <Contribution layoutContext={layoutContext} />
    </div>
  ));
}

type MobileDestination = "map" | "party" | "activity" | "actions";

const MOBILE_DESTINATIONS = [
  { key: "map", label: "Map", icon: MapIcon },
  { key: "party", label: "Party", icon: Users },
  { key: "activity", label: "Activity", icon: MessageCircle },
] as const;

// ============================================
// Campaign Page Content (inside provider)
// ============================================

function CampaignPageContent() {
  useInitiativeSync();
  const navigate = useNavigate();
  const {
    campaign,
    currentMap,
    loading,
    error,
    userRole,
    updateCampaignStatus,
    setActiveSession,
    refreshCurrentMap,
    updateActivePresentation,
  } = useCampaign();
  const { socket, reconnectCount, status } = useWebSocket();

  // After a WebSocket reconnect, refetch the current map's state via REST.
  // The real-time stream only pushes deltas; any moves/wall edits/fog ops
  // that broadcast while this client was offline are not replayed, so without
  // this refresh the local map view stays frozen on pre-disconnect state
  // until the next live event arrives (or a hard refresh). reconnectCount is
  // 0 on initial load and ticks once per successful reconnect, so this skips
  // the initial mount.
  useEffect(() => {
    if (reconnectCount > 0) {
      refreshCurrentMap();
    }
    // refreshCurrentMap is stable enough for this trigger pattern
  }, [reconnectCount]);
  const [isMapManagerOpen, setIsMapManagerOpen] = useState(false);
  const [isTokenManagerOpen, setIsTokenManagerOpen] = useState(false);
  const [isSpiritLayerOpen, setIsSpiritLayerOpen] = useState(false);
  const [isAtmospherePanelOpen, setIsAtmospherePanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreatureLibraryOpen, setIsCreatureLibraryOpen] = useState(false);
  const [isTokenTemplateLibraryOpen, setIsTokenTemplateLibraryOpen] =
    useState(false);
  const [quickEditToken, setQuickEditToken] = useState<Token | null>(null);
  const breakpoint = useWorkspaceBreakpoint();
  const [mobileDestination, setMobileDestination] =
    useState<MobileDestination>("map");
  useCoreWorkspaceContributions();

  const layoutContext: WorkspaceLayoutContext = {
    breakpoint,
    role: userRole ?? "SPECTATOR",
  };

  const handleEditToken = (token: Token) => {
    const effectiveType =
      token.type ?? (token.characterId ? TokenType.PLAYER : TokenType.NPC);
    if (effectiveType === TokenType.NPC || effectiveType === TokenType.OBJECT) {
      setQuickEditToken(token);
    }
  };

  // Resizable panel layout — persisted to localStorage so each user's
  // column sizes survive reloads.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "cozyvtt-session-layout",
    storage: localStorage,
  });
  const leftPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const togglePanel = (
    panelRef: React.RefObject<PanelImperativeHandle | null>,
    fallbackSize: string,
  ) => {
    const panel = panelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
      // A panel restored from a collapsed saved layout has no previous
      // size to expand back to — fall back to its default share.
      if (panel.getSize().asPercentage === 0) {
        panel.resize(fallbackSize);
      }
    } else {
      panel.collapse();
    }
  };

  // SessionToolbar reports which tool was clicked; the open/close state
  // for each slide-over stays here.
  const sessionPanelOpeners: Record<SessionToolKey, () => void> = {
    maps: () => setIsMapManagerOpen(true),
    tokens: () => setIsTokenManagerOpen(true),
    creatures: () => setIsCreatureLibraryOpen(true),
    templates: () => setIsTokenTemplateLibraryOpen(true),
    spirit: () => setIsSpiritLayerOpen(true),
    atmosphere: () => setIsAtmospherePanelOpen(true),
    settings: () => setIsSettingsOpen(true),
  };

  const workspaceRuntime: CampaignWorkspaceRuntime = {
    onEditToken: handleEditToken,
    openPanels: {
      maps: isMapManagerOpen,
      tokens: isTokenManagerOpen,
      creatures: isCreatureLibraryOpen,
      templates: isTokenTemplateLibraryOpen,
      spirit: isSpiritLayerOpen,
      atmosphere: isAtmospherePanelOpen,
      settings: isSettingsOpen,
    },
    onOpenTool: (key) => sessionPanelOpeners[key](),
    spiritLayerEnabled: campaign?.spiritLayerEnabled ?? false,
  };

  // ============================================
  // Session WebSocket listeners
  // All clients (DM + Players) listen so campaign status stays in sync
  // ============================================
  useEffect(() => {
    // Register on the live socket only once it is actually connected. The socket
    // wrapper is a stable singleton whose underlying connection is created
    // asynchronously, so registering before the connection exists would silently
    // no-op. Re-running when `status` flips to 'connected' — including after a
    // reconnect that recreates the socket — (re)registers on the live socket.
    if (!socket || status !== "connected") return;

    const handleStarted = (data: {
      sessionId: string;
      sessionNumber: number;
      startedAt: string;
    }) => {
      updateCampaignStatus(CampaignStatus.ACTIVE);
      setActiveSession({
        id: data.sessionId,
        sessionNumber: data.sessionNumber,
        startedAt: data.startedAt,
      });
    };
    const handlePaused = () => {
      updateCampaignStatus(CampaignStatus.PAUSED);
    };
    const handleEnded = () => {
      updateCampaignStatus(CampaignStatus.INACTIVE);
      setActiveSession(null);
    };
    const handleResumed = (data: {
      sessionId: string;
      sessionNumber: number;
      startedAt: string;
    }) => {
      updateCampaignStatus(CampaignStatus.ACTIVE);
      setActiveSession({
        id: data.sessionId,
        sessionNumber: data.sessionNumber,
        startedAt: data.startedAt,
      });
    };
    const handlePresentationChanged = (data: {
      activePresentationId: string;
    }) => updateActivePresentation(data.activePresentationId);

    socket.onSessionStarted(handleStarted);
    socket.onSessionPaused(handlePaused);
    socket.onSessionEnded(handleEnded);
    socket.onSessionResumed(handleResumed);
    socket
      .getSocket()
      ?.on("campaign.presentation.changed", handlePresentationChanged);

    return () => {
      const socketInstance = socket.getSocket();
      if (!socketInstance) return;
      socketInstance.off("session.started", handleStarted);
      socketInstance.off("session.paused", handlePaused);
      socketInstance.off("session.ended", handleEnded);
      socketInstance.off("session.resumed", handleResumed);
      socketInstance.off(
        "campaign.presentation.changed",
        handlePresentationChanged,
      );
    };
  }, [
    socket,
    status,
    updateCampaignStatus,
    setActiveSession,
    updateActivePresentation,
  ]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-moss-green animate-spin mx-auto" />
          <p className="text-stone-gray">Loading campaign...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="card-cozy max-w-md text-center space-y-4">
          <p className="text-spirit-red font-medium">{error}</p>
          <Button onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 inline mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // No campaign loaded
  if (!campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="card-cozy max-w-md text-center space-y-4">
          <p className="text-stone-gray">Campaign not found</p>
          <Button onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 inline mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <CampaignWorkspaceRuntimeContext.Provider value={workspaceRuntime}>
      <div className="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-canvas text-ink">
        {/* Header Bar */}
        <header className="flex min-h-[52px] items-center justify-between gap-2 border-b border-brand/20 bg-surface-light px-2 py-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Button
              onClick={() => navigate("/dashboard")}
              variant="secondary"
              aria-label="Back to dashboard"
              className="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center gap-2 !p-2 sm:min-h-9 sm:min-w-9 sm:!px-3"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>

            <div className="hidden h-6 w-px bg-brand/20 sm:block" />

            <h1 className="truncate font-heading text-sm font-bold text-brand-ink sm:text-base">
              {campaign.name}
            </h1>
          </div>

          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            {/* Connection Status */}
            <div className="hidden sm:block">
              <ConnectionStatus />
            </div>

            {/* Session status indicator (visible to all) */}
            {campaign.status === CampaignStatus.ACTIVE && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-success/100/10 border border-success/30">
                <div className="w-2 h-2 rounded-full bg-success/100 animate-pulse" />
                <span className="hidden text-xs font-medium text-success-ink sm:inline">
                  Live
                </span>
              </div>
            )}
            {campaign.status === CampaignStatus.PAUSED && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warm-amber/10 border border-warm-amber/20">
                <PauseCircle className="w-3.5 h-3.5 text-warm-amber" />
                <span className="text-xs font-medium text-warm-amber hidden sm:inline">
                  Paused
                </span>
              </div>
            )}
            {campaign.status === CampaignStatus.INACTIVE && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-stone-gray/10 border border-stone-gray/20">
                <div className="w-2 h-2 rounded-full bg-stone-gray/50" />
                <span className="text-xs font-medium text-stone-gray hidden sm:inline">
                  Inactive
                </span>
              </div>
            )}

            {/* Vibe indicator (visible to all) */}
            {campaign?.currentVibe && breakpoint === "wide" && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warm-amber/10 border border-warm-amber/20">
                <Sun className="w-3.5 h-3.5 text-warm-amber" />
                <span className="text-xs font-medium text-warm-amber capitalize hidden sm:inline">
                  {campaign.currentVibe}
                </span>
              </div>
            )}

            {/* DM tools — grouped icon toolbar */}
            {userRole === "DM" && breakpoint === "wide" && (
              <>
                <div className="h-6 w-px bg-moss-green/20" />
                <WorkspaceRegion
                  region="campaign.header.tools"
                  layoutContext={layoutContext}
                />
              </>
            )}

            {/* Sidebar collapse toggles (all roles) */}
            {breakpoint === "wide" && (
              <div className="h-6 w-px bg-moss-green/20" />
            )}
            <div className="hidden items-center gap-1 lg:flex">
              <Tooltip
                content={
                  leftCollapsed ? "Show party panel" : "Hide party panel"
                }
                side="bottom"
              >
                <Button
                  variant="ghost"
                  iconOnly
                  icon={leftCollapsed ? PanelLeftOpen : PanelLeftClose}
                  aria-label={
                    leftCollapsed ? "Show party panel" : "Hide party panel"
                  }
                  onClick={() => togglePanel(leftPanelRef, "20%")}
                />
              </Tooltip>
              <Tooltip
                content={
                  rightCollapsed ? "Show session panel" : "Hide session panel"
                }
                side="bottom"
              >
                <Button
                  variant="ghost"
                  iconOnly
                  icon={rightCollapsed ? PanelRightOpen : PanelRightClose}
                  aria-label={
                    rightCollapsed ? "Show session panel" : "Hide session panel"
                  }
                  onClick={() => togglePanel(rightPanelRef, "25%")}
                />
              </Tooltip>
            </div>
          </div>
        </header>

        {/* Session Paused Banner — visible to players when session is paused */}
        {campaign.status === CampaignStatus.PAUSED && userRole !== "DM" && (
          <div className="flex items-center justify-center gap-2 px-4 py-2 bg-warm-amber/10 border-b border-warm-amber/20">
            <PauseCircle className="w-4 h-4 text-warm-amber flex-shrink-0" />
            <p className="text-xs font-medium text-warm-amber">
              Session is paused. Token movement is disabled and dice rolls are
              automatically secret.
            </p>
          </div>
        )}

        {/* Wide workspace — three stable, resizable regions. */}
        {breakpoint === "wide" ? (
          <main className="min-h-0 flex-1 overflow-hidden">
            <Group
              orientation="horizontal"
              className="h-full w-full"
              defaultLayout={defaultLayout}
              onLayoutChanged={onLayoutChanged}
            >
              {/* Left Panel — party & campaign info */}
              <Panel
                id="party"
                defaultSize={20}
                minSize="260px"
                collapsible
                panelRef={leftPanelRef}
                onResize={(size) => setLeftCollapsed(size.asPercentage === 0)}
                className="h-full"
              >
                <aside className="h-full overflow-y-auto border-r border-brand/15 bg-surface p-3">
                  <WorkspaceRegion
                    region="campaign.navigator"
                    layoutContext={layoutContext}
                  />
                </aside>
              </Panel>

              <Separator className="w-1.5 bg-moss-green/10 transition-colors data-[separator=hover]:bg-brand/30 data-[separator=active]:bg-brand/50" />

              {/* Center Panel — map canvas */}
              <Panel id="map" defaultSize={55} minSize={30} className="h-full">
                <section className="h-full min-w-0 bg-canvas p-2">
                  <WorkspaceRegion
                    region="campaign.stage"
                    layoutContext={layoutContext}
                    className="h-full"
                  />
                </section>
              </Panel>

              <Separator className="w-1.5 bg-moss-green/10 transition-colors data-[separator=hover]:bg-brand/30 data-[separator=active]:bg-brand/50" />

              {/* Right Panel — tabbed session rail (Chat / Dice / Initiative / Session) */}
              <Panel
                id="rail"
                defaultSize={25}
                minSize="300px"
                collapsible
                panelRef={rightPanelRef}
                onResize={(size) => setRightCollapsed(size.asPercentage === 0)}
                className="h-full"
              >
                <WorkspaceRegion
                  region="campaign.inspector"
                  layoutContext={layoutContext}
                  className="h-full"
                />
              </Panel>
            </Group>
          </main>
        ) : (
          /* Compact and tablet workspace — one task at a time, same regions. */
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="relative min-h-0 flex-1 overflow-hidden bg-canvas">
              {mobileDestination === "map" && (
                <WorkspaceRegion
                  region="campaign.stage"
                  layoutContext={layoutContext}
                  className="h-full p-1 sm:p-2"
                />
              )}
              {mobileDestination === "party" && (
                <section
                  className="h-full overflow-y-auto bg-surface p-3 sm:p-4"
                  aria-label="Party and campaign"
                >
                  <WorkspaceRegion
                    region="campaign.navigator"
                    layoutContext={layoutContext}
                  />
                </section>
              )}
              {mobileDestination === "activity" && (
                <WorkspaceRegion
                  region="campaign.inspector"
                  layoutContext={layoutContext}
                  className="h-full"
                />
              )}
              {mobileDestination === "actions" && userRole === "DM" && (
                <section
                  className="h-full overflow-y-auto bg-surface p-4"
                  aria-labelledby="mobile-actions-title"
                >
                  <div className="mx-auto max-w-md space-y-3">
                    <div>
                      <h2
                        id="mobile-actions-title"
                        className="font-body text-base font-semibold text-brand-ink"
                      >
                        Campaign tools
                      </h2>
                      <p className="mt-1 text-sm text-ink-secondary">
                        Open a library or scene control. Detailed map authoring
                        is still best on a larger screen.
                      </p>
                    </div>
                    <div className="rounded-cozy border border-brand/15 bg-surface-light p-3">
                      <WorkspaceRegion
                        region="campaign.header.tools"
                        layoutContext={layoutContext}
                      />
                    </div>
                  </div>
                </section>
              )}
            </div>

            <nav
              className="grid min-h-[62px] flex-shrink-0 border-t border-brand/20 bg-surface-light px-1 pb-[env(safe-area-inset-bottom)]"
              style={{
                gridTemplateColumns: `repeat(${userRole === "DM" ? 4 : 3}, minmax(0, 1fr))`,
              }}
              aria-label="Campaign destinations"
            >
              {MOBILE_DESTINATIONS.map(({ key, label, icon: Icon }) => {
                const active = mobileDestination === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileDestination(key)}
                    className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-cozy px-2 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                      active
                        ? "bg-surface text-brand"
                        : "text-ink-muted hover:bg-surface/70 hover:text-ink"
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {label}
                  </button>
                );
              })}
              {userRole === "DM" && (
                <button
                  type="button"
                  aria-current={
                    mobileDestination === "actions" ? "page" : undefined
                  }
                  onClick={() => setMobileDestination("actions")}
                  className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-cozy px-2 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    mobileDestination === "actions"
                      ? "bg-surface text-brand"
                      : "text-ink-muted hover:bg-surface/70 hover:text-ink"
                  }`}
                >
                  <Wrench className="h-5 w-5" aria-hidden="true" />
                  Tools
                </button>
              )}
            </nav>
          </main>
        )}

        {/* Map Manager slide-over panel (DM only) */}
        {userRole === "DM" && (
          <MapManager
            isOpen={isMapManagerOpen}
            onClose={() => setIsMapManagerOpen(false)}
          />
        )}

        {/* Token Manager slide-over panel (DM only) */}
        {userRole === "DM" && (
          <TokenManager
            isOpen={isTokenManagerOpen}
            onClose={() => setIsTokenManagerOpen(false)}
          />
        )}

        {/* Spirit Layer Controls slide-over panel (DM only) */}
        {userRole === "DM" && (
          <SpiritLayerControls
            isOpen={isSpiritLayerOpen}
            onClose={() => setIsSpiritLayerOpen(false)}
          />
        )}

        {/* Atmosphere Panel slide-over (DM only) */}
        {userRole === "DM" && (
          <AtmospherePanel
            isOpen={isAtmospherePanelOpen}
            onClose={() => setIsAtmospherePanelOpen(false)}
          />
        )}

        {/* Creature Library slide-over (DM only) */}
        {userRole === "DM" && (
          <CreatureLibrary
            isOpen={isCreatureLibraryOpen}
            onClose={() => setIsCreatureLibraryOpen(false)}
          />
        )}

        {/* Token Template Library slide-over (DM only) */}
        {userRole === "DM" && (
          <TokenTemplateLibrary
            isOpen={isTokenTemplateLibraryOpen}
            onClose={() => setIsTokenTemplateLibraryOpen(false)}
          />
        )}

        {/* NPC Quick Editor — DM only */}
        {userRole === "DM" && quickEditToken && campaign && currentMap && (
          <NpcQuickEditor
            token={quickEditToken}
            campaignId={campaign.id}
            mapId={currentMap.id}
            onClose={() => setQuickEditToken(null)}
            onTokenUpdate={(updated) => {
              setQuickEditToken(updated);
              useGameStore.getState().replaceToken(updated);
            }}
          />
        )}

        {/* Campaign Settings slide-over panel (DM only) */}
        {userRole === "DM" && (
          <CampaignSettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}

        {/* Atmosphere Player — mounts for ALL users, manages ambient audio sync */}
        <AtmospherePlayer />
      </div>
    </CampaignWorkspaceRuntimeContext.Provider>
  );
}

// ============================================
// Campaign Page (with provider wrapper)
// ============================================

export default function CampaignPage() {
  return (
    <CampaignProvider>
      <WebSocketProvider>
        <WorkspaceLayoutProvider>
          <CampaignPageContent />
        </WorkspaceLayoutProvider>
      </WebSocketProvider>
    </CampaignProvider>
  );
}
