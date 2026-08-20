import { act, render } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRenderLoop, type MapLayer } from '../useRenderLoop';

function LoopProbe({ onReady, draw }: {
  onReady: (markDirty: (...layers: MapLayer[]) => void) => void;
  draw: (layer: MapLayer) => void;
}) {
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const { markDirty } = useRenderLoop(drawRef);
  useEffect(() => onReady(markDirty), [markDirty, onReady]);
  return null;
}

afterEach(() => vi.unstubAllGlobals());

describe('useRenderLoop', () => {
  it('coalesces invalidations into one ordered animation frame', () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const draw = vi.fn();
    let markDirty!: (...layers: MapLayer[]) => void;
    render(<LoopProbe draw={draw} onReady={(mark) => { markDirty = mark; }} />);

    act(() => {
      markDirty('overlay');
      markDirty('tokens');
    });
    expect(requestAnimationFrame).toHaveBeenCalledOnce();

    act(() => frame?.(0));
    expect(draw.mock.calls.map(([layer]) => layer)).toEqual(['terrain', 'tokens', 'overlay']);
  });

  it('cancels a pending draw when the canvas unmounts', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    let markDirty!: (...layers: MapLayer[]) => void;
    const { unmount } = render(<LoopProbe draw={vi.fn()} onReady={(mark) => { markDirty = mark; }} />);
    act(() => markDirty('tokens'));
    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
  });
});
