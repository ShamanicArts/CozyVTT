// ============================================
// Map Canvas Component
// HTML Canvas-based map viewer with zoom/pan controls
// ============================================

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Grid3x3, Ghost } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  useCurrentTurnTokenId,
  useGameStore,
  useMapPeekTokenId,
  useTokenList,
} from '@/stores/gameStore';
import { useMapControls } from '@/hooks/useMapControls';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type {
  Token,
  TokenMovedEvent,
  Map as CampaignMap,
  SpiritLayerToggledBroadcast,
  SpiritLayerTokenToggledBroadcast,
  VibeUpdatedBroadcast,
  Character,
  MapPingedBroadcast,
} from '@/types';
import { TokenLayer, TokenType } from '@/types';
import type { WallSegment, FogState, WallType, LightSource } from '@/types/walls';
import {
  drawMapImage,
  drawSpiritLayer,
  drawGrid,
  drawFog,
  drawTokens,
  drawDynamicLighting,
  drawLightIcons,
  drawWalls,
  drawWallDrawOverlay,
  drawSplitPreview,
  drawEraseOverlay,
  drawBrushOverlay,
  drawPolygonOverlay,
  drawRuler,
  drawAoEOverlay,
  drawFogSelection,
  drawPings,
  PING_DURATION_MS,
  type ActivePing,
  type Viewport,
} from './map/layers';
import { createVisionCache, type VisionSource } from './map/vision';
import { fogCellsInRect, fogRectFromDrag } from './map/fogSelection';
import {
  pulsePhaseAt,
  useCanvasTicker,
  useFogRevealAnimation,
  useTokenAnimation,
} from './map/useMapAnimations';
import { playerColor } from '@/utils/playerColor';
import { useRenderLoop, type MapLayer } from './map/useRenderLoop';
import { useCanvasSurface } from './map/useCanvasSurface';
import { useMapGestureState } from './map/useMapGestureState';
import { useMapPointerHandlers } from './map/useMapPointerHandlers';
import {
  hideAllFog,
  mergeableWallEndpoint,
  mergeWallEndpoint,
  revealAllFog,
} from './map/mapToolControllers';
import { useSocketSubscriptions } from './map/useSocketSubscriptions';
import {
  createMapCanvasRendererHost,
  RENDERER_CONTRACT_VERSION,
  type MapCanvasRendererHost,
} from '@/rendering';
import { useMapRendererHost } from './MapRendererProvider';
import api from '@/services/api';
import CharacterSheetViewerModal from '@/components/character/CharacterSheetViewerModal';
import CharacterRollPicker from '@/components/campaign/CharacterRollPicker';
import NpcRollPicker from '@/components/campaign/NpcRollPicker';
import AtmosphereOverlay from '@/components/campaign/AtmosphereOverlay';
import DmFogControls, { type FogToolMode } from '@/components/campaign/DmFogControls';
import DmWallControls, { type WallToolMode } from '@/components/campaign/DmWallControls';
import DmLightControls, { type LightToolMode, type LightPlacementDefaults } from '@/components/campaign/DmLightControls';
import DmToolPanelContainer from '@/components/campaign/DmToolPanelContainer';
import MapToolbar from '@/components/campaign/MapToolbar';
import MapAoEToolPanel, { type AoEConfig } from '@/components/campaign/MapAoEToolPanel';
import { useWallHistory } from '@/hooks/useWallHistory';
import Toast, { useToast } from '@/components/Toast';
import type {
  CampaignPresentationInteractionState,
  CampaignPresentationSceneAccess,
} from '@/presentations/scene';
import '@/styles/spirit-effects.css';

/** Returns the accent color for the spirit layer style string. Used for spirit token ring. */
function getSpiritAccentColor(style: string | null | undefined): string {
  if (!style) return '#9370DB';
  if (style.startsWith('custom:')) {
    const rest = style.slice(7);
    const lastColon = rest.lastIndexOf(':');
    return lastColon !== -1 ? rest.slice(0, lastColon) : rest;
  }
  if (style === 'ethereal') return '#c8deff';
  if (style === 'shadow') return '#9b6dcc';
  if (style === 'dream') return '#d4a0f0';
  return '#9370DB'; // wispy default = spirit-purple
}

interface MapCanvasProps {
  onEditToken?: (token: Token) => void;
  sceneAccess?: CampaignPresentationSceneAccess;
  /** A per-canvas extension host; create one with `createMapCanvasRendererHost`. */
  rendererHost?: MapCanvasRendererHost;
}

