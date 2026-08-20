import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCanvasSurface } from '../useCanvasSurface';

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function SurfaceProbe() {
  const { containerRef, canvasSize } = useCanvasSurface();
  return <div ref={containerRef} data-testid="surface">{canvasSize.width}x{canvasSize.height}</div>;
}

afterEach(() => {
  ResizeObserverMock.instances = [];
  vi.unstubAllGlobals();
});

describe('useCanvasSurface', () => {
  it('measures the container and updates when its observer fires', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    const { unmount } = render(<SurfaceProbe />);
    const surface = screen.getByTestId('surface');
    vi.spyOn(surface, 'getBoundingClientRect')
      .mockReturnValueOnce({ width: 640, height: 480 } as DOMRect)
      .mockReturnValue({ width: 800, height: 600 } as DOMRect);

    // Re-trigger after installing the deterministic measurement mock.
    act(() => ResizeObserverMock.instances[0].trigger());
    expect(surface).toHaveTextContent('640x480');
    act(() => ResizeObserverMock.instances[0].trigger());
    expect(surface).toHaveTextContent('800x600');

    const observer = ResizeObserverMock.instances[0];
    unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });
});
