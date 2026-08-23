import { describe, it, expect } from 'vitest';
import {
  coneApex,
  cubeRect,
  dominantAxis,
  lineOrigin,
  snapSpanCentre,
  snapToGridLine,
  snapToSquareCentre,
  squaresFor,
} from '../aoeGeometry';

const GRID = 50; // map pixels per square, matching the test instance's maps

/** True when a coordinate sits exactly on a grid line. */
const onGridLine = (v: number) => Math.abs(v / GRID - Math.round(v / GRID)) < 1e-9;

describe('squaresFor', () => {
  it('converts feet to squares', () => {
    expect(squaresFor(10, 5)).toBe(2);
    expect(squaresFor(20, 5)).toBe(4);
    expect(squaresFor(15, 5)).toBe(3);
  });

  it('handles a non-standard grid scale', () => {
    expect(squaresFor(10, 10)).toBe(1);
    expect(squaresFor(10, 2.5)).toBe(4);
  });

  it('is 0 rather than Infinity for a nonsensical scale', () => {
    expect(squaresFor(10, 0)).toBe(0);
  });
});

describe('snapping primitives', () => {
  it('snaps to the nearest grid line', () => {
    expect(snapToGridLine(24, GRID)).toBe(0);
    expect(snapToGridLine(26, GRID)).toBe(50);
    expect(snapToGridLine(74, GRID)).toBe(50);
  });

  it('snaps to the containing square centre', () => {
    expect(snapToSquareCentre(10, GRID)).toBe(25);
    expect(snapToSquareCentre(49, GRID)).toBe(25);
    expect(snapToSquareCentre(51, GRID)).toBe(75);
  });

  // The parity rule the whole fix rests on.
  it('centres an even span on a grid line', () => {
    expect(snapSpanCentre(60, GRID, 2)).toBe(50);
    expect(snapSpanCentre(60, GRID, 4)).toBe(50);
  });

  it('centres an odd span on a square centre', () => {
    expect(snapSpanCentre(60, GRID, 1)).toBe(75);
    expect(snapSpanCentre(60, GRID, 3)).toBe(75);
  });

  it('falls back to the square centre for a fractional span', () => {
    expect(snapSpanCentre(60, GRID, 1.5)).toBe(75);
  });
});

describe('cubeRect', () => {
  // The reported bug: a 10 ft cube on a 5 ft grid is exactly two squares, but
  // it was drawn from a square centre and so straddled four.
  it('covers exactly two squares for a 10 ft cube on a 5 ft grid', () => {
    const rect = cubeRect({ x: 137, y: 88 }, GRID, squaresFor(10, 5));

    expect(rect.size).toBe(2 * GRID);
    expect(onGridLine(rect.x)).toBe(true);
    expect(onGridLine(rect.y)).toBe(true);
  });

  it('puts every edge on a grid line, whatever the cursor position', () => {
    for (const side of [1, 2, 3, 4, 6]) {
      for (const cursor of [0, 7, 24, 25, 26, 49, 51, 99, 137, 260]) {
        const rect = cubeRect({ x: cursor, y: cursor }, GRID, side);

        expect(onGridLine(rect.x)).toBe(true);
        expect(onGridLine(rect.y)).toBe(true);
        expect(onGridLine(rect.x + rect.size)).toBe(true);
        expect(onGridLine(rect.y + rect.size)).toBe(true);
      }
    }
  });

  it('stays centred on the square under the cursor for an odd span', () => {
    // A 15 ft cube is three squares: it should cover the hovered square plus
    // one either side, not shift off to a corner.
    const rect = cubeRect({ x: 60, y: 60 }, GRID, 3);

    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
    expect(rect.size).toBe(150);
  });

  it('picks the nearer intersection for an even span', () => {
    expect(cubeRect({ x: 60, y: 60 }, GRID, 2).x).toBe(0);   // nearest line is 50
    expect(cubeRect({ x: 90, y: 90 }, GRID, 2).x).toBe(50);  // nearest line is 100
  });
});

describe('dominantAxis', () => {
  it('reads cardinal directions', () => {
    expect(dominantAxis(0)).toBe('x');
    expect(dominantAxis(Math.PI)).toBe('x');
    expect(dominantAxis(Math.PI / 2)).toBe('y');
    expect(dominantAxis(-Math.PI / 2)).toBe('y');
  });

  it('breaks a perfect diagonal consistently', () => {
    expect(dominantAxis(Math.PI / 4)).toBe('x');
  });
});

describe('lineOrigin', () => {
  // A 5 ft wide line is one square across, so its centre-line has to run along
  // a row of square centres for the line to cover whole squares.
  it('runs a 5 ft wide horizontal line along a row of squares', () => {
    const origin = lineOrigin({ x: 137, y: 88 }, GRID, squaresFor(5, 5), 0);

    expect(onGridLine(origin.x)).toBe(true);      // starts on a grid line
    expect(origin.y).toBe(75);                    // centred in the row
  });

  it('centres a 10 ft wide horizontal line on a grid line', () => {
    const origin = lineOrigin({ x: 137, y: 88 }, GRID, squaresFor(10, 5), 0);

    expect(onGridLine(origin.x)).toBe(true);
    expect(onGridLine(origin.y)).toBe(true);
  });

  it('swaps the axes for a vertical line', () => {
    const origin = lineOrigin({ x: 88, y: 137 }, GRID, squaresFor(5, 5), Math.PI / 2);

    expect(origin.x).toBe(75);                    // centred in the column
    expect(onGridLine(origin.y)).toBe(true);      // starts on a grid line
  });

  it('handles a line pointing left or up the same way', () => {
    const left = lineOrigin({ x: 137, y: 88 }, GRID, 1, Math.PI);
    expect(onGridLine(left.x)).toBe(true);
    expect(left.y).toBe(75);

    const up = lineOrigin({ x: 88, y: 137 }, GRID, 1, -Math.PI / 2);
    expect(up.x).toBe(75);
    expect(onGridLine(up.y)).toBe(true);
  });
});

describe('coneApex', () => {
  it('sits on the nearest grid intersection', () => {
    expect(coneApex({ x: 137, y: 88 }, GRID)).toEqual({ x: 150, y: 100 });
    expect(coneApex({ x: 24, y: 26 }, GRID)).toEqual({ x: 0, y: 50 });
  });

  it('always lands on grid lines', () => {
    for (const v of [0, 7, 24, 26, 51, 99, 260]) {
      const apex = coneApex({ x: v, y: v }, GRID);
      expect(onGridLine(apex.x)).toBe(true);
      expect(onGridLine(apex.y)).toBe(true);
    }
  });
});
