import type { FogState, LightSource, WallSegment } from '@/types/walls';

export function revealAllFog(state: FogState | null): FogState | null {
  return state ? { ...state, revealed: new Array(state.revealed.length).fill(true) } : state;
}

export function hideAllFog(state: FogState | null): FogState | null {
  return state ? { ...state, revealed: new Array(state.revealed.length).fill(false) } : state;
}

export function placeLight(
  x: number,
  y: number,
  defaults: Pick<LightSource, 'brightRadius' | 'dimRadius' | 'color'>,
  id: () => string,
): LightSource {
  return {
    id: id(), x: Math.round(x), y: Math.round(y),
    brightRadius: defaults.brightRadius, dimRadius: defaults.dimRadius,
    color: defaults.color, enabled: true,
  };
}

export function updateLightPosition(lights: readonly LightSource[], id: string, x: number, y: number): LightSource[] {
  return lights.map((light) => light.id === id ? { ...light, x: Math.round(x), y: Math.round(y) } : light);
}

export function nearestLight(lights: readonly LightSource[], x: number, y: number, radius: number): LightSource | null {
  let closest: LightSource | null = null;
  let closestDistance = Infinity;
  for (const light of lights) {
    const distance = Math.hypot(x - light.x, y - light.y);
    if (distance <= radius && distance < closestDistance) {
      closest = light;
      closestDistance = distance;
    }
  }
  return closest;
}

export interface WallPoint {
  x: number;
  y: number;
}

function touches(segment: WallSegment, point: WallPoint): boolean {
  return (
    (Math.round(segment.x1) === point.x && Math.round(segment.y1) === point.y)
    || (Math.round(segment.x2) === point.x && Math.round(segment.y2) === point.y)
  );
}

export function mergeableWallEndpoint(
  endpoint: WallPoint | null,
  segments: readonly WallSegment[],
): WallPoint | null {
  if (!endpoint) return null;
  const touching = segments.filter((segment) => touches(segment, endpoint));
  return touching.length === 2 && touching[0]?.type === touching[1]?.type ? endpoint : null;
}

export function mergeWallEndpoint(
  endpoint: WallPoint,
  segments: readonly WallSegment[],
  id: () => string,
): WallSegment[] | null {
  const touching = segments.flatMap((segment) => {
    const ends: Array<'start' | 'end'> = [];
    if (Math.round(segment.x1) === endpoint.x && Math.round(segment.y1) === endpoint.y) ends.push('start');
    if (Math.round(segment.x2) === endpoint.x && Math.round(segment.y2) === endpoint.y) ends.push('end');
    return ends.map((end) => ({ segment, end }));
  });
  if (touching.length !== 2) return null;

  const [first, second] = touching;
  if (!first || !second || first.segment.type !== second.segment.type) return null;
  const firstOuter = first.end === 'start'
    ? { x: first.segment.x2, y: first.segment.y2 }
    : { x: first.segment.x1, y: first.segment.y1 };
  const secondOuter = second.end === 'start'
    ? { x: second.segment.x2, y: second.segment.y2 }
    : { x: second.segment.x1, y: second.segment.y1 };
  const removeIds = new Set([first.segment.id, second.segment.id]);
  return segments.filter((segment) => !removeIds.has(segment.id)).concat({
    id: id(),
    x1: Math.round(firstOuter.x), y1: Math.round(firstOuter.y),
    x2: Math.round(secondOuter.x), y2: Math.round(secondOuter.y),
    type: first.segment.type,
  });
}
