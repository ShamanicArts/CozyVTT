import type { WallSegment } from '@/types/walls';

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

/** Returns an endpoint only when exactly two compatible segments can be merged. */
export function mergeableWallEndpoint(
  endpoint: WallPoint | null,
  segments: readonly WallSegment[],
): WallPoint | null {
  if (!endpoint) return null;
  const touching = segments.filter((segment) => touches(segment, endpoint));
  return touching.length === 2 && touching[0]?.type === touching[1]?.type ? endpoint : null;
}

/**
 * Joins the two same-type segments that meet at an endpoint. The controller is
 * pure: persistence, undo history, and socket fan-out stay at the adapter.
 */
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
