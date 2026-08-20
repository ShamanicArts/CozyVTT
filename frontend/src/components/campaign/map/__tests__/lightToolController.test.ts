import { describe, expect, it } from 'vitest';
import { nearestLight, placeLight, updateLightPosition } from '../lightToolController';

describe('light tool controller', () => {
  it('rounds placement/movement coordinates and chooses the nearest light in range', () => {
    const first = placeLight(10.6, 5.2, { brightRadius: 4, dimRadius: 8, color: '#fff' }, () => 'a');
    const second = { ...first, id: 'b', x: 20, y: 5 };
    expect(first).toMatchObject({ id: 'a', x: 11, y: 5, enabled: true });
    expect(nearestLight([first, second], 12, 5, 16)?.id).toBe('a');
    expect(updateLightPosition([first], 'a', 3.7, 4.4)[0]).toMatchObject({ x: 4, y: 4 });
  });
});
