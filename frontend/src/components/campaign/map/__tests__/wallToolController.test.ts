import { describe, expect, it } from 'vitest';
import { mergeableWallEndpoint, mergeWallEndpoint } from '../wallToolController';
import type { WallSegment } from '@/types/walls';

const walls: WallSegment[] = [
  { id: 'left', x1: 0, y1: 0, x2: 10, y2: 0, type: 'wall' },
  { id: 'right', x1: 10, y1: 0, x2: 20, y2: 0, type: 'wall' },
];

describe('wall tool controller', () => {
  it('only exposes endpoints that can be merged safely', () => {
    expect(mergeableWallEndpoint({ x: 10, y: 0 }, walls)).toEqual({ x: 10, y: 0 });
    expect(mergeableWallEndpoint({ x: 0, y: 0 }, walls)).toBeNull();
    expect(mergeableWallEndpoint({ x: 10, y: 0 }, [{ ...walls[1], type: 'door-closed' }, walls[0]])).toBeNull();
  });

  it('returns one deterministic replacement segment without mutating inputs', () => {
    expect(mergeWallEndpoint({ x: 10, y: 0 }, walls, () => 'merged')).toEqual([
      { id: 'merged', x1: 0, y1: 0, x2: 20, y2: 0, type: 'wall' },
    ]);
    expect(walls).toHaveLength(2);
  });
});
