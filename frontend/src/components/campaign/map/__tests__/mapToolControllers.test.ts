import { describe, expect, it } from 'vitest';
import {
  mergeableWallEndpoint,
  mergeWallEndpoint,
  nearestLight,
  placeLight,
  updateLightPosition,
} from '../mapToolControllers';
import type { WallSegment } from '@/types/walls';

describe('map tool controllers', () => {
  it('rounds placement/movement coordinates and chooses the nearest light in range', () => {
    const first = placeLight(10.6, 5.2, { brightRadius: 4, dimRadius: 8, color: '#fff' }, () => 'a');
    const second = { ...first, id: 'b', x: 20, y: 5 };
    expect(first).toMatchObject({ id: 'a', x: 11, y: 5, enabled: true });
    expect(nearestLight([first, second], 12, 5, 16)?.id).toBe('a');
    expect(updateLightPosition([first], 'a', 3.7, 4.4)[0]).toMatchObject({ x: 4, y: 4 });
  });

  it('merges exactly two compatible wall segments without mutating inputs', () => {
    const walls: WallSegment[] = [
      { id: 'left', x1: 0, y1: 0, x2: 10, y2: 0, type: 'wall' },
      { id: 'right', x1: 10, y1: 0, x2: 20, y2: 0, type: 'wall' },
    ];
    expect(mergeableWallEndpoint({ x: 10, y: 0 }, walls)).toEqual({ x: 10, y: 0 });
    expect(mergeableWallEndpoint({ x: 0, y: 0 }, walls)).toBeNull();
    expect(mergeableWallEndpoint({ x: 10, y: 0 }, [{ ...walls[1], type: 'door-closed' }, walls[0]])).toBeNull();
    expect(mergeWallEndpoint({ x: 10, y: 0 }, walls, () => 'merged')).toEqual([
      { id: 'merged', x1: 0, y1: 0, x2: 20, y2: 0, type: 'wall' },
    ]);
    expect(walls).toHaveLength(2);
  });
});