export default function MapCanvas({
  onEditToken,
  sceneAccess,
  rendererHost,
}: MapCanvasProps) {
  const { currentMap, setCurrentMap, userRole, campaign, updateCampaignSpiritLayer, dmViewBothPlanes, playerSpiritVisible, setPlayerSpiritVisible, activeVibeEffect, updateVibe, activeAtmosphereEffect, characterHpCache } = useCampaign();
  // Live token state comes from the game store, not the campaign context —
  // socket handlers write there directly (outside React), and this
  // subscription is what re-renders the canvas per token change.
  const tokens = useTokenList();
  const currentTurnTokenId = useCurrentTurnTokenId();
  const peekTokenId = useMapPeekTokenId();
  const prefersReducedMotion = useReducedMotion();
  const { socket, status: socketStatus, reconnectCount } = useWebSocket();
  const socketRevision = `${socketStatus}:${reconnectCount}`;
  const { user } = useAuth();
  const isDM = userRole === 'DM';
  // Three stacked canvases share one measured surface. The top canvas receives
  // pointer input; terrain and token canvases sit beneath it.
  const {
    canvasRef,
    terrainCanvasRef,
    tokenCanvasRef,
    containerRef,
    layersRef,
    canvasSize,
  } = useCanvasSurface();
  const {
    rightPanActiveRef,
    wallEraseBrushActiveRef,
    wallErasedIdsRef,
    wallBrushActiveRef,
    wallBrushPointsRef,
    wallDragEndpointRef,
    draggingLightRef,
    hoverMapPxRef,
    lastMoveEmitRef,
    lightSourcesRef,
  } = useMapGestureState();
  // One vision-polygon cache for this map instance.
  const visionCacheRef = useRef(createVisionCache());
  // Lazily-created AudioContext for spirit layer transition sound
  const audioCtxRef = useRef<AudioContext | null>(null);

  // State
  const [showGrid, setShowGrid] = useState(true);
  const [gridColor, setGridColor] = useState<'black' | 'white'>('black');
  const [hoverCoords, setHoverCoords] = useState<{ x: number; y: number } | null>(null);
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Spirit layer image
  const [spiritLayerImage, setSpiritLayerImage] = useState<HTMLImageElement | null>(null);
  // Fade-in transition state for spirit layer toggle
  const [spiritLayerOpacity, setSpiritLayerOpacity] = useState(1);

  // Token state
  const [tokenImages, setTokenImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const [draggedToken, setDraggedToken] = useState<Token | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [hoverToken, setHoverToken] = useState<Token | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    token: Token;
    x: number;
    y: number;
  } | null>(null);

  // Door context menu state (right-click on a door segment)
  const [doorContextMenu, setDoorContextMenu] = useState<{
    door: WallSegment;
    x: number; // viewport x
    y: number; // viewport y
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isMovingTokenLayer, setIsMovingTokenLayer] = useState(false);
  const [contextMenuMoveToMapOpen, setContextMenuMoveToMapOpen] = useState(false);
  const [isMoveToMapLoading, setIsMoveToMapLoading] = useState(false);

  // Character sheet viewer state
  const [viewingCharacter, setViewingCharacter] = useState<Character | null>(null);

  // Roll picker (right-click token → Roll...)
  const [rollPicker, setRollPicker] = useState<{ characterId: string; x: number; y: number } | null>(null);
  const [npcRollPicker, setNpcRollPicker] = useState<{ tokenId: string; x: number; y: number } | null>(null);

  // DM-only: toggle whether spirit-layer tokens are drawn on canvas
  const [dmShowSpiritTokens, setDmShowSpiritTokens] = useState(true);

  // Ruler tool
  const [showRuler, setShowRuler] = useState(false);
  const [rulerOrigin, setRulerOrigin] = useState<{ x: number; y: number } | null>(null);
  const [rulerColor, setRulerColor] = useState<'amber' | 'purple' | 'black'>('amber');

  // AoE tool
  const [showAoE, setShowAoE] = useState(false);
  const [aoeConfig, setAoEConfig] = useState<AoEConfig>({ shape: 'sphere', sizeFt: 20 });
  const [aoeOrigin, setAoEOrigin] = useState<{ x: number; y: number } | null>(null);
  const [sharedInteraction, setSharedInteraction] =
    useState<CampaignPresentationInteractionState | null>(
      () => sceneAccess?.getSnapshot().interaction ?? null,
    );

  useEffect(() => {
    if (!sceneAccess) return;
    const update = () => setSharedInteraction(sceneAccess.getSnapshot().interaction);
    update();
    return sceneAccess.subscribe(update);
  }, [sceneAccess]);

  useEffect(() => {
    if (!sharedInteraction) return;
    setShowRuler(sharedInteraction.mode === 'ruler');
    setRulerOrigin(sharedInteraction.ruler.origin);
    setRulerColor(sharedInteraction.ruler.color);
    setShowAoE(sharedInteraction.mode === 'aoe');
    setAoEOrigin(sharedInteraction.aoe.origin);
    setAoEConfig({
      shape: sharedInteraction.aoe.shape,
      sizeFt: sharedInteraction.aoe.sizeFt,
      ...(sharedInteraction.aoe.widthFt === undefined
        ? {}
        : { widthFt: sharedInteraction.aoe.widthFt }),
    });
  }, [sharedInteraction]);

  // Latest-ref to the per-layer draw dispatcher — assigned right after the
  // draw callbacks are defined below. The render loop and the animation hooks
  // call the newest closure through it.
  const drawLayerRef = useRef<(layer: MapLayer) => void>(() => {});
  // The registry is created once for the map canvas lifetime. Its layers call
  // through the fresh context supplied by `drawLayer`, avoiding stale React
  // closures while allowing a host/plugin to register or swap layers at
  // runtime.
  const workspaceRendererHost = useMapRendererHost();
  const ownedRendererHostRef = useRef<MapCanvasRendererHost | null>(null);
  if (ownedRendererHostRef.current === null) {
    ownedRendererHostRef.current = createMapCanvasRendererHost();
  }
  const activeRendererHost = rendererHost ?? workspaceRendererHost ?? ownedRendererHostRef.current;
  const { markDirty } = useRenderLoop(drawLayerRef);
  // External registrations can invalidate a layer while this exact canvas is
  // mounted. A supplied host is never process-global and cannot be attached to
  // two map canvases concurrently.
  useEffect(() => activeRendererHost.attach(markDirty), [activeRendererHost, markDirty]);

  // Walls & Fog of War state — wall segments use undo/redo history hook
  const { walls: wallSegments, push: pushWallHistory, replace: replaceWallHistory, undo: undoWalls, redo: redoWalls, canUndo: canUndoWalls, canRedo: canRedoWalls } = useWallHistory([]);
  const [fogState, setFogState] = useState<FogState | null>(null);
  // Player view: list of revealed fog cell indices (derived from server fog:cells event).
  // null = fog data not received yet (show everything); Set = fog active (show only revealed cells).
  const [revealedCells, setRevealedCells] = useState<Set<number> | null>(null);
  // Fog reveal animation: per-cell opacity (1 = just revealed, 0 = fully faded in)
  const revealOpacityRef = useFogRevealAnimation(() => markDirty('terrain'), fogState, revealedCells);
  // Cache invalidation flag for the wall layer.
  const wallCacheValidRef = useRef(false);

  // Wall tool state (DM only)
  const [wallMode, setWallMode] = useState<WallToolMode>(null);
  const [wallType, setWallType] = useState<import('@/types/walls').WallType>('wall');
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [snapToEndpoint, setSnapToEndpoint] = useState(false);
  // Radius (in map-space pixels) within which a point snaps to an existing endpoint
  const ENDPOINT_SNAP_RADIUS = 16;
  const [wallInProgress, setWallInProgress] = useState<{ x: number; y: number }[]>([]); // current polyline points
  const [hoveredWallId, setHoveredWallId] = useState<string | null>(null);
  const [hoveredDoorId, setHoveredDoorId] = useState<string | null>(null); // for pointer cursor in pan mode
  const [wallColor, setWallColor] = useState('#f97316'); // default orange
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [splitHoverPoint, setSplitHoverPoint] = useState<{ x: number; y: number; wallId: string } | null>(null);
  // Polygon drawing mode state
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  /** Screen-space radius within which clicking the first polygon point closes the shape. */
  const POLYGON_CLOSE_RADIUS = 14;
  // Right-mouse button panning while a wall tool is active (left-click is reserved for tools)
  const WALL_ERASE_RADIUS = 24; // map-space pixels
  // Brush wall-painting mode state
  const [brushSize, setBrushSize] = useState(20);
  const [nearEndpoint, setNearEndpoint] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<{ x: number; y: number } | null>(null);
  const { toast, showToast, hideToast } = useToast();
  /** DM "Preview player view" toggle — when true, DM sees lighting as players do. */
  const [dmPreviewPlayerView, setDmPreviewPlayerView] = useState(false);

  // Light source state
  const [lightSources, setLightSources] = useState<LightSource[]>([]);
  useEffect(() => { lightSourcesRef.current = lightSources; }, [lightSources]);
  const [lightMode, setLightMode] = useState<LightToolMode>(null);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [lightPlacementDefaults, setLightPlacementDefaults] = useState<LightPlacementDefaults>({
    brightRadius: 4, dimRadius: 8, color: '#ffcc66',
  });
  // Drag-to-move state for lights in select mode

  // Fog rectangle selection state (DM only)
  const [fogMode, setFogMode] = useState<FogToolMode>(null);
  const fogDragAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const [fogDragCurrent, setFogDragCurrent] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Token socket handlers read/write live token state synchronously via
  // useGameStore.getState() — no stale-closure ref bookkeeping needed.

  // Always-current wall segments ref — socket handlers registered with [socket, currentMap?.id]
  // deps would otherwise close over stale wallSegments from registration time.
  const wallSegmentsRef = useRef<WallSegment[]>([]);
  useEffect(() => { wallSegmentsRef.current = wallSegments; }, [wallSegments]);

  // Cached offscreen canvas for dynamic lighting compositing.
  // Recreated only when map dimensions change; prevents ~5MB alloc per render frame.
  const lightingOffscreenRef = useRef<HTMLCanvasElement | null>(null);
  const lightCoverageOffscreenRef = useRef<HTMLCanvasElement | null>(null);

  // Raw map-pixel position from last mousemove — ghost line uses this when snap is off.
  // screenToGrid() quantises to integer grid coords, so hoverCoords can't be used for free-draw.

  // Ref to detect changes across renders without adding to dep arrays (for spirit transition)
  const prevPlayerSpiritVisibleRef = useRef(false);

  // Fade transition state when switching maps
  const [isFading, setIsFading] = useState(false);

  // Track which map we've already auto-fitted, to avoid re-fitting on window resize
  const lastFittedMapIdRef = useRef<string | null>(null);

  // Animation state for smooth token movement (rAF tween loop in the hook).
  // A tween moves tokens → repaint the tokens layer, plus the overlay when
  // dynamic lighting is on (the viewer's vision follows the moving token).
  const { animatingTokens, setAnimatingTokens } = useTokenAnimation(() => {
    markDirty('tokens');
    if (currentMap?.lightingEnabled) markDirty('overlay');
  });

  // Turn-highlight pulse. Runs only while a combatant is actually acting, and
  // not at all under reduced motion — in which case the ring is still drawn,
  // just held at mid-breath.
  useCanvasTicker(
    currentTurnTokenId !== null && !prefersReducedMotion,
    () => markDirty('tokens')
  );

  // Live map pings. Transient and map-local, so they stay component state
  // rather than going in the game store — nothing outside the canvas reads them.
  const [pings, setPings] = useState<ActivePing[]>([]);
  const visiblePings: readonly ActivePing[] = sharedInteraction
    ? sharedInteraction.pings.map((ping) => ({
        id: ping.id,
        x: ping.position.x * (currentMap?.gridSize ?? 1),
        y: ping.position.y * (currentMap?.gridSize ?? 1),
        name: ping.name,
        color: ping.color,
        startedAt: ping.startedAt,
      }))
    : pings;

  // Ping animation repaints the overlay layer (where they're drawn) and keeps
  // running under reduced motion: the rings hold still but still need to fade.
  useCanvasTicker(visiblePings.length > 0, () => markDirty('overlay'));

  // Map controls (only initialize if we have a map)
  const mapControls = useMapControls({
    gridSize: currentMap?.gridSize || 50,
    mapWidth: currentMap?.width || 20,
    mapHeight: currentMap?.height || 20,
    minZoom: 0.1, // Allow large maps to fully fit
    maxZoom: 3,
  });

  // ============================================
  // Helper Functions
  // ============================================

  /**
   * Safely check if socket is connected and can emit events
   */
  const canEmit = (): boolean => {
    return socket !== null && socket !== undefined && socket.getSocket() !== null;
  };

  /**
   * Point-to-line-segment distance (for door/wall hover hit testing).
   */
  const distToSegment = (px: number, py: number, seg: WallSegment): number => {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - seg.x1, py - seg.y1);
    const t = Math.max(0, Math.min(1, ((px - seg.x1) * dx + (py - seg.y1) * dy) / lenSq));
    return Math.hypot(px - (seg.x1 + t * dx), py - (seg.y1 + t * dy));
  };

  /**
   * Returns the closest point (and parameter t in [0,1]) on a segment to (px, py).
   */
  const closestPointOnSegment = (px: number, py: number, seg: WallSegment): { x: number; y: number; t: number } => {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return { x: seg.x1, y: seg.y1, t: 0 };
    const t = Math.max(0, Math.min(1, ((px - seg.x1) * dx + (py - seg.y1) * dy) / lenSq));
    return { x: seg.x1 + t * dx, y: seg.y1 + t * dy, t };
  };

  /**
   * Check if a point lies on any wall segment (within threshold).
   * Returns the segment and the projected point, or null.
   */
  const findWallAtPoint = (px: number, py: number, threshold: number): { seg: WallSegment; point: { x: number; y: number; t: number } } | null => {
    for (const seg of wallSegments) {
      if (seg.type !== 'wall') continue; // only snap to plain walls
      const d = distToSegment(px, py, seg);
      if (d <= threshold) {
        const cp = closestPointOnSegment(px, py, seg);
        return { seg, point: cp };
      }
    }
    return null;
  };

  /**
   * Replace a section of an existing wall with a door/window segment.
   * Given two points on the same wall, splits the wall into up to 3 pieces:
   *   wallA (original type) | newSeg (door/window) | wallB (original type)
   * If a point is near an endpoint of the wall, that stub is omitted.
   * Returns the new segments to add and the wall IDs to remove, or null if not applicable.
   */
  const buildWallReplace = (
    pt1: { x: number; y: number; t: number },
    pt2: { x: number; y: number; t: number },
    wall: WallSegment,
    newType: WallType,
  ): { remove: string[]; add: WallSegment[] } | null => {
    // Ensure t1 < t2 along the wall
    const [tA, tB] = pt1.t < pt2.t ? [pt1, pt2] : [pt2, pt1];

    const MIN_STUB = 5; // minimum stub length in px to keep (otherwise merge into door endpoint)
    const wallLen = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);

    const result: WallSegment[] = [];

    // Stub A: from wall start to door start
    const stubALen = tA.t * wallLen;
    if (stubALen >= MIN_STUB) {
      result.push({
        id: crypto.randomUUID(),
        x1: wall.x1, y1: wall.y1,
        x2: Math.round(tA.x), y2: Math.round(tA.y),
        type: wall.type,
      });
    }

    // The door/window segment itself
    result.push({
      id: crypto.randomUUID(),
      x1: Math.round(tA.x), y1: Math.round(tA.y),
      x2: Math.round(tB.x), y2: Math.round(tB.y),
      type: newType,
    });

    // Stub B: from door end to wall end
    const stubBLen = (1 - tB.t) * wallLen;
    if (stubBLen >= MIN_STUB) {
      result.push({
        id: crypto.randomUUID(),
        x1: Math.round(tB.x), y1: Math.round(tB.y),
        x2: wall.x2, y2: wall.y2,
        type: wall.type,
      });
    }

    return { remove: [wall.id], add: result };
  };

  /**
   * Snap a map-pixel coordinate to the nearest grid intersection if snapToGrid is enabled.
   */
  const snapPoint = (mapPx: { x: number; y: number }): { x: number; y: number } => {
    if (currentMap && snapToGrid) {
      const gs = currentMap.gridSize;
      return {
        x: Math.round(mapPx.x / gs) * gs,
        y: Math.round(mapPx.y / gs) * gs,
      };
    }
    if (snapToEndpoint) {
      // Find the nearest existing segment endpoint within the snap radius.
      const r = ENDPOINT_SNAP_RADIUS / mapControls.zoom;
      let bestDist = r;
      let best: { x: number; y: number } | null = null;
      for (const seg of wallSegments) {
        for (const pt of [{ x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }]) {
          const d = Math.hypot(pt.x - mapPx.x, pt.y - mapPx.y);
          if (d < bestDist) { bestDist = d; best = pt; }
        }
      }
      if (best) return best;
    }
    return mapPx;
  };

  /**
   * Apply a set of fog cells: optimistic local update plus one server op.
   *
   * A rectangle drag produces exactly one call here, which is why the old
   * pending-cells buffer and its 80ms flush interval are gone — those existed
   * only to batch the continuous stream a brush stroke produced.
   */
  const applyFogCells = useCallback((cells: number[]) => {
    if (!currentMap || !fogMode || cells.length === 0) return;

    const reveal = fogMode === 'fog-reveal';
    const operation = { op: reveal ? 'reveal' : 'hide', cells } as const;

    setFogState((prev) => {
      if (!prev) return prev;
      const revealed = [...prev.revealed];
      for (const idx of cells) {
        if (idx >= 0 && idx < revealed.length) revealed[idx] = reveal;
      }
      return { ...prev, revealed };
    });

    socket?.getSocket()?.emit('fog:operation', { mapId: currentMap.id, operation });
  }, [currentMap, fogMode, socket]);

  /** Finish a fog drag: compute the snapped rectangle once and apply it. */
  const commitFogDrag = useCallback((endX: number, endY: number) => {
    const anchor = fogDragAnchorRef.current;
    fogDragAnchorRef.current = null;
    setFogDragCurrent(null);
    if (!anchor || !fogState) return;

    const rect = fogRectFromDrag(fogState, anchor.x, anchor.y, endX, endY);
    if (!rect) return; // Entirely off the map
    applyFogCells(fogCellsInRect(fogState, rect));
  }, [fogState, applyFogCells]);

  /** Abandon a drag without changing anything (Escape, right-click, map change). */
  const cancelFogDrag = useCallback(() => {
    fogDragAnchorRef.current = null;
    setFogDragCurrent(null);
  }, []);

  // Helper: change a door's type and broadcast. Uses wallSegmentsRef to avoid stale closure
  // (changeDoorType is memoised with [currentMap, socket, replaceWallHistory] deps).
  const changeDoorType = useCallback((door: WallSegment, newType: WallType) => {
    if (!currentMap) return;
    const updated = { ...door, type: newType };
    replaceWallHistory(wallSegmentsRef.current.map(s => s.id === door.id ? updated : s));
    wallCacheValidRef.current = false;
    socket?.getSocket()?.emit('wall:update', { mapId: currentMap.id, segment: updated });
    setDoorContextMenu(null);
  }, [currentMap, socket, replaceWallHistory]);

  // Player's own token on the current map — used as ruler origin for non-DM users
  const myToken = useMemo(() => {
    if (isDM || !tokens || !user) return null;
    return tokens.find((t) => t.controlledBy === user.id) ?? null;
  }, [tokens, user, isDM]);

  // Effective ruler origin: players use their token position, DM uses clicked point
  const effectiveRulerOrigin = isDM ? rulerOrigin : (myToken ? myToken.position : null);

  const handleToggleRuler = useCallback(() => {
    if (sceneAccess) {
      const active = sceneAccess.getSnapshot().interaction.mode === 'ruler';
      sceneAccess.setInteractionMode(active ? 'none' : 'ruler');
      if (active) sceneAccess.setRulerOrigin(null);
      else sceneAccess.setRulerOrigin(rulerOrigin);
      return;
    }
    setShowRuler((prev) => {
      if (prev) {
        setRulerOrigin(null);
      } else {
        setShowAoE(false);
        setAoEOrigin(null);
      }
      return !prev;
    });
  }, [rulerOrigin, sceneAccess]);

  const updateRulerOrigin = useCallback((origin: { x: number; y: number } | null) => {
    if (sceneAccess) sceneAccess.setRulerOrigin(origin);
    else setRulerOrigin(origin);
  }, [sceneAccess]);

  const updateAoEOrigin = useCallback((origin: { x: number; y: number } | null) => {
    if (sceneAccess) sceneAccess.setAoE({ origin });
    else setAoEOrigin(origin);
  }, [sceneAccess]);

  const disableRuler = useCallback(() => {
    if (sceneAccess) sceneAccess.setInteractionMode('none');
    else setShowRuler(false);
  }, [sceneAccess]);

  /**
   * Play a brief ethereal audio cue when the spirit layer is toggled.
   * Uses Web Audio API to synthesise a ghostly tone — no external file required.
   *
   * entering=true  → rising tone  (crossing into the spirit realm)
   * entering=false → falling tone (returning to the material plane)
   */
  const playEtherealTransition = useCallback((entering: boolean) => {
    try {
      // Create AudioContext lazily so it survives browser autoplay restrictions
      // (the toggle always happens after a user gesture, so the context can start)
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      // Two slightly-detuned triangle oscillators produce a gentle ethereal "beating" wobble
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc1.type = 'triangle';
      osc2.type = 'triangle';

      // Lowpass filter softens the tone so it feels distant / ghostly
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.Q.value = 0.8;

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(filter);
      filter.connect(ctx.destination);

      const now = ctx.currentTime;
      const lo = 196;  // G3
      const hi = 392;  // G4 (one octave up)

      if (entering) {
        // Crossing into spirit realm — ascending, ethereal
        osc1.frequency.setValueAtTime(lo,      now);
        osc1.frequency.linearRampToValueAtTime(hi, now + 1.2);
        osc2.frequency.setValueAtTime(lo + 1,  now);   // 1 Hz detune → slow wobble
        osc2.frequency.linearRampToValueAtTime(hi + 1, now + 1.2);
      } else {
        // Returning to material plane — descending, fading
        osc1.frequency.setValueAtTime(hi,      now);
        osc1.frequency.linearRampToValueAtTime(lo, now + 1.2);
        osc2.frequency.setValueAtTime(hi + 1,  now);
        osc2.frequency.linearRampToValueAtTime(lo + 1, now + 1.2);
      }

      // Gentle fade-in → sustain → fade-out envelope (kept quiet — ambient, not jarring)
      gain.gain.setValueAtTime(0,    now);
      gain.gain.linearRampToValueAtTime(0.07, now + 0.5);
      gain.gain.setValueAtTime(0.07, now + 1.0);
      gain.gain.linearRampToValueAtTime(0,    now + 1.8);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.8);
      osc2.stop(now + 1.8);
    } catch {
      // Audio not available — silently degrade
    }
  }, []);

  // ============================================
  // Map Image Loading
  // ============================================

  /**
   * Load map image when currentMap changes
   */
  useEffect(() => {
    if (!currentMap?.imageUrl) {
      setMapImage(null);
      setImageLoaded(false);
      setImageError(null);
      return;
    }

    setImageLoaded(false);
    setImageError(null);

    const img = new Image();
    img.crossOrigin = 'anonymous'; // For CORS support

    img.onload = () => {
      setMapImage(img);
      setImageLoaded(true);
      setImageError(null);
    };

    img.onerror = () => {
      setImageError('Failed to load map image');
      setImageLoaded(false);
      setMapImage(null);
    };

    // Use the imageUrl directly - backend now returns full paths
    img.src = currentMap.imageUrl;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [currentMap?.imageUrl]);

  // ============================================
  // Spirit Layer Image Loading
  // ============================================

  useEffect(() => {
    if (!currentMap?.spiritLayerUrl) {
      setSpiritLayerImage(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => setSpiritLayerImage(img);
    img.onerror = () => setSpiritLayerImage(null);
    img.src = currentMap.spiritLayerUrl;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [currentMap?.spiritLayerUrl]);

  // ============================================
  // Auto-Fit: Center and fit map when a new map image finishes loading
  // ============================================

  useEffect(() => {
    // Only fit when image is ready, canvas is measured, and we haven't already fitted this map
    if (!imageLoaded || canvasSize.width === 0 || canvasSize.height === 0 || !currentMap?.id) return;
    if (lastFittedMapIdRef.current === currentMap.id) return;

    mapControls.fitToScreen(canvasSize.width, canvasSize.height);
    lastFittedMapIdRef.current = currentMap.id;
  }, [
    imageLoaded,
    currentMap?.id,
    canvasSize.width,
    canvasSize.height,
    mapControls.fitToScreen,
  ]);

  // ============================================
  // Token Image Loading
  // ============================================

  /**
   * Load token images when tokens change
   */
  useEffect(() => {
    console.log('[MapCanvas] Tokens changed:', tokens.length, 'tokens');

    const loadTokenImages = async () => {
      const newTokenImages = new Map<string, HTMLImageElement>();

      for (const token of tokens) {
        console.log('[MapCanvas] Processing token:', token.name, 'imageUrl:', token.imageUrl);
        if (!token.imageUrl) continue;

        // Reuse the cached element only when it was loaded from the SAME url.
        // Keying on token id alone meant a token whose image was changed kept
        // rendering the old picture until the page was reloaded — for every
        // client, since they all cache the same way.
        // getAttribute('src') returns the literal value set below, not the
        // resolved absolute URL the .src property would give.
        const cached = tokenImages.get(token.id);
        if (cached && cached.getAttribute('src') === token.imageUrl) {
          newTokenImages.set(token.id, cached);
          continue;
        }

        // Load new image
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise<void>((resolve) => {
          img.onload = () => {
            console.log('[MapCanvas] ✅ Token image loaded:', token.name);
            newTokenImages.set(token.id, img);
            resolve();
          };
          img.onerror = (error) => {
            console.error(`[MapCanvas] ❌ Failed to load token image for ${token.name}:`, error);
            console.error(`[MapCanvas] Image URL was:`, img.src);
            resolve(); // Don't block on errors
          };
          // Use imageUrl directly - backend now returns full paths
          console.log('[MapCanvas] Loading token image from:', token.imageUrl);
          img.src = token.imageUrl;
        });
      }

      setTokenImages(newTokenImages);
    };

    loadTokenImages();
  }, [tokens]);

  // ============================================
  // WebSocket Event Listeners
  // ============================================

  /**
   * Listen for token.moved events from other clients
   */
  useSocketSubscriptions(socket, useMemo(() => {
    const handleTokenMoved = (event: TokenMovedEvent) => {
      // Read from the store (not a render closure) so rapid events that arrive
      // in the same macro-task all see the most recently mutated state.
      const store = useGameStore.getState();
      const token = store.tokens[event.tokenId];
      if (!token) return;

      // Start animation from current position to new position
      setAnimatingTokens((prev) => {
        const newMap = new Map(prev);
        newMap.set(event.tokenId, {
          fromX: token.position.x,
          fromY: token.position.y,
          toX: event.x,
          toY: event.y,
          startTime: Date.now(),
          duration: 200,
        });
        return newMap;
      });

      // Store writes are synchronous — subsequent handlers in the same
      // macro-task (e.g. token:appeared for NPCs) see the correct state.
      store.applyTokenMove(event.tokenId, { x: event.x, y: event.y });
    };

    return [{ event: 'token.moved', handler: handleTokenMoved }];
  }, [socket]), socketRevision); // handler reads/writes via the store, no reactive deps needed

  // ============================================
  // Map Change
  // Fade transition when currentMap changes +
  // WebSocket listener for remote map switches
  // ============================================

  // Trigger fade-out → fade-in when the active map changes.
  // Sync the prev-spirit ref so transition detection stays accurate.
  // playerSpiritVisible itself is set by loadCampaign (REST) or handleMapChanged (WS).
  useEffect(() => {
    setIsFading(true);
    prevPlayerSpiritVisibleRef.current = playerSpiritVisible;
    const t = setTimeout(() => setIsFading(false), 300);
    return () => clearTimeout(t);
  }, [currentMap?.id]);  

  // Listen for map.changed events broadcast by the DM
  useSocketSubscriptions(socket, useMemo(() => {
    const handleMapChanged = ({ mapData, spiritVisible: sv }: { mapId: string; mapData: CampaignMap; spiritVisible?: boolean }) => {
      setCurrentMap(mapData);
      useGameStore.getState().setTokens(mapData.tokens || []);

      // For non-DMs: track whether this player is personally in the spirit realm.
      // Play the ethereal audio cue if they are crossing in or out.
      if (userRole !== 'DM' && sv !== undefined) {
        const prev = prevPlayerSpiritVisibleRef.current;
        if (sv !== prev) {
          prevPlayerSpiritVisibleRef.current = sv;
          setPlayerSpiritVisible(sv);
          // Only play for individual crossings that aren't covered by the global toggle handler
          // (global toggle already plays via handleSpiritLayerToggled)
          if (!(campaign?.spiritLayerEnabled)) {
            playEtherealTransition(sv);
          }
        }
      }
    };

    return [{ event: 'map.changed', handler: handleMapChanged }];
  }, [
    socket,
    setCurrentMap,
    userRole,
    campaign?.spiritLayerEnabled,
    setPlayerSpiritVisible,
    playEtherealTransition,
  ]), socketRevision);

  // ============================================
  // Spirit Layer WebSocket Listeners
  // ============================================

  useSocketSubscriptions(socket, useMemo(() => {
    const handleSpiritLayerToggled = (data: SpiritLayerToggledBroadcast) => {
      // Play ethereal audio cue — ascending when entering, descending when leaving
      playEtherealTransition(data.visible);
      // Fade spirit layer in/out over 0.5 s then restore
      setSpiritLayerOpacity(0);
      setTimeout(() => {
        updateCampaignSpiritLayer(data.visible);
        setSpiritLayerOpacity(1);
      }, 500);
    };

    const handleSpiritTokenToggled = (data: SpiritLayerTokenToggledBroadcast) => {
      // Update the token's visible flag in the live token store
      useGameStore.getState().patchToken(data.tokenId, { visible: data.visible });
    };

    const handleSpiritStyleChanged = (data: { style: string }) => {
      // Update campaign.spiritLayerStyle for all clients in real time
      updateCampaignSpiritLayer(campaign?.spiritLayerEnabled ?? false, data.style);
    };

    return [
      { event: 'spirit_layer.toggled', handler: handleSpiritLayerToggled },
      { event: 'spirit_layer.token.toggled', handler: handleSpiritTokenToggled },
      { event: 'spirit_layer.style_changed', handler: handleSpiritStyleChanged },
    ];
  }, [socket, updateCampaignSpiritLayer, campaign?.spiritLayerEnabled, playEtherealTransition]), socketRevision);

  // ============================================
  // Vibe Tracker WebSocket Listener
  // ============================================

  useSocketSubscriptions(socket, useMemo(() => {
    const handleVibeUpdated = (data: VibeUpdatedBroadcast) => {
      updateVibe(data.period, data.hue, data.filter);
    };
    return [{ event: 'vibe.updated', handler: handleVibeUpdated }];
  }, [socket, updateVibe]), socketRevision);

  // ============================================
  // Load Walls & Fog on Map Change
  // ============================================
  useEffect(() => {
    if (!currentMap) {
      replaceWallHistory([]);
      setFogState(null);
      setRevealedCells(null);
      return;
    }

    // Load wall segments and light sources from the map response (included in GET /maps/:id)
    replaceWallHistory((currentMap.wallSegments as WallSegment[] | undefined) ?? []);
    setLightSources((currentMap.lights as LightSource[] | undefined) ?? []);

    // DMs: request full fog state; players: request revealed cells
    const socketInstance = socket?.getSocket();
    if (socketInstance) {
      socketInstance.emit('fog:request_state', { mapId: currentMap.id });
      socketInstance.emit('walls:request', { mapId: currentMap.id });
      socketInstance.emit('lights:request', { mapId: currentMap.id });
    }

    // Invalidate wall cache and offscreen lighting canvas when map changes
    wallCacheValidRef.current = false;
    lightingOffscreenRef.current = null;
    lightCoverageOffscreenRef.current = null;
  }, [currentMap?.id, socketRevision]);

  // ============================================
  // Wall & Fog WebSocket Listeners
  // ============================================
  useEffect(() => {
    if (!socket) return;
    const socketInstance = socket.getSocket();
    if (!socketInstance) return;

    const handleWallAdded = (data: { mapId: string; segment: WallSegment }) => {
      // DM already applied the change optimistically before emitting; skip the echo to
      // avoid reverting local state with stale data from the closed-over wallSegments.
      if (isDM) return;
      if (!currentMap || data.mapId !== currentMap.id) return;
      replaceWallHistory([...wallSegmentsRef.current, data.segment]);
      wallCacheValidRef.current = false;
    };

    const handleWallRemoved = (data: { mapId: string; segmentId: string }) => {
      if (isDM) return;
      if (!currentMap || data.mapId !== currentMap.id) return;
      replaceWallHistory(wallSegmentsRef.current.filter((s) => s.id !== data.segmentId));
      wallCacheValidRef.current = false;
    };

    const handleWallUpdated = (data: { mapId: string; segment: WallSegment }) => {
      if (isDM) return;
      if (!currentMap || data.mapId !== currentMap.id) return;
      replaceWallHistory(wallSegmentsRef.current.map((s) => s.id === data.segment.id ? data.segment : s));
      wallCacheValidRef.current = false;
    };

    const handleWallsReplaced = (data: { mapId: string; segments: WallSegment[] }) => {
      // DM's local undo/redo stack is already correct; echoing walls:replaced causes
      // a redundant re-render and can race with rapid pushes.
      if (isDM) return;
      if (!currentMap || data.mapId !== currentMap.id) return;
      // Full canonical list from server — safe to use directly (no stale-closure risk)
      replaceWallHistory(data.segments);
      wallCacheValidRef.current = false;
    };

    const handleFogUpdated = (data: { mapId: string; fogState: FogState }) => {
      if (!currentMap || data.mapId !== currentMap.id) return;
      // Track newly-revealed cells for fade animation
      setFogState((prev) => {
        if (prev) {
          data.fogState.revealed.forEach((revealed, i) => {
            if (revealed && !prev.revealed[i]) {
              revealOpacityRef.current.set(i, 1.0); // Start fade animation
            }
          });
        }
        return data.fogState;
      });
    };

    const handleFogCells = (data: { mapId: string; revealedCells: number[] }) => {
      if (!currentMap || data.mapId !== currentMap.id) return;
      setRevealedCells((prev) => {
        const newSet = new Set<number>(data.revealedCells);
        // Animate newly revealed cells
        newSet.forEach((idx) => {
          if (!prev?.has(idx)) revealOpacityRef.current.set(idx, 1.0);
        });
        return newSet;
      });
    };

    const handleDmEditing = (_data: { mapId: string }) => {
      // Could show a transient indicator — handled by toolbar; canvas ignores for now
    };

    // Dynamic lighting: token entered this player's view (or moved while
    // visible). Store writes are synchronous, so if token:appeared fires for
    // multiple tokens in the same macro-task (server re-sync after player
    // move), each call builds on the previous result.
    const handleTokenAppeared = (data: { token: Token; mapId: string }) => {
      if (!currentMap || data.mapId !== currentMap.id) return;
      useGameStore.getState().revealToken(data.token);
    };

    // Dynamic lighting: token left this player's view
    const handleTokenDisappeared = (data: { tokenId: string; mapId: string }) => {
      if (!currentMap || data.mapId !== currentMap.id) return;
      useGameStore.getState().removeToken(data.tokenId);
    };

    // Dynamic lighting toggle broadcast from DM
    const handleLightingUpdated = (data: { mapId: string; lightingEnabled: boolean }) => {
      if (!currentMap || data.mapId !== currentMap.id) return;
      if (sceneAccess) return;
      setCurrentMap({ ...currentMap, lightingEnabled: data.lightingEnabled });
    };

    socketInstance.on('token:appeared', handleTokenAppeared);
    socketInstance.on('token:disappeared', handleTokenDisappeared);
    socketInstance.on('map:lighting:updated', handleLightingUpdated);

    // Light source events
    const handleLightAdded = (data: { mapId: string; light: LightSource }) => {
      if (isDM) return; // DM applied optimistically
      if (!currentMap || data.mapId !== currentMap.id) return;
      setLightSources((prev) => [...prev, data.light]);
    };
    const handleLightRemoved = (data: { mapId: string; lightId: string }) => {
      if (isDM) return;
      if (!currentMap || data.mapId !== currentMap.id) return;
      setLightSources((prev) => prev.filter((l) => l.id !== data.lightId));
    };
    const handleLightUpdated = (data: { mapId: string; light: LightSource }) => {
      if (isDM) return;
      if (!currentMap || data.mapId !== currentMap.id) return;
      setLightSources((prev) => prev.map((l) => l.id === data.light.id ? data.light : l));
    };
    const handleLightsReplaced = (data: { mapId: string; lights: LightSource[] }) => {
      if (!currentMap || data.mapId !== currentMap.id) return;
      setLightSources(data.lights);
    };

    socketInstance.on('wall:added', handleWallAdded);
    socketInstance.on('wall:removed', handleWallRemoved);
    socketInstance.on('wall:updated', handleWallUpdated);
    socketInstance.on('walls:replaced', handleWallsReplaced);
    socketInstance.on('fog:updated', handleFogUpdated);
    socketInstance.on('fog:cells', handleFogCells);
    socketInstance.on('dm:editing', handleDmEditing);
    socketInstance.on('light:added', handleLightAdded);
    socketInstance.on('light:removed', handleLightRemoved);
    socketInstance.on('light:updated', handleLightUpdated);
    socketInstance.on('lights:replaced', handleLightsReplaced);

    return () => {
      socketInstance.off('token:appeared', handleTokenAppeared);
      socketInstance.off('token:disappeared', handleTokenDisappeared);
      socketInstance.off('map:lighting:updated', handleLightingUpdated);
      socketInstance.off('wall:added', handleWallAdded);
      socketInstance.off('wall:removed', handleWallRemoved);
      socketInstance.off('wall:updated', handleWallUpdated);
      socketInstance.off('walls:replaced', handleWallsReplaced);
      socketInstance.off('fog:updated', handleFogUpdated);
      socketInstance.off('fog:cells', handleFogCells);
      socketInstance.off('dm:editing', handleDmEditing);
      socketInstance.off('light:added', handleLightAdded);
      socketInstance.off('light:removed', handleLightRemoved);
      socketInstance.off('light:updated', handleLightUpdated);
      socketInstance.off('lights:replaced', handleLightsReplaced);
    };
  }, [socket, currentMap, socketRevision, isDM, sceneAccess, setCurrentMap]);

  const resolvePingerName = useCallback(
    (userId: string): string => {
      if (userId === user?.id) return user.displayName ?? "You";
      return (
        campaign?.memberships?.find((membership) => membership.userId === userId)
          ?.user?.displayName ?? ""
      );
    },
    [campaign?.memberships, user?.displayName, user?.id],
  );

  useEffect(() => {
    const socketInstance = socket?.getSocket();
    if (!socketInstance) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const handlePinged = (data: MapPingedBroadcast) => {
      if (!currentMap || data.mapId !== currentMap.id) return;
      const id = `${data.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setPings((previous) => [
        ...previous.slice(-19),
        {
          id,
          x: data.x,
          y: data.y,
          name: resolvePingerName(data.userId),
          color: playerColor(data.userId),
          startedAt: Date.now(),
        },
      ]);
      timers.push(
        setTimeout(() => {
          setPings((previous) => previous.filter((ping) => ping.id !== id));
        }, PING_DURATION_MS),
      );
    };
    socketInstance.on("map.pinged", handlePinged);
    return () => {
      socketInstance.off("map.pinged", handlePinged);
      timers.forEach(clearTimeout);
    };
  }, [currentMap, resolvePingerName, socket]);

  useEffect(() => setPings([]), [currentMap?.id]);

  // ============================================
  // Keyboard: Escape, Ctrl+Z (undo), Ctrl+Y / Ctrl+Shift+Z (redo)
  // ============================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fogDragAnchorRef.current) {
          cancelFogDrag();
          return;
        }
        // Polygon mode: clear in-progress polygon first
        if (polygonPoints.length > 0) {
          setPolygonPoints([]);
          return;
        }
        if (wallInProgress.length > 0) {
          setWallInProgress([]);
        } else if (wallMode) {
          setWallMode(null);
        } else if (lightMode) {
          setLightMode(null);
          setSelectedLightId(null);
        }
        return;
      }

      // Only handle undo/redo for DM with active map
      if (!isDM || !currentMap) return;

      const isCtrl = e.ctrlKey || e.metaKey;
      if (isCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        // Polygon mode: Ctrl+Z removes last placed point (not a server undo)
        if (polygonPoints.length > 0) {
          setPolygonPoints((prev) => prev.slice(0, -1));
          return;
        }
        if (wallInProgress.length > 0) {
          // Cancel in-progress wall drawing first
          setWallInProgress([]);
          return;
        }
        const prev = undoWalls();
        if (prev !== null) {
          wallCacheValidRef.current = false;
          const socketInstance = socket?.getSocket();
          if (socketInstance) {
            socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: prev });
          }
        }
      } else if (isCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const next = redoWalls();
        if (next !== null) {
          wallCacheValidRef.current = false;
          const socketInstance = socket?.getSocket();
          if (socketInstance) {
            socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: next });
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [wallMode, wallInProgress, polygonPoints, isDM, currentMap, undoWalls, redoWalls, socket, cancelFogDrag]);

  // ============================================
  // Close Polygon — commits all polygon edges as one wall history entry
  // ============================================
  const closePolygon = useCallback(() => {
    if (polygonPoints.length < 3 || !currentMap) {
      setPolygonPoints([]);
      return;
    }
    const newSegs: WallSegment[] = [];
    for (let i = 0; i < polygonPoints.length; i++) {
      const a = polygonPoints[i];
      const b = polygonPoints[(i + 1) % polygonPoints.length];
      newSegs.push({
        id: crypto.randomUUID(),
        x1: a.x, y1: a.y,
        x2: b.x, y2: b.y,
        type: wallType,
      });
    }
    const next = [...wallSegments, ...newSegs];
    pushWallHistory(next);
    wallCacheValidRef.current = false;
    setPolygonPoints([]);
    // Save to server
    const socketInstance = socket?.getSocket();
    if (socketInstance) {
      socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: next });
    }
  }, [polygonPoints, wallSegments, wallType, pushWallHistory, currentMap, socket]);

  // ============================================
  // Clear polygon when leaving polygon mode
  // ============================================
  useEffect(() => {
    if (wallMode !== 'wall-polygon') {
      setPolygonPoints([]);
    }
  }, [wallMode]);

  // Leaving fog mode, or switching maps, drops any drag in progress.
  useEffect(() => {
    cancelFogDrag();
  }, [fogMode, currentMap?.id, cancelFogDrag]);

  // ============================================
  // Canvas Rendering
  // ============================================

  /**
   * Draw the TERRAIN layer (bottom canvas): map image, grid, manual fog,
   * spirit imagery. Static during a token drag. The three layers stack
   * terrain → tokens → overlay, which reproduces the old single-canvas draw
   * order exactly (fog under spirit/tokens, darkness over tokens, overlays
   * on top) — do not change the split without a screenshot comparison.
   */
  const drawTerrain = useCallback(() => {
    const canvas = terrainCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If no map, show empty state
    if (!currentMap || !imageLoaded || !mapImage) {
      ctx.fillStyle = '#8b7d6b'; // stone-gray
      ctx.font = '16px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No map loaded', canvas.width / 2, canvas.height / 2);
      return;
    }

    ctx.save();
    ctx.translate(mapControls.panOffset.x, mapControls.panOffset.y);
    ctx.scale(mapControls.zoom, mapControls.zoom);

    const viewport: Viewport = {
      zoom: mapControls.zoom,
      panOffset: mapControls.panOffset,
      gridSize: currentMap.gridSize,
      mapWidth: currentMap.width,
      mapHeight: currentMap.height,
    };

    const renderIsDM = userRole === 'DM';
    // isInSpiritRealm is true if the campaign-wide toggle is on OR this
    // specific non-DM player has personally crossed into the spirit realm.
    const spiritActive = campaign?.spiritLayerEnabled ?? false;
    const isInSpiritRealm = spiritActive || (userRole !== 'DM' && playerSpiritVisible);

    // 1. Map image (Material Plane)
    drawMapImage(ctx, {
      mapImage,
      spiritActive,
      isDM: renderIsDM,
      dmViewBothPlanes,
    }, viewport);

    // 2. Grid overlay
    if (showGrid) {
      drawGrid(ctx, { gridColor }, viewport);
    }

    // 3. Manual fog of war (rendered before spirit layer and tokens so they
    //    appear above fog)
    drawFog(ctx, {
      isDM: renderIsDM,
      fogState,
      revealedCells,
      revealOpacity: revealOpacityRef.current,
    }, viewport);

    // 4. Spirit layer image (the Ethereal Plane)
    if (spiritLayerImage) {
      drawSpiritLayer(ctx, {
        spiritLayerImage,
        spiritLayerOpacity,
        spiritActive,
        isInSpiritRealm,
        isDM: renderIsDM,
        dmViewBothPlanes,
      }, viewport);
    }

    ctx.restore();
  }, [currentMap, imageLoaded, mapImage, mapControls.panOffset, mapControls.zoom, userRole, campaign?.spiritLayerEnabled, playerSpiritVisible, dmViewBothPlanes, showGrid, gridColor, fogState, revealedCells, spiritLayerImage, spiritLayerOpacity]);

  /**
   * Draw the TOKENS layer (middle canvas): every token + the drag ghost.
   * The hot path — repaints each frame of a token drag. No raycasting here.
   */
  const drawTokensLayer = useCallback(() => {
    const canvas = tokenCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!currentMap || !imageLoaded || !mapImage) return;

    ctx.save();
    ctx.translate(mapControls.panOffset.x, mapControls.panOffset.y);
    ctx.scale(mapControls.zoom, mapControls.zoom);

    const viewport: Viewport = {
      zoom: mapControls.zoom,
      panOffset: mapControls.panOffset,
      gridSize: currentMap.gridSize,
      mapWidth: currentMap.width,
      mapHeight: currentMap.height,
    };

    const renderIsDM = userRole === 'DM';
    // Ownership predicate — fog exemption
    const isOwnToken = (t: Token): boolean =>
      t.controlledBy === user?.id ||
      !!(t.characterId && campaign?.characters?.find((c) => c.id === t.characterId && c.userId === user?.id));

    // 5. Tokens (+ drag ghost)
    drawTokens(ctx, {
      tokens,
      tokenImages,
      animatingTokens,
      now: Date.now(),
      draggedToken,
      dragOffset,
      hoverCoords,
      hoverTokenId: hoverToken?.id ?? null,
      revealedCells,
      isDM: renderIsDM,
      dmShowSpiritTokens,
      dmViewBothPlanes,
      spiritAccentColor: getSpiritAccentColor(campaign?.spiritLayerStyle),
      characterHpCache,
      isOwnToken,
      currentTurnTokenId,
      // Held at mid-breath under reduced motion, where no pulse loop runs.
      pulsePhase: prefersReducedMotion ? 0.5 : pulsePhaseAt(Date.now()),
      peekTokenId,
    }, viewport);

    ctx.restore();
  }, [currentMap, imageLoaded, mapImage, mapControls.panOffset, mapControls.zoom, userRole, user?.id, campaign?.characters, campaign?.spiritLayerStyle, tokens, tokenImages, animatingTokens, draggedToken, dragOffset, hoverCoords, hoverToken, revealedCells, dmShowSpiritTokens, dmViewBothPlanes, characterHpCache, currentTurnTokenId, prefersReducedMotion, peekTokenId]);

  /**
   * Draw the OVERLAY layer (top canvas): dynamic-lighting darkness, DM light
   * icons, walls, DM tool previews, ruler/AoE, fog brush cursor. This is also
   * the pointer-input surface. Memoized vision raycasting lives here.
   */
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!currentMap || !imageLoaded || !mapImage) return;

    ctx.save();
    ctx.translate(mapControls.panOffset.x, mapControls.panOffset.y);
    ctx.scale(mapControls.zoom, mapControls.zoom);

    const viewport: Viewport = {
      zoom: mapControls.zoom,
      panOffset: mapControls.panOffset,
      gridSize: currentMap.gridSize,
      mapWidth: currentMap.width,
      mapHeight: currentMap.height,
    };

    const renderIsDM = userRole === 'DM';
    // Ownership predicate — lighting vision sources
    const isOwnToken = (t: Token): boolean =>
      t.controlledBy === user?.id ||
      !!(t.characterId && campaign?.characters?.find((c) => c.id === t.characterId && c.userId === user?.id));

    // 6. Dynamic lighting — raycast visibility darkness over tokens.
    //    DM always sees all; "Preview player view" simulates player vision.
    //    The vision polygons also feed the walls layer's door LOS filter.
    const lightingEnabled = currentMap.lightingEnabled ?? false;
    let visPolygons: VisionSource[] = [];
    if (lightingEnabled) {
      const renderAsPlayer = !renderIsDM || dmPreviewPlayerView;
      if (renderAsPlayer) {
        const myTokens = tokens.filter((t) => {
          if (renderIsDM && dmPreviewPlayerView) return true; // DM preview: use all tokens
          return isOwnToken(t);
        });
        const enabledLights = lightSources.filter((l) => l.enabled);
        // Memoized: only sources whose position/radius changed —
        // or all sources when a wall was edited — actually recompute.
        const vision = visionCacheRef.current.compute(myTokens, enabledLights, wallSegments, viewport);
        visPolygons = vision.all;
        drawDynamicLighting(ctx, {
          myTokens,
          enabledLights,
          tokenVision: vision.tokenVision,
          lightVision: vision.lightVision,
          lightingCanvas: lightingOffscreenRef,
          coverageCanvas: lightCoverageOffscreenRef,
        }, viewport);
      }
      // DM (not in preview) sees everything — skip fog entirely
    }

    // 7. DM light source icons (visible in player preview too, so DM can edit)
    if (renderIsDM) {
      drawLightIcons(ctx, {
        lights: lightSources,
        selectedLightId,
        lightMode,
      }, viewport);
    }

    // 8. Wall segments — DM sees all (+ endpoint nodes while a wall tool is
    //    active); players see doors (LOS-filtered under dynamic lighting)
    drawWalls(ctx, {
      wallSegments,
      isDM: renderIsDM,
      wallColor,
      hoveredWallId,
      selectedWallId,
      hoveredDoorId,
      showEndpoints: wallMode !== null,
      dragEndpoint: wallDragEndpointRef.current?.point ?? null,
      selectedEndpoint,
      lightingEnabled,
      visPolygons,
    }, viewport);

    // 9. DM wall-tool overlays
    if (renderIsDM && wallMode === 'wall-draw' && wallInProgress.length > 0) {
      drawWallDrawOverlay(ctx, {
        wallInProgress,
        hoverMapPx: hoverMapPxRef.current,
        hoverCoords,
        wallType,
        snapPoint,
        findWallAtPoint,
      }, viewport);
    }
    if (renderIsDM && wallMode === 'wall-split' && splitHoverPoint) {
      drawSplitPreview(ctx, splitHoverPoint, viewport);
    }
    if (renderIsDM && wallMode === 'wall-erase') {
      drawEraseOverlay(ctx, {
        hoverMapPx: hoverMapPxRef.current,
        eraseRadius: WALL_ERASE_RADIUS,
        erasedIds: wallErasedIdsRef.current,
        wallSegments,
      }, viewport);
    }
    if (renderIsDM && wallMode === 'wall-brush') {
      drawBrushOverlay(ctx, {
        points: wallBrushPointsRef.current,
        brushSize,
        hoverMapPx: hoverMapPxRef.current,
      }, viewport);
    }
    if (renderIsDM && wallMode === 'wall-polygon' && polygonPoints.length > 0) {
      drawPolygonOverlay(ctx, {
        points: polygonPoints,
        hoverMapPx: hoverMapPxRef.current,
        closeRadius: POLYGON_CLOSE_RADIUS,
        snapPoint,
      }, viewport);
    }

    // 10. Measurement overlays
    if (showRuler && effectiveRulerOrigin && hoverCoords) {
      drawRuler(ctx, {
        origin: effectiveRulerOrigin,
        target: hoverCoords,
        color: rulerColor,
        feetPerSquare: currentMap.feetPerSquare ?? 5,
        diagonalRule: (currentMap.diagonalRule ?? 'flat') as 'flat' | 'alternating',
      }, viewport);
    }
    if (showAoE) {
      drawAoEOverlay(ctx, {
        config: aoeConfig,
        origin: aoeOrigin,
        hoverCoords,
        hoverMapPx: hoverMapPxRef.current,
        feetPerSquare: currentMap.feetPerSquare ?? 5,
      }, viewport);
    }

    // 11. Fog selection box — world space, so the snapped rectangle stays
    //     locked to the grid through pan and zoom.
    if (fogMode && isDM && fogState) {
      drawFogSelection(ctx, {
        mode: fogMode,
        fog: fogState,
        anchor: fogDragAnchorRef.current,
        cursor: fogDragCurrent,
      }, viewport);
    }

    // 12. Map pings — drawn last in world space, above the lighting darkness
    //     so a ping into an unlit corner is still visible. (The turn ring
    //     makes the opposite trade on purpose: it lives on the token layer
    //     so a hidden token's ring stays hidden.)
    if (visiblePings.length > 0) {
      drawPings(ctx, { pings: visiblePings, now: Date.now(), reducedMotion: prefersReducedMotion }, viewport);
    }

    // Restore context state (back to screen-space)
    ctx.restore();
  }, [currentMap, imageLoaded, mapImage, mapControls.zoom, mapControls.panOffset, userRole, user?.id, campaign?.characters, tokens, dmPreviewPlayerView, lightSources, selectedLightId, lightMode, wallSegments, wallColor, hoveredWallId, selectedWallId, hoveredDoorId, wallMode, selectedEndpoint, wallInProgress, wallType, snapToGrid, brushSize, splitHoverPoint, polygonPoints, showRuler, rulerColor, effectiveRulerOrigin, showAoE, aoeConfig, aoeOrigin, hoverCoords, fogMode, isDM, fogState, fogDragCurrent, visiblePings, prefersReducedMotion]);

  // ── Layer draw dispatch + dirty-flag scheduling ──────────
  // A single rAF coalesces every repaint request; only the dirty layers
  // redraw, at most once each per frame. Replaces the old
  // `useEffect(() => render())` + ~25 imperative `render()` calls.
  const drawLayer = useCallback((layer: MapLayer) => {
    const canvas = layer === 'terrain'
      ? terrainCanvasRef.current
      : layer === 'tokens'
        ? tokenCanvasRef.current
        : canvasRef.current;
    const context = canvas?.getContext('2d') ?? null;
    const viewport: Viewport | null = currentMap ? {
      zoom: mapControls.zoom,
      panOffset: mapControls.panOffset,
      gridSize: currentMap.gridSize,
      mapWidth: currentMap.width,
      mapHeight: currentMap.height,
    } : null;

    activeRendererHost.render(layer, {
      contractVersion: RENDERER_CONTRACT_VERSION,
      surface: layer,
      canvas,
      context,
      map: currentMap,
      viewport,
      isDM: userRole === 'DM',
      withWorldTransform: (draw) => {
        if (!context || !viewport) return;
        context.save();
        context.translate(mapControls.panOffset.x, mapControls.panOffset.y);
        context.scale(mapControls.zoom, mapControls.zoom);
        try {
          draw();
        } finally {
          context.restore();
        }
      },
      drawTerrain,
      drawTokens: drawTokensLayer,
      drawOverlay,
    });
  }, [activeRendererHost, currentMap, drawTerrain, drawTokensLayer, drawOverlay, mapControls.panOffset, mapControls.zoom, userRole]);
  drawLayerRef.current = drawLayer;

  // Structural changes (world transform, canvas size, map identity) repaint
  // every layer.
  useEffect(() => {
    markDirty('terrain', 'tokens', 'overlay');
  }, [markDirty, mapControls.zoom, mapControls.panOffset, canvasSize, currentMap, imageLoaded, mapImage]);

  // Terrain-only content.
  useEffect(() => {
    markDirty('terrain');
  }, [markDirty, showGrid, gridColor, fogState, revealedCells, spiritLayerImage, spiritLayerOpacity]);

  // Spirit flags affect the base/spirit images (terrain) and spirit-token
  // alpha (tokens).
  useEffect(() => {
    markDirty('terrain', 'tokens');
  }, [markDirty, campaign?.spiritLayerEnabled, campaign?.spiritLayerStyle, playerSpiritVisible, dmViewBothPlanes]);

  // Token visuals — the hot path. Under dynamic lighting a token move also
  // shifts the viewer's vision, so repaint the overlay (darkness) too.
  useEffect(() => {
    markDirty('tokens');
    if (currentMap?.lightingEnabled) markDirty('overlay');
  }, [markDirty, tokens, tokenImages, animatingTokens, hoverToken, characterHpCache, dmShowSpiritTokens, currentMap?.lightingEnabled, currentTurnTokenId, peekTokenId]);

  // Publish this map's own token hover so the initiative tracker can tint the
  // matching row — the other half of the cross-highlight.
  useEffect(() => {
    useGameStore.getState().setPeekToken(hoverToken?.id ?? null, 'map');
  }, [hoverToken]);

  // Cursor position drives the token drag ghost (tokens) and, only when a
  // cursor-tracking overlay tool is active, its preview (overlay). Gating the
  // overlay keeps it static during a plain token drag — the win of layering.
  useEffect(() => {
    markDirty('tokens');
    if (wallMode || showRuler || showAoE || fogMode) markDirty('overlay');
  }, [markDirty, hoverCoords, draggedToken, dragOffset, wallMode, showRuler, showAoE, fogMode]);

  // Overlay content — walls, lights, DM tools, measurement, pings, fog cursor.
  useEffect(() => {
    markDirty('overlay');
  }, [markDirty, wallSegments, wallMode, wallInProgress, hoveredWallId, selectedWallId, hoveredDoorId, splitHoverPoint, selectedEndpoint, wallType, snapToGrid, brushSize, lightSources, selectedLightId, lightMode, dmPreviewPlayerView, showRuler, rulerOrigin, rulerColor, effectiveRulerOrigin, showAoE, aoeConfig, aoeOrigin, fogMode, fogDragCurrent, fogState, pings]);

  // ============================================
  // Token Hit Testing
  // ============================================

  /**
   * Check if a grid coordinate is within a token's bounds
   */
  const getTokenAtPosition = useCallback(
    (gridX: number, gridY: number): Token | null => {
      if (!currentMap) return null;

      // Check tokens in reverse order (top to bottom in z-order)
      for (let i = tokens.length - 1; i >= 0; i--) {
        const token = tokens[i];
        if (!token.visible) continue;

        const tokenX = token.position.x;
        const tokenY = token.position.y;
        const tokenWidth = token.size.width;
        const tokenHeight = token.size.height;

        // Check if click is within token bounds
        if (
          gridX >= tokenX &&
          gridX < tokenX + tokenWidth &&
          gridY >= tokenY &&
          gridY < tokenY + tokenHeight
        ) {
          return token;
        }
      }

      return null;
    },
    [tokens, currentMap]
  );

  /**
   * Check if user can move a token (DM or owner only)
   */
  const canMoveToken = useCallback(
    (token: Token): boolean => {
      if (!campaign) return false;

      // DM can move any token (even when paused/inactive)
      if (userRole === 'DM') return true;

      // Players cannot move tokens when session is paused or inactive
      if (campaign.status === 'PAUSED' || campaign.status === 'INACTIVE') {
        return false;
      }

      // Player can move tokens they are assigned as controller (NPC tokens with controlledBy)
      if (token.controlledBy && token.controlledBy === user?.id) {
        return true;
      }

      // Player can only move their own character's token
      if (token.characterId) {
        // Find the character associated with this token
        const character = campaign.characters?.find((c) => c.id === token.characterId);
        if (character) {
          // Check if current user owns this character
          return character.userId === user?.id;
        }
      }

      return false;
    },
    [campaign, userRole, user?.id]
  );

  /** Drag-from-roster: keep HTML drop integration outside the canvas pointer state machine. */
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!campaign?.id || !currentMap || userRole !== 'DM' || !canvasRef.current) return;
    let dragData: { type?: string; characterId?: string; name?: string; imageUrl?: string; userId?: string };
    try { dragData = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    if (dragData.type !== 'character-token' || !dragData.imageUrl) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const gridCoords = mapControls.screenToGrid({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    const position = { x: Math.max(0, Math.min(Math.floor(gridCoords.x), currentMap.width - 1)), y: Math.max(0, Math.min(Math.floor(gridCoords.y), currentMap.height - 1)) };
    const layer = !dmViewBothPlanes && (campaign.spiritLayerEnabled ?? false) ? TokenLayer.SPIRIT : TokenLayer.TOKEN;
    try {
      const result = await api.addToken(campaign.id, currentMap.id, { characterId: dragData.characterId ?? null, name: dragData.name ?? 'Token', imageUrl: dragData.imageUrl, position, size: { width: 1, height: 1 }, layer, visible: true, controlledBy: dragData.userId ?? null, type: TokenType.PLAYER });
      useGameStore.getState().addToken(result.token);
      socket?.emitMapChange(currentMap.id);
    } catch (err) { console.error('[MapCanvas] Failed to place token from roster drag:', err); }
  };

  // ============================================
  // Pointer input adapter
  // ============================================
  const { handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave, handleContextMenu } = useMapPointerHandlers({
    canvasRef, currentMap, isDM, wallMode, fogMode, lightMode, wallType, wallSegments, wallInProgress, polygonPoints, lightSources, lightPlacementDefaults, fogState, draggedToken, dragOffset, hoveredDoorId, showRuler, showAoE, snapToGrid, mapImage, mapControls, socket, canEmit, canMoveToken, getTokenAtPosition, snapPoint, findWallAtPoint, buildWallReplace, distToSegment, closestPointOnSegment, closePolygon, pushWallHistory, replaceWallHistory, markDirty, showToast,
    interactionMode: sharedInteraction?.mode ?? 'none',
    ping: (point) => sceneAccess?.ping(point),
    beginFogDrag: (point) => {
      fogDragAnchorRef.current = point;
      setFogDragCurrent(point);
    },
    updateFogDrag: setFogDragCurrent,
    commitFogDrag: () => {
      const end = fogDragCurrent ?? fogDragAnchorRef.current;
      if (end) commitFogDrag(end.x, end.y);
    },
    cancelFogDrag,
    setWallInProgress, setPolygonPoints, setSelectedWallId, setSelectedEndpoint, setNearEndpoint, setHoveredWallId, setSplitHoverPoint, setLightSources, setSelectedLightId, setHoveredDoorId, setHoverCoords, setHoverToken, setDraggedToken, setDragOffset, setContextMenu, setDoorContextMenu,
    rightPanActiveRef, wallEraseBrushActiveRef, wallErasedIdsRef, wallBrushActiveRef, wallBrushPointsRef, wallDragEndpointRef, draggingLightRef, hoverMapPxRef, lastMoveEmitRef, lightSourcesRef, wallCacheValidRef, polygonCloseRadius: POLYGON_CLOSE_RADIUS, wallEraseRadius: WALL_ERASE_RADIUS,
    applyTokenMove: (tokenId, position) => useGameStore.getState().applyTokenMove(tokenId, position),
    selectToken: (tokenId) => sceneAccess?.selectToken(tokenId),
    setRulerOrigin: updateRulerOrigin,
    setAoEOrigin: updateAoEOrigin,
    setShowRuler: disableRuler,
  });

  /**
   * Handle mouse wheel (zoom)
   */
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      mapControls.handleWheel(e, rect);
    },
    [mapControls]
  );

  /**
   * Attach wheel event listener
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  /**
   * Close context menu when clicking elsewhere
   */
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setContextMenuMoveToMapOpen(false);
    };
    if (!contextMenu) return;
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  // Close door context menu on any left-click outside it
  useEffect(() => {
    if (!doorContextMenu) return;
    const handleClick = () => setDoorContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [doorContextMenu]);

  // After context menu renders, adjust position so it doesn't overflow the viewport
  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      setContextMenuPos(null);
      return;
    }
    const rect = contextMenuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const adjustedX = contextMenu.x + rect.width > vw ? Math.max(0, contextMenu.x - rect.width) : contextMenu.x;
    const adjustedY = contextMenu.y + rect.height > vh ? Math.max(0, contextMenu.y - rect.height) : contextMenu.y;
    setContextMenuPos({ x: adjustedX, y: adjustedY });
  }, [contextMenu]);

  // (Token tween + fog reveal rAF loops live in ./map/useMapAnimations)

  // ============================================
  // Render
  // ============================================

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-parchment"
      style={{ opacity: isFading ? 0 : 1, transition: 'opacity 0.3s ease' }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Three stacked canvases. The vibe CSS filter is applied to
          the wrapper so it tints the composite of all three, matching the old
          single-canvas behaviour. The wrapper is also the CSS-transform target
          for pan gestures. Only the top canvas takes input. */}
      <div
        ref={layersRef}
        className="absolute inset-0"
        style={{
          filter: activeVibeEffect?.filter ?? undefined,
          transition: 'filter 3s ease',
        }}
      >
        <canvas
          ref={terrainCanvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="absolute inset-0 pointer-events-none"
        />
        <canvas
          ref={tokenCanvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="absolute inset-0 pointer-events-none"
        />
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className={`absolute inset-0 ${
            draggedToken ? 'cursor-grabbing' :
            wallMode === 'wall-draw' ? 'cursor-crosshair' :
            wallMode === 'wall-polygon' ? 'cursor-crosshair' :
            wallMode === 'wall-split' ? (splitHoverPoint ? 'cursor-pointer' : 'cursor-crosshair') :
            wallMode === 'wall-erase' ? 'cursor-cell' :
            wallMode === 'wall-brush' ? 'cursor-crosshair' :
            wallMode === 'wall-select' ? (wallDragEndpointRef.current ? 'cursor-grabbing' : nearEndpoint ? 'cursor-grab' : hoveredWallId ? 'cursor-pointer' : 'cursor-default') :
            lightMode === 'light-place' ? 'cursor-crosshair' :
            lightMode === 'light-select' ? (draggingLightRef.current ? 'cursor-grabbing' : 'cursor-pointer') :
            (hoverToken || hoveredDoorId) ? 'cursor-pointer' :
            'cursor-move'
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onContextMenu={handleContextMenu}
        />
      </div>

      {/* Vibe hue tint overlay — color tint layered on top of canvas */}
      {activeVibeEffect && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: activeVibeEffect.hue,
            opacity: 0.12,
            mixBlendMode: 'multiply',
            transition: 'background-color 3s ease, opacity 3s ease',
          }}
        />
      )}

      {/* Atmosphere particle overlay */}
      <AtmosphereOverlay effect={activeAtmosphereEffect} />

      {/* Spirit Layer CSS overlay — atmospheric effect of the Ethereal Plane */}
      {currentMap?.spiritLayerUrl && spiritLayerImage && (
        (() => {
          const isDM = userRole === 'DM';
          const spiritActive = campaign?.spiritLayerEnabled ?? false;
          // Non-DM players are in spirit realm if globally enabled OR their personal token is there
          const playerEffectivelyInSpirit = spiritActive || playerSpiritVisible;
          // Show overlay only when spirit realm is actually visible to this viewer
          if (!isDM && !playerEffectivelyInSpirit) return null;
          // DM in single-plane material view: no overlay (they're not perceiving the spirit realm)
          if (isDM && !dmViewBothPlanes && !spiritActive) return null;

          const rawStyle = campaign?.spiritLayerStyle ?? 'wispy';
          let overlayClass = 'spirit-overlay-wispy';
          let inlineStyle: React.CSSProperties = {};

          if (rawStyle === 'ethereal') overlayClass = 'spirit-overlay-ethereal';
          else if (rawStyle === 'shadow') overlayClass = 'spirit-overlay-shadow';
          else if (rawStyle === 'dream') overlayClass = 'spirit-overlay-dream';
          else if (rawStyle.startsWith('custom:')) {
            // Format: "custom:#hexcolor:effectId" (effectId optional, legacy = wispy)
            const rest = rawStyle.slice(7);
            const lastColon = rest.lastIndexOf(':');
            const customColor  = lastColon !== -1 ? rest.slice(0, lastColon) : rest;
            const customEffect = lastColon !== -1 ? rest.slice(lastColon + 1) : 'wispy';
            const validEffects = ['wispy', 'ethereal', 'shadow', 'dream'];
            const effectClass  = validEffects.includes(customEffect) ? customEffect : 'wispy';
            // Apply the chosen effect class for its animations + ::before/::after particles/shimmer.
            // The inline background overrides the named class's base colour with the custom hue.
            overlayClass = `spirit-overlay-${effectClass}`;
            inlineStyle = {
              background: `${customColor}44`, // custom hue at ~27% alpha as base tint
            };
          }

          // When DM views spirit realm that's hidden from most players, reduce overlay intensity
          // Full opacity when fully active (global toggle or personal crossover)
          const overlayOpacity = (!isDM && !spiritActive && playerSpiritVisible)
            ? 1.0   // player's own token is in spirit realm — full immersion
            : (!spiritActive ? 0.4 : 1.0); // DM hint view vs full view

          return (
            <>
              <div
                className={`spirit-layer-overlay ${overlayClass}`}
                style={{
                  opacity: spiritLayerOpacity * overlayOpacity,
                  transition: 'opacity 0.5s ease',
                  ...inlineStyle,
                }}
              />
              {/* DM-only indicator: red dashed border shows spirit realm is hidden from players */}
              {/* Only shown in dual-plane mode where the ghost overlay is visible */}
              {isDM && !spiritActive && dmViewBothPlanes && (
                <div className="spirit-layer-hidden-indicator" title="Spirit realm hidden from players" />
              )}
            </>
          );
        })()
      )}

      {/* Spirit Realm indicator — shown to players when in spirit realm (global or personal) */}
      {userRole !== 'DM' && ((campaign?.spiritLayerEnabled ?? false) || playerSpiritVisible) && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-cozy bg-spirit-purple/20 border border-spirit-purple/40 backdrop-blur-sm animate-pulse-soft">
          <Ghost className="w-3.5 h-3.5 text-spirit-purple" />
          <span className="text-xs font-semibold text-spirit-purple">Spirit Realm</span>
        </div>
      )}

      <MapToolbar
        controls={mapControls}
        canvasSize={canvasSize}
        hasMap={Boolean(currentMap)}
        isDM={isDM}
        showGrid={showGrid}
        gridColor={gridColor}
        onToggleGrid={() => setShowGrid((previous) => !previous)}
        onToggleGridColor={() => setGridColor((previous) => previous === 'black' ? 'white' : 'black')}
        showRuler={showRuler}
        rulerColor={rulerColor}
        onToggleRuler={handleToggleRuler}
        onCycleRulerColor={() => {
          const color = rulerColor === 'amber' ? 'purple' : rulerColor === 'purple' ? 'black' : 'amber';
          if (sceneAccess) sceneAccess.setRulerColor(color);
          else setRulerColor(color);
        }}
        showAoE={showAoE}
        onToggleAoE={() => {
          if (sceneAccess) {
            const active = sceneAccess.getSnapshot().interaction.mode === 'aoe';
            sceneAccess.setInteractionMode(active ? 'none' : 'aoe');
            if (active) sceneAccess.setAoE({ origin: null });
            return;
          }
          setShowAoE((previous) => {
          if (!previous) {
            setShowRuler(false);
            setRulerOrigin(null);
          } else {
            setAoEOrigin(null);
          }
          return !previous;
          });
        }}
        showSpiritTokens={dmShowSpiritTokens}
        onToggleSpiritTokens={() => setDmShowSpiritTokens((previous) => !previous)}
      />

      {/* DM Tool Panels — draggable container with stacked panels */}
      {userRole === 'DM' && currentMap && (
        <DmToolPanelContainer containerRef={containerRef}>
          <DmFogControls
            fogMode={fogMode}
            onFogModeChange={(mode) => {
              setFogMode(mode);
              // Deactivate wall/light tools when switching to fog tool
              if (mode) {
                setWallMode(null);
                setLightMode(null);
                setSelectedLightId(null);
                setSelectedWallId(null);
              }
            }}
            onRevealAll={() => {
              const socketInstance = socket?.getSocket();
              if (socketInstance && currentMap) {
                socketInstance.emit('fog:operation', { mapId: currentMap.id, operation: { op: 'reveal_all' } });
              }
              setFogState(revealAllFog);
            }}
            onHideAll={() => {
              const socketInstance = socket?.getSocket();
              if (socketInstance && currentMap) {
                socketInstance.emit('fog:operation', { mapId: currentMap.id, operation: { op: 'hide_all' } });
              }
              setFogState(hideAllFog);
            }}
          />
          <DmWallControls
            wallMode={wallMode}
            onWallModeChange={(mode) => {
              setWallMode(mode);
              if (mode !== 'wall-select') { setSelectedWallId(null); setSelectedEndpoint(null); wallDragEndpointRef.current = null; setNearEndpoint(false); }
              if (mode !== 'wall-split') setSplitHoverPoint(null);
              if (mode !== 'wall-erase') { wallEraseBrushActiveRef.current = false; wallErasedIdsRef.current = new Set(); }
              if (mode !== 'wall-brush') { wallBrushActiveRef.current = false; wallBrushPointsRef.current = []; }
              if (mode !== 'wall-polygon') setPolygonPoints([]);
              // Deactivate fog/light tools when switching to wall tool
              if (mode) { setFogMode(null); setLightMode(null); setSelectedLightId(null); }
            }}
            onCollapse={() => {
              setWallMode(null);
              setSelectedWallId(null);
              setSelectedEndpoint(null);
              wallDragEndpointRef.current = null;
              setNearEndpoint(false);
              setSplitHoverPoint(null);
              wallEraseBrushActiveRef.current = false;
              wallErasedIdsRef.current = new Set();
              wallBrushActiveRef.current = false;
              wallBrushPointsRef.current = [];
              setWallInProgress([]);
              setPolygonPoints([]);
            }}
            wallType={wallType}
            onWallTypeChange={setWallType}
            snapToGrid={snapToGrid}
            onSnapToGridChange={(v) => { setSnapToGrid(v); if (v) setSnapToEndpoint(false); }}
            snapToEndpoint={snapToEndpoint}
            onSnapToEndpointChange={setSnapToEndpoint}
            wallCount={wallSegments.length}
            onClearAll={() => {
              const socketInstance = socket?.getSocket();
              if (socketInstance && currentMap) {
                socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: [] });
              }
              pushWallHistory([]);
            }}
            canUndo={canUndoWalls}
            canRedo={canRedoWalls}
            onUndo={() => {
              const prev = undoWalls();
              if (prev !== null) {
                wallCacheValidRef.current = false;
                const socketInstance = socket?.getSocket();
                if (socketInstance && currentMap) {
                  socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: prev });
                }
              }
            }}
            onRedo={() => {
              const next = redoWalls();
              if (next !== null) {
                wallCacheValidRef.current = false;
                const socketInstance = socket?.getSocket();
                if (socketInstance && currentMap) {
                  socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: next });
                }
              }
            }}
            wallColor={wallColor}
            onWallColorChange={setWallColor}
            selectedSegmentType={selectedWallId ? wallSegments.find((s) => s.id === selectedWallId)?.type ?? null : null}
            onSelectedTypeChange={(newType) => {
              if (!selectedWallId || !currentMap) return;
              const updated = wallSegments.map((s) => s.id === selectedWallId ? { ...s, type: newType } : s);
              pushWallHistory(updated);
              wallCacheValidRef.current = false;
              const socketInstance = socket?.getSocket();
              if (socketInstance) {
                const seg = updated.find((s) => s.id === selectedWallId);
                if (seg) socketInstance.emit('wall:update', { mapId: currentMap.id, segment: seg });
              }
            }}
            onDeleteSelected={() => {
              if (!selectedWallId || !currentMap) return;
              const newSegs = wallSegments.filter((s) => s.id !== selectedWallId);
              pushWallHistory(newSegs);
              wallCacheValidRef.current = false;
              const socketInstance = socket?.getSocket();
              if (socketInstance) {
                socketInstance.emit('wall:remove', { mapId: currentMap.id, segmentId: selectedWallId });
              }
              setSelectedWallId(null);
            }}
            selectedEndpoint={wallMode === 'wall-select'
              ? mergeableWallEndpoint(selectedEndpoint, wallSegments)
              : null}
            onMergeEndpoint={() => {
              if (!selectedEndpoint || !currentMap) return;
              const newSegs = mergeWallEndpoint(selectedEndpoint, wallSegments, () => crypto.randomUUID());
              if (!newSegs) return;
              pushWallHistory(newSegs);
              wallCacheValidRef.current = false;
              const socketInstance = socket?.getSocket();
              if (socketInstance) {
                socketInstance.emit('walls:replace', { mapId: currentMap.id, segments: newSegs });
              }
              setSelectedEndpoint(null);
            }}
            brushSize={brushSize}
            onBrushSizeChange={setBrushSize}
          />
          <DmLightControls
            lightMode={lightMode}
            onLightModeChange={(mode) => {
              setLightMode(mode);
              if (mode !== 'light-select') setSelectedLightId(null);
              // Deactivate wall/fog tools when switching to light tool
              if (mode) { setWallMode(null); setFogMode(null); }
            }}
            onCollapse={() => {
              setLightMode(null);
              setSelectedLightId(null);
            }}
            lightCount={lightSources.length}
            onClearAll={() => {
              setLightSources([]);
              setSelectedLightId(null);
              const socketInstance = socket?.getSocket();
              if (socketInstance && currentMap) {
                socketInstance.emit('lights:replace', { mapId: currentMap.id, lights: [] });
              }
            }}
            selectedLight={selectedLightId ? lightSources.find((l) => l.id === selectedLightId) ?? null : null}
            onSelectedLightChange={(updated) => {
              setLightSources((prev) => prev.map((l) => l.id === updated.id ? updated : l));
              const socketInstance = socket?.getSocket();
              if (socketInstance && currentMap) {
                socketInstance.emit('light:update', { mapId: currentMap.id, light: updated });
              }
            }}
            onDeleteSelected={() => {
              if (!selectedLightId || !currentMap) return;
              setLightSources((prev) => prev.filter((l) => l.id !== selectedLightId));
              const socketInstance = socket?.getSocket();
              if (socketInstance) {
                socketInstance.emit('light:remove', { mapId: currentMap.id, lightId: selectedLightId });
              }
              setSelectedLightId(null);
            }}
            lightingEnabled={currentMap.lightingEnabled ?? false}
            placementDefaults={lightPlacementDefaults}
            onDefaultsChange={setLightPlacementDefaults}
          />
        </DmToolPanelContainer>
      )}

      {/* DM Preview Player View — shown when dynamic lighting is enabled */}
      {userRole === 'DM' && currentMap?.lightingEnabled && (
        <div className="absolute bottom-20 right-2 z-30">
          <button
            onClick={() => setDmPreviewPlayerView((prev) => !prev)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors border ${
              dmPreviewPlayerView
                ? 'bg-info/30 text-info-ink border-info/50'
                // ink/paper invert together, so this stays a legible contrast
                // chip over the map on both light and dark themes
                : 'bg-ink/85 text-paper border-ink/40 hover:bg-ink'
            }`}
            title={dmPreviewPlayerView ? 'Back to DM view (see all)' : 'Preview how players see this map with dynamic lighting'}
            aria-label="Toggle DM player view preview"
          >
            {dmPreviewPlayerView ? '👁 DM View' : '🎭 Preview Player View'}
          </button>
        </div>
      )}

      {/* Ruler hint for players with no token */}
      {showRuler && !isDM && !myToken && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-black/60 text-warm-amber text-xs px-3 py-1.5 rounded-full pointer-events-none">
          Place your character token on the map to use the ruler
        </div>
      )}

      <MapAoEToolPanel
        visible={showAoE && Boolean(currentMap)}
        config={aoeConfig}
        origin={aoeOrigin}
        onConfigChange={(update) => {
          const config = update(aoeConfig);
          if (sceneAccess) sceneAccess.setAoE(config);
          else setAoEConfig(config);
        }}
        onClearOrigin={() => updateAoEOrigin(null)}
      />

      {/* Hover Coordinates */}
      {hoverCoords && !hoverToken && (
        <div className="absolute bottom-4 left-4 glass-panel px-3 py-1.5 bg-parchment/90 backdrop-blur-sm">
          <span className="text-xs text-stone-gray font-mono font-semibold">
            ({hoverCoords.x}, {hoverCoords.y})
          </span>
        </div>
      )}

      {/* Hover Token Name */}
      {hoverToken && hoverCoords && (
        <div className="absolute bottom-4 left-4 glass-panel px-3 py-1.5 bg-parchment/90 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs text-brand-ink font-semibold">
              {hoverToken.name}
            </span>
            <span className="text-xs text-stone-gray font-mono">
              ({hoverCoords.x}, {hoverCoords.y})
            </span>
          </div>
          {!canMoveToken(hoverToken) && (
            <span className="text-[10px] text-warm-gray">
              (Locked)
            </span>
          )}
        </div>
      )}

      {/* Image Loading State */}
      {currentMap && !imageLoaded && !imageError && (
        <div className="absolute inset-0 flex items-center justify-center bg-parchment/80">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-moss-green/30 border-t-moss-green rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-stone-gray">Loading map...</p>
          </div>
        </div>
      )}

      {/* Image Error State */}
      {imageError && (
        <div className="absolute inset-0 flex items-center justify-center bg-parchment/80">
          <div className="glass-panel p-4 text-center">
            <p className="text-sm text-danger-ink mb-2">{imageError}</p>
            <p className="text-xs text-stone-gray">Check map image URL</p>
          </div>
        </div>
      )}

      {/* No Map State */}
      {!currentMap && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <Grid3x3 className="w-12 h-12 text-brand-ink/30 mx-auto mb-3" />
            <p className="text-sm text-warm-gray mb-2">No map loaded</p>
            <p className="text-xs text-stone-gray/70">
              Upload a map to get started
            </p>
          </div>
        </div>
      )}

      {/* Token Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 glass-panel bg-parchment/95 backdrop-blur-sm border border-moss-green/20 shadow-lg py-1 min-w-[160px]"
          style={{
            left: `${contextMenuPos ? contextMenuPos.x : contextMenu.x}px`,
            top: `${contextMenuPos ? contextMenuPos.y : contextMenu.y}px`,
            visibility: contextMenuPos ? 'visible' : 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.token.characterId && (
            <>
              <button
                className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                onClick={async () => {
                  const characterId = contextMenu.token.characterId!;
                  setContextMenu(null);
                  try {
                    const { character } = await api.getCharacter(characterId);
                    setViewingCharacter(character);
                  } catch (err) {
                    console.error('Failed to load character sheet:', err);
                  }
                }}
              >
                View Character Sheet
              </button>
              <button
                className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                onClick={() => {
                  const { characterId, x, y } = { characterId: contextMenu.token.characterId!, x: contextMenu.x, y: contextMenu.y };
                  setContextMenu(null);
                  setRollPicker({ characterId, x, y });
                }}
              >
                Roll...
              </button>
            </>
          )}

          {userRole === 'DM' && (() => {
            const cmToken = contextMenu.token;
            const cmType = cmToken.type ?? (cmToken.characterId ? TokenType.PLAYER : TokenType.NPC);
            const isObject = cmType === TokenType.OBJECT;
            const isNpcOrObject = cmType === TokenType.NPC || cmType === TokenType.OBJECT;
            return (
            <>
              {/* Roll... — NPC tokens only (player tokens have their own Roll above) */}
              {cmType === TokenType.NPC && (
                <button
                  className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                  onClick={() => {
                    const tokenId = cmToken.id;
                    const x = contextMenu.x;
                    const y = contextMenu.y;
                    setContextMenu(null);
                    setNpcRollPicker({ tokenId, x, y });
                  }}
                >
                  Roll...
                </button>
              )}

              {/* Edit Token — NPC and Object tokens */}
              {isNpcOrObject && (
                <button
                  className="w-full px-4 py-2 text-left text-sm text-brand-ink font-medium hover:bg-moss-green/10 transition-colors"
                  onClick={() => {
                    setContextMenu(null);
                    onEditToken?.(cmToken);
                  }}
                >
                  Edit Token
                </button>
              )}

              {/* Add to Initiative — DM only */}
              {currentMap && (
                <button
                  className="w-full px-4 py-2 text-left text-sm text-warm-amber hover:bg-warm-amber/10 transition-colors"
                  onClick={() => {
                    const token = contextMenu.token;
                    setContextMenu(null);
                    socket?.emitInitiativeAdd({ tokenId: token.id, mapId: currentMap.id });
                  }}
                >
                  Add to Initiative
                </button>
              )}

              {/* Duplicate Token — all types, DM only */}
              <button
                className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                onClick={async () => {
                  if (!campaign?.id || !currentMap?.id) return;
                  const token = contextMenu.token;
                  setContextMenu(null);
                  try {
                    // Place copy 1 cell offset, clamped to map bounds
                    const newX = Math.min(token.position.x + 1, currentMap.width - token.size.width);
                    const newY = Math.min(token.position.y + 1, currentMap.height - token.size.height);
                    // Reset HP to full for the copy
                    const freshHp = token.hp ? { current: token.hp.max, max: token.hp.max, temp: 0 } : null;
                    const result = await api.addToken(campaign.id, currentMap.id, {
                      name: token.name,
                      imageUrl: token.imageUrl,
                      position: { x: newX, y: newY },
                      size: token.size,
                      layer: token.layer,
                      visible: token.visible,
                      controlledBy: token.controlledBy,
                      type: token.type,
                      disposition: token.disposition,
                      hp: freshHp,
                      showHpBar: token.showHpBar,
                      notes: token.notes,
                      initiative: token.initiative,
                      conditions: [],
                    });
                    useGameStore.getState().addToken(result.token);
                    socket?.emitMapChange(currentMap.id);
                  } catch (err) {
                    console.error('Failed to duplicate token:', err);
                  }
                }}
              >
                Duplicate Token
              </button>

              {/* Save as Template — DM only */}
              <button
                className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                onClick={async () => {
                  if (!campaign?.id) return;
                  const token = contextMenu.token;
                  setContextMenu(null);
                  try {
                    await api.saveTokenAsTemplate(campaign.id, {
                      name: token.name,
                      imageUrl: token.imageUrl || null,
                      type: token.type,
                      disposition: token.disposition,
                      displayMode: token.displayMode || 'pog',
                      size: token.size,
                      notes: token.notes || null,
                      hp: token.hp || null,
                      showHpBar: token.showHpBar,
                      statBlock: token.statBlock || null,
                      sightRadius: token.sightRadius ?? null,
                    });
                  } catch (err) {
                    console.error('Failed to save token as template:', err);
                  }
                }}
              >
                Save as Template
              </button>

              {/* Visibility toggle — Object tokens: Reveal/Hide */}
              {isObject && (
                <button
                  className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10 transition-colors"
                  onClick={async () => {
                    if (!campaign?.id || !currentMap?.id) return;
                    const token = contextMenu.token;
                    setContextMenu(null);
                    try {
                      await api.updateToken(campaign.id, currentMap.id, token.id, { visible: !token.visible });
                      useGameStore.getState().patchToken(token.id, { visible: !token.visible });
                      socket?.emitMapChange(currentMap.id);
                    } catch (err) {
                      console.error('Failed to toggle object visibility:', err);
                    }
                  }}
                >
                  {cmToken.visible ? 'Hide from Players' : 'Reveal to Players'}
                </button>
              )}

              {/* Spirit Realm toggle — Player and NPC tokens only (not Objects) */}
              {!isObject && (
                contextMenu.token.layer === TokenLayer.TOKEN ? (
                  <button
                    disabled={isMovingTokenLayer}
                    className="w-full px-4 py-2 text-left text-sm text-spirit-purple hover:bg-spirit-purple/10 transition-colors disabled:opacity-50"
                    onClick={async () => {
                      if (!campaign?.id || !currentMap?.id) return;
                      setIsMovingTokenLayer(true);
                      const token = contextMenu.token;
                      setContextMenu(null);
                      try {
                        await api.updateToken(campaign.id, currentMap.id, token.id, { layer: TokenLayer.SPIRIT });
                        useGameStore.getState().patchToken(token.id, { layer: TokenLayer.SPIRIT });
                        socket?.emitMapChange(currentMap.id);
                      } catch (err) {
                        console.error('Failed to move token to spirit realm:', err);
                      } finally {
                        setIsMovingTokenLayer(false);
                      }
                    }}
                  >
                    {isMovingTokenLayer ? 'Moving…' : 'Send to Spirit Realm'}
                  </button>
                ) : (
                  <button
                    disabled={isMovingTokenLayer}
                    className="w-full px-4 py-2 text-left text-sm text-brand-ink hover:bg-moss-green/10 transition-colors disabled:opacity-50"
                    onClick={async () => {
                      if (!campaign?.id || !currentMap?.id) return;
                      setIsMovingTokenLayer(true);
                      const token = contextMenu.token;
                      setContextMenu(null);
                      try {
                        await api.updateToken(campaign.id, currentMap.id, token.id, { layer: TokenLayer.TOKEN });
                        useGameStore.getState().patchToken(token.id, { layer: TokenLayer.TOKEN });
                        socket?.emitMapChange(currentMap.id);
                      } catch (err) {
                        console.error('Failed to return token to material plane:', err);
                      } finally {
                        setIsMovingTokenLayer(false);
                      }
                    }}
                  >
                    {isMovingTokenLayer ? 'Moving…' : 'Return to Material Plane'}
                  </button>
                )
              )}

              <div className="h-px bg-moss-green/20 my-1" />

              {/* Move to another map */}
              {(campaign?.maps ?? []).filter((m) => m.id !== currentMap?.id).length > 0 && (
                <div>
                  <button
                    className="w-full px-4 py-2 text-left text-sm text-warm-amber hover:bg-warm-amber/10 transition-colors flex items-center justify-between"
                    onClick={(e) => {
                      e.stopPropagation();
                      setContextMenuMoveToMapOpen(!contextMenuMoveToMapOpen);
                    }}
                  >
                    <span>Move to Map…</span>
                    <span className="text-xs opacity-60">▶</span>
                  </button>
                  {contextMenuMoveToMapOpen && (
                    <div className="bg-parchment/80 border-t border-moss-green/10 px-2 py-1 space-y-0.5">
                      {isMoveToMapLoading ? (
                        <p className="text-xs text-stone-gray px-2 py-1">Moving…</p>
                      ) : (
                        (campaign?.maps ?? [])
                          .filter((m) => m.id !== currentMap?.id)
                          .map((targetMap) => (
                            <button
                              key={targetMap.id}
                              className="w-full px-2 py-1.5 text-left text-xs text-charcoal hover:bg-moss-green/10 rounded transition-colors"
                              onClick={async () => {
                                if (!campaign?.id || !currentMap?.id) return;
                                const token = contextMenu.token;
                                setContextMenu(null);
                                setContextMenuMoveToMapOpen(false);
                                setIsMoveToMapLoading(true);
                                try {
                                  const position = {
                                    x: Math.min(token.position.x, targetMap.width - token.size.width),
                                    y: Math.min(token.position.y, targetMap.height - token.size.height),
                                  };
                                  await api.addToken(campaign.id, targetMap.id, {
                                    name: token.name,
                                    imageUrl: token.imageUrl,
                                    position,
                                    size: token.size,
                                    layer: token.layer,
                                    visible: token.visible,
                                    controlledBy: token.controlledBy,
                                  });
                                  await api.deleteToken(campaign.id, currentMap.id, token.id);
                                  useGameStore.getState().removeToken(token.id);
                                  socket?.emitMapChange(currentMap.id);
                                  socket?.emitMapChange(targetMap.id);
                                } catch (err) {
                                  console.error('Failed to move token to map:', err);
                                } finally {
                                  setIsMoveToMapLoading(false);
                                }
                              }}
                            >
                              {targetMap.name}
                            </button>
                          ))
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="h-px bg-moss-green/20 my-1" />

              <button
                className="w-full px-4 py-2 text-left text-sm text-danger-ink hover:bg-danger/10 transition-colors"
                onClick={async () => {
                  if (!campaign?.id || !currentMap?.id) return;
                  const token = contextMenu.token;
                  setContextMenu(null);
                  try {
                    await api.deleteToken(campaign.id, currentMap.id, token.id);
                    useGameStore.getState().removeToken(token.id);
                    socket?.emitMapChange(currentMap.id);
                  } catch (err) {
                    console.error('Failed to remove token:', err);
                  }
                }}
              >
                Remove from Map
              </button>
            </>
            );
          })()}
        </div>
      )}

      {/* Character Sheet Viewer (opened from token context menu) */}
      {viewingCharacter && campaign && (() => {
        const membership = campaign.memberships?.find((m) => m.userId === user?.id);
        if (!membership) return null;
        return (
          <CharacterSheetViewerModal
            character={viewingCharacter}
            campaignId={campaign.id}
            membership={membership}
            onClose={() => setViewingCharacter(null)}
          />
        );
      })()}

      {/* Roll Picker (opened from token context menu) */}
      {rollPicker && (
        <CharacterRollPicker
          characterId={rollPicker.characterId}
          anchorX={rollPicker.x}
          anchorY={rollPicker.y}
          onRoll={(expression, purpose) => socket?.emitDiceRoll({ expression, purpose })}
          onClose={() => setRollPicker(null)}
        />
      )}

      {/* NPC Roll Picker (DM-only, opened from token context menu) */}
      {npcRollPicker && (() => {
        const npcToken = tokens.find((t) => t.id === npcRollPicker.tokenId);
        if (!npcToken) return null;
        return (
          <NpcRollPicker
            token={npcToken}
            gameSystem={campaign?.gameSystem ?? 'DND_5E'}
            anchorX={npcRollPicker.x}
            anchorY={npcRollPicker.y}
            onRoll={(expression, purpose) => socket?.emitDiceRoll({ expression, purpose })}
            onClose={() => setNpcRollPicker(null)}
          />
        );
      })()}

      {/* Door Context Menu — right-click on a door segment */}
      {doorContextMenu && (
        <div
          className="fixed z-50 glass-panel bg-parchment/95 backdrop-blur-sm border border-moss-green/20 shadow-lg py-1 min-w-[160px]"
          style={{ left: `${doorContextMenu.x}px`, top: `${doorContextMenu.y}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header — door type label */}
          <p className="px-4 py-1.5 text-xs font-semibold text-stone-gray/70 border-b border-moss-green/10 select-none">
            {doorContextMenu.door.type === 'door-closed' ? '🚪 Closed Door' :
             doorContextMenu.door.type === 'door-open'   ? '🚪 Open Door'   :
                                                            '🔒 Locked Door'}
          </p>

          {/* Open — available when door is closed */}
          {doorContextMenu.door.type === 'door-closed' && (
            <button
              className="w-full px-4 py-2 text-left text-sm text-brand-ink hover:bg-moss-green/10 transition-colors"
              onClick={() => changeDoorType(doorContextMenu.door, 'door-open')}
            >
              Open Door
            </button>
          )}

          {/* Close — available when door is open */}
          {doorContextMenu.door.type === 'door-open' && (
            <button
              className="w-full px-4 py-2 text-left text-sm text-brand-ink hover:bg-moss-green/10 transition-colors"
              onClick={() => changeDoorType(doorContextMenu.door, 'door-closed')}
            >
              Close Door
            </button>
          )}

          {/* Lock — DM only, available when door is open or closed */}
          {isDM && doorContextMenu.door.type !== 'door-locked' && (
            <button
              className="w-full px-4 py-2 text-left text-sm text-danger-ink hover:bg-danger/10 transition-colors"
              onClick={() => changeDoorType(doorContextMenu.door, 'door-locked')}
            >
              Lock Door
            </button>
          )}

          {/* Unlock — DM only, available when door is locked */}
          {isDM && doorContextMenu.door.type === 'door-locked' && (
            <button
              className="w-full px-4 py-2 text-left text-sm text-brand-ink hover:bg-moss-green/10 transition-colors"
              onClick={() => changeDoorType(doorContextMenu.door, 'door-closed')}
            >
              Unlock Door
            </button>
          )}

          {/* Players see informational text when a door is locked */}
          {!isDM && doorContextMenu.door.type === 'door-locked' && (
            <p className="px-4 py-2 text-sm text-stone-gray/70 italic select-none">
              This door is locked.
            </p>
          )}
        </div>
      )}

      {/* Toast notifications (e.g., locked door message) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <Toast
          show={toast.show}
          message={toast.message}
          type={toast.type}
          onClose={hideToast}
        />
      </div>
    </div>
  );
}
