import type {
  Dispatch,
  MouseEvent,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react";
import type {
  Token,
  TokenMoveEndEvent,
  TokenMoveEvent,
  TokenMoveStartEvent,
  Map as CampaignMap,
} from "@/types";
import type {
  FogState,
  LightSource,
  WallSegment,
  WallType,
} from "@/types/walls";
import type { FogToolMode } from "@/components/campaign/DmFogControls";
import type {
  LightPlacementDefaults,
  LightToolMode,
} from "@/components/campaign/DmLightControls";
import type { WallToolMode } from "@/components/campaign/DmWallControls";
import { douglasPeucker, edgeSnapPoints } from "@/utils/geometry";
import {
  nearestLight,
  placeLight,
  updateLightPosition,
} from "./mapToolControllers";
import { resolveMapPointerIntent } from "./pointerIntent";
import { useMapControls } from "@/hooks/useMapControls";

type Point = { x: number; y: number };
type ProjectedPoint = Point & { t: number };
type MapControls = ReturnType<typeof useMapControls>;
type SocketGateway = {
  getSocket: () => { emit: (event: string, payload: unknown) => void } | null;
  emitTokenMoveStart: (event: TokenMoveStartEvent) => void;
  emitTokenMove: (event: TokenMoveEvent) => void;
  emitTokenMoveEnd: (event: TokenMoveEndEvent) => void;
};

interface WallEndpointDrag {
  targets: Array<{ segId: string; end: "start" | "end" }>;
  point: Point;
  preDragState: WallSegment[] | null;
  hasDragged: boolean;
}

export interface MapPointerHandlerDependencies {
  canvasRef: RefObject<HTMLCanvasElement>;
  currentMap: CampaignMap | null;
  isDM: boolean;
  wallMode: WallToolMode;
  fogMode: FogToolMode;
  lightMode: LightToolMode;
  wallType: WallType;
  wallSegments: WallSegment[];
  wallInProgress: Point[];
  polygonPoints: Point[];
  lightSources: LightSource[];
  lightPlacementDefaults: LightPlacementDefaults;
  fogState: FogState | null;
  draggedToken: Token | null;
  dragOffset: Point | null;
  hoveredDoorId: string | null;
  showRuler: boolean;
  showAoE: boolean;
  snapToGrid: boolean;
  mapImage: HTMLImageElement | null;
  mapControls: MapControls;
  socket: SocketGateway | null | undefined;
  canEmit: () => boolean;
  canMoveToken: (token: Token) => boolean;
  applyTokenMove: (tokenId: string, position: Point) => void;
  getTokenAtPosition: (x: number, y: number) => Token | null;
  snapPoint: (point: Point) => Point;
  findWallAtPoint: (
    x: number,
    y: number,
    threshold: number,
  ) => { seg: WallSegment; point: ProjectedPoint } | null;
  buildWallReplace: (
    a: ProjectedPoint,
    b: ProjectedPoint,
    wall: WallSegment,
    type: WallType,
  ) => { remove: string[]; add: WallSegment[] } | null;
  distToSegment: (x: number, y: number, segment: WallSegment) => number;
  closestPointOnSegment: (
    x: number,
    y: number,
    segment: WallSegment,
  ) => ProjectedPoint;
  beginFogDrag: (point: Point) => void;
  updateFogDrag: (point: Point) => void;
  commitFogDrag: () => void;
  cancelFogDrag: () => void;
  closePolygon: () => void;
  pushWallHistory: (walls: WallSegment[]) => void;
  replaceWallHistory: (walls: WallSegment[]) => void;
  markDirty: (...layers: Array<"terrain" | "tokens" | "overlay">) => void;
  showToast: (message: string, type: "info" | "success" | "error") => void;
  setWallInProgress: Dispatch<SetStateAction<Point[]>>;
  setPolygonPoints: Dispatch<SetStateAction<Point[]>>;
  setSelectedWallId: Dispatch<SetStateAction<string | null>>;
  setSelectedEndpoint: Dispatch<SetStateAction<Point | null>>;
  setNearEndpoint: Dispatch<SetStateAction<boolean>>;
  setHoveredWallId: Dispatch<SetStateAction<string | null>>;
  setSplitHoverPoint: Dispatch<
    SetStateAction<{ x: number; y: number; wallId: string } | null>
  >;
  setLightSources: Dispatch<SetStateAction<LightSource[]>>;
  setSelectedLightId: Dispatch<SetStateAction<string | null>>;
  setHoveredDoorId: Dispatch<SetStateAction<string | null>>;
  setHoverCoords: Dispatch<SetStateAction<Point | null>>;
  setHoverToken: Dispatch<SetStateAction<Token | null>>;
  setRulerOrigin: Dispatch<SetStateAction<Point | null>>;
  setAoEOrigin: Dispatch<SetStateAction<Point | null>>;
  setShowRuler: Dispatch<SetStateAction<boolean>>;
  setDraggedToken: Dispatch<SetStateAction<Token | null>>;
  setDragOffset: Dispatch<SetStateAction<Point | null>>;
  setContextMenu: Dispatch<
    SetStateAction<{ token: Token; x: number; y: number } | null>
  >;
  setDoorContextMenu: Dispatch<
    SetStateAction<{ door: WallSegment; x: number; y: number } | null>
  >;
  rightPanActiveRef: MutableRefObject<boolean>;
  wallEraseBrushActiveRef: MutableRefObject<boolean>;
  wallErasedIdsRef: MutableRefObject<Set<string>>;
  wallBrushActiveRef: MutableRefObject<boolean>;
  wallBrushPointsRef: MutableRefObject<Point[]>;
  wallDragEndpointRef: MutableRefObject<WallEndpointDrag | null>;
  draggingLightRef: MutableRefObject<{
    id: string;
    startX: number;
    startY: number;
  } | null>;
  hoverMapPxRef: MutableRefObject<Point | null>;
  lastMoveEmitRef: MutableRefObject<number>;
  lightSourcesRef: MutableRefObject<LightSource[]>;
  wallCacheValidRef: MutableRefObject<boolean>;
  polygonCloseRadius: number;
  wallEraseRadius: number;
}

/**
 * The map's input state machine. It deliberately owns precedence between tools,
 * panning, token movement, and context menus so adapters cannot reorder them.
 */
export function useMapPointerHandlers(deps: MapPointerHandlerDependencies) {
  const screenToMapPx = (screenX: number, screenY: number): Point => ({
    x: (screenX - deps.mapControls.panOffset.x) / deps.mapControls.zoom,
    y: (screenY - deps.mapControls.panOffset.y) / deps.mapControls.zoom,
  });
  const mapPxToScreen = (x: number, y: number): Point => ({
    x: x * deps.mapControls.zoom + deps.mapControls.panOffset.x,
    y: y * deps.mapControls.zoom + deps.mapControls.panOffset.y,
  });

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const d = deps;
    if (!d.canvasRef.current || !d.currentMap) return;
    const pointerIntent = resolveMapPointerIntent({
      button: e.button,
      isDM: d.isDM,
      wallMode: d.wallMode,
      fogMode: d.fogMode,
      lightMode: d.lightMode,
    });
    if (pointerIntent === "tool-pan") {
      d.cancelFogDrag();
      d.rightPanActiveRef.current = true;
      d.mapControls.startDrag(e);
      return;
    }
    if (pointerIntent === "ignore") return;
    const rect = d.canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const gridCoords = d.mapControls.screenToGrid({ x: screenX, y: screenY });

    if (d.wallMode === "wall-draw" && d.isDM) {
      const snapped = d.snapPoint(screenToMapPx(screenX, screenY));
      if (e.detail >= 2) {
        d.setWallInProgress([]);
        return;
      }
      if (d.wallInProgress.length === 0) {
        let startPoint = snapped;
        if (d.wallType !== "wall") {
          const hit = d.findWallAtPoint(
            snapped.x,
            snapped.y,
            14 / d.mapControls.zoom,
          );
          if (hit)
            startPoint = {
              x: Math.round(hit.point.x),
              y: Math.round(hit.point.y),
            };
        }
        d.setWallInProgress([startPoint]);
        return;
      }
      const previous = d.wallInProgress[d.wallInProgress.length - 1]!;
      if (d.wallType !== "wall") {
        const threshold = 14 / d.mapControls.zoom;
        const firstHit = d.findWallAtPoint(previous.x, previous.y, threshold);
        const secondHit = d.findWallAtPoint(snapped.x, snapped.y, threshold);
        if (firstHit && secondHit && firstHit.seg.id === secondHit.seg.id) {
          const replace = d.buildWallReplace(
            firstHit.point,
            secondHit.point,
            firstHit.seg,
            d.wallType,
          );
          if (replace) {
            const next = d.wallSegments
              .filter((segment) => !replace.remove.includes(segment.id))
              .concat(replace.add);
            d.pushWallHistory(next);
            d.wallCacheValidRef.current = false;
            const socket = d.socket?.getSocket();
            if (socket) {
              for (const id of replace.remove)
                socket.emit("wall:remove", {
                  mapId: d.currentMap.id,
                  segmentId: id,
                });
              for (const segment of replace.add)
                socket.emit("wall:add", { mapId: d.currentMap.id, segment });
            }
            d.setWallInProgress([]);
            return;
          }
        }
      }
      const segment: WallSegment = {
        id: crypto.randomUUID(),
        x1: previous.x,
        y1: previous.y,
        x2: snapped.x,
        y2: snapped.y,
        type: d.wallType,
      };
      d.pushWallHistory([...d.wallSegments, segment]);
      d.wallCacheValidRef.current = false;
      d.socket
        ?.getSocket()
        ?.emit("wall:add", { mapId: d.currentMap.id, segment });
      d.setWallInProgress((points) => [...points, snapped]);
      return;
    }

    if (d.wallMode === "wall-polygon" && d.isDM) {
      const snapped = d.snapPoint(screenToMapPx(screenX, screenY));
      if (e.detail >= 2) {
        d.closePolygon();
        return;
      }
      if (d.polygonPoints.length >= 3) {
        const first = d.polygonPoints[0]!;
        const firstScreen = mapPxToScreen(first.x, first.y);
        if (
          Math.hypot(e.clientX - firstScreen.x, e.clientY - firstScreen.y) <=
          d.polygonCloseRadius
        ) {
          d.closePolygon();
          return;
        }
      }
      d.setPolygonPoints((points) => [...points, snapped]);
      return;
    }

    if (d.wallMode === "wall-select" && d.isDM) {
      const mapPoint = screenToMapPx(screenX, screenY);
      let bestDistance = 10 / d.mapControls.zoom;
      let bestPoint: Point | null = null;
      for (const segment of d.wallSegments)
        for (const point of [
          { x: segment.x1, y: segment.y1 },
          { x: segment.x2, y: segment.y2 },
        ]) {
          const distance = Math.hypot(
            point.x - mapPoint.x,
            point.y - mapPoint.y,
          );
          if (distance < bestDistance) {
            bestDistance = distance;
            bestPoint = point;
          }
        }
      if (bestPoint) {
        const targets: Array<{ segId: string; end: "start" | "end" }> = [];
        for (const segment of d.wallSegments) {
          if (
            Math.round(segment.x1) === Math.round(bestPoint.x) &&
            Math.round(segment.y1) === Math.round(bestPoint.y)
          )
            targets.push({ segId: segment.id, end: "start" });
          if (
            Math.round(segment.x2) === Math.round(bestPoint.x) &&
            Math.round(segment.y2) === Math.round(bestPoint.y)
          )
            targets.push({ segId: segment.id, end: "end" });
        }
        if (targets.length) {
          d.wallDragEndpointRef.current = {
            targets,
            point: { ...bestPoint },
            preDragState: [...d.wallSegments],
            hasDragged: false,
          };
          return;
        }
      }
      d.setSelectedEndpoint(null);
      const hit = d.wallSegments.find(
        (segment) =>
          d.distToSegment(mapPoint.x, mapPoint.y, segment) <=
          12 / d.mapControls.zoom,
      );
      d.setSelectedWallId(hit?.id ?? null);
      return;
    }

    if (d.wallMode === "wall-split" && d.isDM) {
      const mapPoint = screenToMapPx(screenX, screenY);
      const hit = d.wallSegments.find(
        (segment) =>
          d.distToSegment(mapPoint.x, mapPoint.y, segment) <=
          14 / d.mapControls.zoom,
      );
      if (hit) {
        const point = d.closestPointOnSegment(mapPoint.x, mapPoint.y, hit);
        if (
          Math.hypot(point.x - hit.x1, point.y - hit.y1) < 10 ||
          Math.hypot(point.x - hit.x2, point.y - hit.y2) < 10
        )
          return;
        const first: WallSegment = {
          id: crypto.randomUUID(),
          x1: hit.x1,
          y1: hit.y1,
          x2: point.x,
          y2: point.y,
          type: hit.type,
        };
        const second: WallSegment = {
          id: crypto.randomUUID(),
          x1: point.x,
          y1: point.y,
          x2: hit.x2,
          y2: hit.y2,
          type: hit.type,
        };
        const next = d.wallSegments
          .filter((segment) => segment.id !== hit.id)
          .concat(first, second);
        d.pushWallHistory(next);
        d.wallCacheValidRef.current = false;
        const socket = d.socket?.getSocket();
        if (socket) {
          socket.emit("wall:remove", {
            mapId: d.currentMap.id,
            segmentId: hit.id,
          });
          socket.emit("wall:add", { mapId: d.currentMap.id, segment: first });
          socket.emit("wall:add", { mapId: d.currentMap.id, segment: second });
        }
      }
      return;
    }

    if (d.wallMode === "wall-erase" && d.isDM) {
      d.wallEraseBrushActiveRef.current = true;
      d.wallErasedIdsRef.current = new Set();
      const point = screenToMapPx(screenX, screenY);
      const radius = d.wallEraseRadius / d.mapControls.zoom;
      d.wallSegments.forEach((segment) => {
        if (d.distToSegment(point.x, point.y, segment) <= radius)
          d.wallErasedIdsRef.current.add(segment.id);
      });
      d.markDirty("overlay");
      return;
    }
    if (d.wallMode === "wall-brush" && d.isDM) {
      d.wallBrushActiveRef.current = true;
      const point = d.snapPoint(screenToMapPx(screenX, screenY));
      d.wallBrushPointsRef.current = [{ x: point.x, y: point.y }];
      d.markDirty("overlay");
      return;
    }

    if (d.lightMode && d.isDM) {
      const point = screenToMapPx(screenX, screenY);
      if (d.lightMode === "light-place") {
        const light = placeLight(
          point.x,
          point.y,
          d.lightPlacementDefaults,
          () => crypto.randomUUID(),
        );
        d.setLightSources((lights) => [...lights, light]);
        d.setSelectedLightId(light.id);
        d.socket
          ?.getSocket()
          ?.emit("light:add", { mapId: d.currentMap.id, light });
        return;
      }
      if (d.lightMode === "light-select") {
        const light = nearestLight(
          d.lightSources,
          point.x,
          point.y,
          16 / d.mapControls.zoom,
        );
        if (light) {
          d.setSelectedLightId(light.id);
          d.draggingLightRef.current = {
            id: light.id,
            startX: point.x,
            startY: point.y,
          };
        } else d.setSelectedLightId(null);
        return;
      }
    }

    if (!d.wallMode && !d.fogMode && !d.lightMode) {
      const point = screenToMapPx(screenX, screenY);
      const door = d.wallSegments.find(
        (segment) =>
          (segment.type === "door-closed" ||
            segment.type === "door-open" ||
            segment.type === "door-locked") &&
          d.distToSegment(point.x, point.y, segment) <= 12 / d.mapControls.zoom,
      );
      if (door) {
        if (door.type === "door-locked") {
          d.showToast("This door is locked.", "info");
          return;
        }
        const updated = {
          ...door,
          type: door.type === "door-closed" ? "door-open" : "door-closed",
        } as WallSegment;
        d.replaceWallHistory(
          d.wallSegments.map((segment) =>
            segment.id === door.id ? updated : segment,
          ),
        );
        d.wallCacheValidRef.current = false;
        d.socket
          ?.getSocket()
          ?.emit("wall:update", { mapId: d.currentMap.id, segment: updated });
        return;
      }
    }
    if (d.fogMode && d.isDM && d.fogState) {
      e.preventDefault();
      d.beginFogDrag(screenToMapPx(screenX, screenY));
      return;
    }
    if (d.showRuler && d.isDM) {
      d.setRulerOrigin(gridCoords);
      return;
    }
    if (d.showAoE) {
      d.setAoEOrigin(gridCoords);
      return;
    }
    if (d.draggedToken && d.dragOffset) {
      const x = Math.max(
        0,
        Math.min(
          gridCoords.x - d.dragOffset.x,
          d.currentMap.width - d.draggedToken.size.width,
        ),
      );
      const y = Math.max(
        0,
        Math.min(
          gridCoords.y - d.dragOffset.y,
          d.currentMap.height - d.draggedToken.size.height,
        ),
      );
      if (d.canEmit())
        d.socket!.emitTokenMoveEnd({
          tokenId: d.draggedToken.id,
          mapId: d.currentMap.id,
          x: Math.floor(x),
          y: Math.floor(y),
        });
      else console.warn("⚠️ Cannot emit token.move.end - socket not connected");
      // The store remains intentionally local to the React adapter; dispatch it through the supplied callback.
      d.applyTokenMove(d.draggedToken.id, {
        x: Math.floor(x),
        y: Math.floor(y),
      });
      d.setDraggedToken(null);
      d.setDragOffset(null);
      console.log("✅ Token placed, state cleared");
      return;
    }
    const token = d.getTokenAtPosition(gridCoords.x, gridCoords.y);
    console.log("🔍 Token at click position:", token?.name || "none");
    if (token && d.canMoveToken(token)) {
      if (d.showRuler) {
        d.setShowRuler(false);
        d.setRulerOrigin(null);
      }
      console.log("👆 Picking up token:", token.name);
      d.setDraggedToken(token);
      d.setDragOffset({
        x: gridCoords.x - token.position.x,
        y: gridCoords.y - token.position.y,
      });
      if (d.canEmit())
        d.socket!.emitTokenMoveStart({
          tokenId: token.id,
          mapId: d.currentMap.id,
        });
      else
        console.warn("⚠️ Cannot emit token.move.start - socket not connected");
    } else if (!d.draggedToken) d.mapControls.startDrag(e);
  };

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const d = deps;
    if (!d.canvasRef.current || !d.currentMap) return;
    const rect = d.canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const gridCoords = d.mapControls.screenToGrid({ x: screenX, y: screenY });
    const mapPoint = screenToMapPx(screenX, screenY);
    d.hoverMapPxRef.current = mapPoint;
    d.setHoverCoords(
      d.mapControls.isWithinBounds(gridCoords) ? gridCoords : null,
    );
    if (d.wallMode === "wall-select" && d.isDM) {
      if (d.rightPanActiveRef.current) {
        d.mapControls.handleDrag(e);
        d.markDirty("terrain", "tokens", "overlay");
        return;
      }
      if (d.wallDragEndpointRef.current && e.buttons & 1) {
        const snapped = d.snapPoint(mapPoint);
        const drag = d.wallDragEndpointRef.current;
        if (
          !drag.hasDragged &&
          Math.hypot(snapped.x - drag.point.x, snapped.y - drag.point.y) >
            2 / d.mapControls.zoom
        )
          drag.hasDragged = true;
        if (!drag.hasDragged) {
          d.markDirty("overlay");
          return;
        }
        drag.point = { x: snapped.x, y: snapped.y };
        const targetSet = new Set(
          drag.targets.map((target) => `${target.segId}:${target.end}`),
        );
        d.replaceWallHistory(
          d.wallSegments.map((segment) => ({
            ...segment,
            ...(targetSet.has(`${segment.id}:start`)
              ? { x1: Math.round(drag.point.x), y1: Math.round(drag.point.y) }
              : {}),
            ...(targetSet.has(`${segment.id}:end`)
              ? { x2: Math.round(drag.point.x), y2: Math.round(drag.point.y) }
              : {}),
          })),
        );
        d.wallCacheValidRef.current = false;
        d.markDirty("overlay");
        return;
      }
      let near = false;
      for (const segment of d.wallSegments)
        for (const point of [
          { x: segment.x1, y: segment.y1 },
          { x: segment.x2, y: segment.y2 },
        ])
          if (
            Math.hypot(point.x - mapPoint.x, point.y - mapPoint.y) <
            10 / d.mapControls.zoom
          )
            near = true;
      d.setNearEndpoint(near);
      const hit = d.wallSegments.find(
        (segment) =>
          d.distToSegment(mapPoint.x, mapPoint.y, segment) <=
          12 / d.mapControls.zoom,
      );
      d.setHoveredWallId(hit?.id ?? null);
      d.markDirty("overlay");
      return;
    }
    if (d.wallMode === "wall-split" && d.isDM) {
      if (d.rightPanActiveRef.current) d.mapControls.handleDrag(e);
      const hit = d.wallSegments.find(
        (segment) =>
          d.distToSegment(mapPoint.x, mapPoint.y, segment) <=
          14 / d.mapControls.zoom,
      );
      d.setSplitHoverPoint(
        hit
          ? {
              ...d.closestPointOnSegment(mapPoint.x, mapPoint.y, hit),
              wallId: hit.id,
            }
          : null,
      );
      d.markDirty("overlay");
      return;
    }
    if (d.wallMode === "wall-erase" && d.isDM) {
      if (d.rightPanActiveRef.current) d.mapControls.handleDrag(e);
      else if (d.wallEraseBrushActiveRef.current) {
        const radius = d.wallEraseRadius / d.mapControls.zoom;
        d.wallSegments.forEach((segment) => {
          if (d.distToSegment(mapPoint.x, mapPoint.y, segment) <= radius)
            d.wallErasedIdsRef.current.add(segment.id);
        });
      }
      d.markDirty("overlay");
      return;
    }
    if (d.wallMode === "wall-brush" && d.isDM) {
      if (d.rightPanActiveRef.current) d.mapControls.handleDrag(e);
      else if (d.wallBrushActiveRef.current) {
        const snapped = d.snapPoint(mapPoint);
        const points = d.wallBrushPointsRef.current;
        const last = points[points.length - 1];
        if (last && Math.hypot(snapped.x - last.x, snapped.y - last.y) >= 3)
          points.push({ x: snapped.x, y: snapped.y });
      }
      d.markDirty("overlay");
      return;
    }
    if (
      (d.wallMode === "wall-polygon" || d.wallMode === "wall-draw") &&
      d.isDM
    ) {
      if (d.rightPanActiveRef.current) d.mapControls.handleDrag(e);
      d.markDirty("overlay");
      return;
    }
    if (d.lightMode && d.isDM) {
      if (d.rightPanActiveRef.current) d.mapControls.handleDrag(e);
      if (d.draggingLightRef.current && e.buttons & 1) {
        const id = d.draggingLightRef.current.id;
        d.setLightSources((lights) =>
          updateLightPosition(lights, id, mapPoint.x, mapPoint.y),
        );
        d.markDirty("overlay");
      }
      return;
    }
    if (!d.wallMode && !d.fogMode && !d.draggedToken) {
      const door = d.wallSegments.find(
        (segment) =>
          (segment.type === "door-closed" ||
            segment.type === "door-open" ||
            segment.type === "door-locked") &&
          d.distToSegment(mapPoint.x, mapPoint.y, segment) <=
            12 / d.mapControls.zoom,
      );
      const id = door?.id ?? null;
      if (id !== d.hoveredDoorId) {
        d.setHoveredDoorId(id);
        d.markDirty("overlay");
      }
    }
    if (d.fogMode && d.isDM && d.fogState) {
      d.updateFogDrag(mapPoint);
      d.markDirty("overlay");
      return;
    }
    if (d.draggedToken && d.dragOffset) {
      const x = Math.max(
        0,
        Math.min(
          gridCoords.x - d.dragOffset.x,
          d.currentMap.width - d.draggedToken.size.width,
        ),
      );
      const y = Math.max(
        0,
        Math.min(
          gridCoords.y - d.dragOffset.y,
          d.currentMap.height - d.draggedToken.size.height,
        ),
      );
      const now = Date.now();
      if (d.canEmit() && now - d.lastMoveEmitRef.current >= 16) {
        d.socket!.emitTokenMove({
          tokenId: d.draggedToken.id,
          mapId: d.currentMap.id,
          x: Math.floor(x),
          y: Math.floor(y),
        });
        d.lastMoveEmitRef.current = now;
      }
      d.markDirty("tokens");
    } else {
      d.mapControls.handleDrag(e);
      d.setHoverToken(d.getTokenAtPosition(gridCoords.x, gridCoords.y) ?? null);
      if (d.mapControls.isDragging) d.markDirty("terrain", "tokens", "overlay");
    }
  };

  const handleMouseUp = (e?: MouseEvent<HTMLCanvasElement>) => {
    const d = deps;
    if (e?.button === 2) {
      d.rightPanActiveRef.current = false;
      d.mapControls.stopDrag();
      return;
    }
    if (d.wallDragEndpointRef.current) {
      const drag = d.wallDragEndpointRef.current;
      d.wallDragEndpointRef.current = null;
      if (drag.hasDragged) {
        const final = d.wallSegments;
        if (drag.preDragState) d.replaceWallHistory(drag.preDragState);
        d.pushWallHistory(final);
        d.wallCacheValidRef.current = false;
        if (d.currentMap)
          d.socket
            ?.getSocket()
            ?.emit("walls:replace", {
              mapId: d.currentMap.id,
              segments: final,
            });
        d.setSelectedEndpoint(null);
      } else {
        if (drag.preDragState) d.replaceWallHistory(drag.preDragState);
        d.setSelectedEndpoint({
          x: Math.round(drag.point.x),
          y: Math.round(drag.point.y),
        });
        d.setSelectedWallId(null);
      }
    }
    if (d.draggingLightRef.current) {
      const id = d.draggingLightRef.current.id;
      d.draggingLightRef.current = null;
      const light = d.lightSourcesRef.current.find(
        (source) => source.id === id,
      );
      if (light && d.currentMap)
        d.socket
          ?.getSocket()
          ?.emit("light:update", { mapId: d.currentMap.id, light });
    }
    if (d.fogMode) d.commitFogDrag();
    if (d.wallMode === "wall-erase" && d.wallEraseBrushActiveRef.current) {
      d.wallEraseBrushActiveRef.current = false;
      const erased = d.wallErasedIdsRef.current;
      if (erased.size) {
        const next = d.wallSegments.filter(
          (segment) => !erased.has(segment.id),
        );
        d.pushWallHistory(next);
        d.wallCacheValidRef.current = false;
        if (d.currentMap)
          d.socket
            ?.getSocket()
            ?.emit("walls:replace", { mapId: d.currentMap.id, segments: next });
        d.wallErasedIdsRef.current = new Set();
        d.markDirty("overlay");
      }
    }
    if (d.wallMode === "wall-brush" && d.wallBrushActiveRef.current) {
      d.wallBrushActiveRef.current = false;
      const raw = d.wallBrushPointsRef.current;
      d.wallBrushPointsRef.current = [];
      if (raw.length >= 2 && d.currentMap) {
        const gridPx = d.currentMap.gridSize ?? 50;
        let simplified = douglasPeucker(raw, gridPx * 0.4);
        if (!d.snapToGrid && d.mapImage && simplified.length >= 2)
          simplified = edgeSnapPoints(simplified, d.mapImage, gridPx * 0.6);
        if (simplified.length >= 2) {
          const added = simplified
            .slice(0, -1)
            .map((point, index): WallSegment => {
              const next = simplified[index + 1]!;
              return {
                id: crypto.randomUUID(),
                x1: Math.round(point.x),
                y1: Math.round(point.y),
                x2: Math.round(next.x),
                y2: Math.round(next.y),
                type: d.wallType,
              };
            });
          const next = [...d.wallSegments, ...added];
          d.pushWallHistory(next);
          d.wallCacheValidRef.current = false;
          d.socket
            ?.getSocket()
            ?.emit("walls:replace", { mapId: d.currentMap.id, segments: next });
        }
      }
      d.markDirty("overlay");
    }
    d.mapControls.stopDrag();
  };

  const handleMouseLeave = () => {
    const d = deps;
    d.cancelFogDrag();
    if (d.draggedToken) {
      d.setDraggedToken(null);
      d.setDragOffset(null);
    }
    d.mapControls.stopDrag();
    d.setHoverCoords(null);
    d.setHoverToken(null);
    d.setHoveredDoorId(null);
    d.hoverMapPxRef.current = null;
  };
  const handleContextMenu = (e: MouseEvent<HTMLCanvasElement>) => {
    const d = deps;
    e.preventDefault();
    if (!d.canvasRef.current || !d.currentMap || (d.wallMode && d.isDM)) return;
    d.setDoorContextMenu(null);
    if (d.draggedToken) {
      d.setDraggedToken(null);
      d.setDragOffset(null);
    }
    const rect = d.canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const grid = d.mapControls.screenToGrid({ x: screenX, y: screenY });
    const token = d.getTokenAtPosition(grid.x, grid.y);
    if (token) {
      d.setContextMenu({ token, x: e.clientX, y: e.clientY });
      return;
    }
    d.setContextMenu(null);
    if (!d.wallMode && !d.fogMode) {
      const point = screenToMapPx(screenX, screenY);
      const door = d.wallSegments.find(
        (segment) =>
          (segment.type === "door-closed" ||
            segment.type === "door-open" ||
            segment.type === "door-locked") &&
          d.distToSegment(point.x, point.y, segment) <= 12 / d.mapControls.zoom,
      );
      if (door) d.setDoorContextMenu({ door, x: e.clientX, y: e.clientY });
    }
  };
  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleContextMenu,
  };
}
