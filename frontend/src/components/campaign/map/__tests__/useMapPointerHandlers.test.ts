import type { Dispatch, MouseEvent, SetStateAction } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  TokenLayer,
  TokenType,
  type Token,
  type Map as CampaignMap,
} from "@/types";
import type { FogState, LightSource, WallSegment } from "@/types/walls";
import type { MapPointerHandlerDependencies } from "../useMapPointerHandlers";
import { useMapPointerHandlers } from "../useMapPointerHandlers";

const map: CampaignMap = {
  id: "map-1",
  revision: 0,
  name: "Map",
  width: 20,
  height: 20,
  gridSize: 50,
  imageUrl: "",
  baseLayerUrl: "",
  spiritLayerUrl: null,
  campaignId: "campaign-1",
  feetPerSquare: 5,
  diagonalRule: "flat",
  lightingEnabled: false,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
  tokens: [],
  annotations: [],
  wallSegments: [],
};

const token: Token = {
  id: "token-1",
  name: "Scout",
  characterId: null,
  imageUrl: "",
  position: { x: 1, y: 1 },
  size: { width: 1, height: 1 },
  visible: true,
  controlledBy: null,
  layer: TokenLayer.TOKEN,
  type: TokenType.NPC,
  rotation: 0,
  conditions: [],
  metadata: {},
  disposition: null,
  hp: null,
  showHpBar: false,
  notes: "",
  initiative: null,
};

const noOp = () => undefined;
const setter = <T>(): Dispatch<SetStateAction<T>> => noOp;
const point = (x: number, y: number) => ({ x, y, t: 0.5 });

function mouse(
  x: number,
  y: number,
  options: { button?: number; buttons?: number; detail?: number } = {},
): MouseEvent<HTMLCanvasElement> {
  return {
    button: options.button ?? 0,
    buttons: options.buttons ?? 1,
    detail: options.detail ?? 1,
    clientX: x,
    clientY: y,
    preventDefault: vi.fn(),
  } as unknown as MouseEvent<HTMLCanvasElement>;
}

function dependencies(overrides: Partial<MapPointerHandlerDependencies> = {}) {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    getSocket: () => ({
      emit: (event: string, payload: unknown) =>
        emitted.push({ event, payload }),
    }),
    emitTokenMoveStart: (event: unknown) =>
      emitted.push({ event: "token.move.start", payload: event }),
    emitTokenMove: (event: unknown) =>
      emitted.push({ event: "token.move", payload: event }),
    emitTokenMoveEnd: (event: unknown) =>
      emitted.push({ event: "token.move.end", payload: event }),
  } as MapPointerHandlerDependencies["socket"];
  const fakeCanvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  } as unknown as HTMLCanvasElement;
  const mapControls = {
    panOffset: { x: 0, y: 0 },
    zoom: 1,
    isDragging: false,
    startDrag: vi.fn(),
    stopDrag: vi.fn(),
    handleDrag: vi.fn(),
    screenToGrid: ({ x, y }: { x: number; y: number }) => ({ x, y }),
    isWithinBounds: () => true,
  } as unknown as MapPointerHandlerDependencies["mapControls"];
  const fog: FogState = {
    fogCols: 4,
    fogRows: 4,
    cellPx: 50,
    revealed: new Array(16).fill(false),
  };
  const base: MapPointerHandlerDependencies = {
    canvasRef: { current: fakeCanvas },
    currentMap: map,
    isDM: true,
    wallMode: null,
    fogMode: null,
    lightMode: null,
    wallType: "wall",
    wallSegments: [],
    wallInProgress: [],
    polygonPoints: [],
    lightSources: [],
    lightPlacementDefaults: { brightRadius: 4, dimRadius: 8, color: "#fff" },
    fogState: fog,
    draggedToken: null,
    dragOffset: null,
    hoveredDoorId: null,
    showRuler: false,
    showAoE: false,
    interactionMode: "none",
    ping: vi.fn(),
    snapToGrid: true,
    mapImage: null,
    mapControls,
    socket,
    canEmit: () => true,
    canMoveToken: () => true,
    selectToken: vi.fn(),
    getTokenAtPosition: () => null,
    snapPoint: ({ x, y }) => ({ x, y }),
    findWallAtPoint: () => null,
    buildWallReplace: () => null,
    distToSegment: () => 99,
    closestPointOnSegment: (x, y) => point(x, y),
    beginFogDrag: vi.fn(),
    updateFogDrag: vi.fn(),
    commitFogDrag: vi.fn(),
    cancelFogDrag: vi.fn(),
    closePolygon: vi.fn(),
    pushWallHistory: vi.fn(),
    replaceWallHistory: vi.fn(),
    markDirty: vi.fn(),
    showToast: vi.fn(),
    applyTokenMove: vi.fn(),
    setWallInProgress: setter(),
    setPolygonPoints: setter(),
    setSelectedWallId: setter(),
    setSelectedEndpoint: setter(),
    setNearEndpoint: setter(),
    setHoveredWallId: setter(),
    setSplitHoverPoint: setter(),
    setLightSources: setter(),
    setSelectedLightId: setter(),
    setHoveredDoorId: setter(),
    setHoverCoords: setter(),
    setHoverToken: setter(),
    setRulerOrigin: setter(),
    setAoEOrigin: setter(),
    setShowRuler: setter(),
    setDraggedToken: setter(),
    setDragOffset: setter(),
    setContextMenu: setter(),
    setDoorContextMenu: setter(),
    rightPanActiveRef: { current: false },
    wallEraseBrushActiveRef: { current: false },
    wallErasedIdsRef: { current: new Set() },
    wallBrushActiveRef: { current: false },
    wallBrushPointsRef: { current: [] },
    wallDragEndpointRef: { current: null },
    draggingLightRef: { current: null },
    hoverMapPxRef: { current: null },
    lastMoveEmitRef: { current: 0 },
    lightSourcesRef: { current: [] },
    wallCacheValidRef: { current: false },
    polygonCloseRadius: 14,
    wallEraseRadius: 24,
  };
  return { deps: { ...base, ...overrides }, emitted };
}

