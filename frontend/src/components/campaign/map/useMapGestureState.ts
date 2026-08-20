import { useRef } from 'react';
import type { LightSource, WallSegment } from '@/types/walls';

type MapPoint = { x: number; y: number };
type WallEndpointTarget = { segId: string; end: 'start' | 'end' };

export interface WallEndpointDrag {
  targets: WallEndpointTarget[];
  point: MapPoint;
  preDragState: WallSegment[] | null;
  hasDragged: boolean;
}

/**
 * Mutable interaction state for the map tools.
 *
 * These values intentionally live outside React state: they update on every
 * pointer move and are read by the renderer/event handlers without causing a
 * component re-render. Visible state remains owned by MapCanvas.
 */
export function useMapGestureState() {
  return {
    rightPanActiveRef: useRef(false),
    wallEraseBrushActiveRef: useRef(false),
    wallErasedIdsRef: useRef<Set<string>>(new Set()),
    wallBrushActiveRef: useRef(false),
    wallBrushPointsRef: useRef<MapPoint[]>([]),
    wallDragEndpointRef: useRef<WallEndpointDrag | null>(null),
    draggingLightRef: useRef<{ id: string; startX: number; startY: number } | null>(null),
    fogPendingCellsRef: useRef<Set<number>>(new Set()),
    fogFlushTimerRef: useRef<ReturnType<typeof setInterval> | null>(null),
    hoverMapPxRef: useRef<MapPoint | null>(null),
    lastMoveEmitRef: useRef(0),
    lightSourcesRef: useRef<LightSource[]>([]),
  };
}