describe("useMapPointerHandlers", () => {
  it("draws walls, selects shared endpoints, and splits a hit segment in socket order", () => {
    const first = dependencies({
      wallMode: "wall-draw",
      wallInProgress: [{ x: 10, y: 10 }],
    });
    useMapPointerHandlers(first.deps).handleMouseDown(mouse(40, 10));
    expect(first.emitted.map(({ event }) => event)).toEqual(["wall:add"]);

    const wall: WallSegment = {
      id: "wall-1",
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      type: "wall",
    };
    const selected = dependencies({
      wallMode: "wall-select",
      wallSegments: [wall],
    });
    useMapPointerHandlers(selected.deps).handleMouseDown(mouse(0, 0));
    expect(selected.deps.wallDragEndpointRef.current?.targets).toEqual([
      { segId: "wall-1", end: "start" },
    ]);

    const split = dependencies({
      wallMode: "wall-split",
      wallSegments: [wall],
      distToSegment: () => 0,
      closestPointOnSegment: () => point(50, 0),
    });
    useMapPointerHandlers(split.deps).handleMouseDown(mouse(50, 0));
    expect(split.emitted.map(({ event }) => event)).toEqual([
      "wall:remove",
      "wall:add",
      "wall:add",
    ]);
  });

  it("starts fog selection and commits placed and dragged lights", () => {
    const fog = dependencies({ fogMode: "fog-reveal" });
    useMapPointerHandlers(fog.deps).handleMouseDown(mouse(20, 20));
    expect(fog.deps.beginFogDrag).toHaveBeenCalledWith({ x: 20, y: 20 });

    const placed: Array<SetStateAction<LightSource[]>> = [];
    const light = dependencies({
      lightMode: "light-place",
      setLightSources: (value) => placed.push(value),
    });
    useMapPointerHandlers(light.deps).handleMouseDown(mouse(20.6, 30.2));
    expect(light.emitted.map(({ event }) => event)).toEqual(["light:add"]);
    expect(
      (placed[0] as (previous: LightSource[]) => LightSource[])([])[0],
    ).toMatchObject({ x: 21, y: 30 });

    const existing: LightSource = {
      id: "light-1",
      x: 20,
      y: 20,
      brightRadius: 4,
      dimRadius: 8,
      color: "#fff",
      enabled: true,
    };
    const dragged = dependencies({
      lightMode: "light-select",
      lightSources: [existing],
      lightSourcesRef: { current: [existing] },
    });
    const handlers = useMapPointerHandlers(dragged.deps);
    handlers.handleMouseDown(mouse(20, 20));
    handlers.handleMouseMove(mouse(38.6, 44.4));
    handlers.handleMouseUp(mouse(38.6, 44.4));
    expect(dragged.emitted.map(({ event }) => event)).toEqual(["light:update"]);
    expect(dragged.emitted[0]?.payload).toEqual({
      mapId: map.id,
      light: { ...existing, x: 39, y: 44 },
    });
  });

  it("starts and ends token movement, then gives tokens context-menu priority over doors", () => {
    const started = dependencies({ getTokenAtPosition: () => token });
    useMapPointerHandlers(started.deps).handleMouseDown(mouse(1, 1));
    expect(started.deps.selectToken).toHaveBeenCalledWith(token.id);
    expect(started.emitted.map(({ event }) => event)).toEqual([
      "token.move.start",
    ]);

    const placed = dependencies({
      draggedToken: token,
      dragOffset: { x: 0, y: 0 },
    });
    useMapPointerHandlers(placed.deps).handleMouseDown(mouse(4, 5));
    expect(placed.emitted.map(({ event }) => event)).toEqual([
      "token.move.end",
    ]);
    expect(placed.deps.applyTokenMove).toHaveBeenCalledWith(token.id, {
      x: 4,
      y: 5,
    });

    const setContextMenu = vi.fn();
    const setDoorContextMenu = vi.fn();
    const context = dependencies({
      getTokenAtPosition: () => token,
      distToSegment: () => 0,
      wallSegments: [
        { id: "door", x1: 0, y1: 0, x2: 10, y2: 0, type: "door-closed" },
      ],
      setContextMenu,
      setDoorContextMenu,
    });
    useMapPointerHandlers(context.deps).handleContextMenu(
      mouse(1, 1, { button: 2 }),
    );
    expect(setContextMenu).toHaveBeenCalledWith({ token, x: 1, y: 1 });
    expect(context.deps.selectToken).toHaveBeenCalledWith(token.id);
    expect(setDoorContextMenu).toHaveBeenCalledWith(null);
  });

  it("routes ping tool clicks through the host interaction capability", () => {
    const ping = vi.fn();
    const configured = dependencies({ interactionMode: "ping", ping });

    useMapPointerHandlers(configured.deps).handleMouseDown(mouse(7, 9));

    expect(ping).toHaveBeenCalledWith({ x: 7, y: 9 });
    expect(configured.emitted).toEqual([]);
  });
});
