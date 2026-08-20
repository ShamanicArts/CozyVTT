import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Owns the DOM surface shared by MapCanvas' three drawing layers.
 *
 * Sizing is intentionally CSS-pixel based: the individual drawing layers keep
 * their existing transforms and backing-store decisions. The observer catches
 * panel resizing, which does not reliably produce a window resize event.
 */
export function useCanvasSurface() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const terrainCanvasRef = useRef<HTMLCanvasElement>(null);
  const tokenCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const updateCanvasSize = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setCanvasSize({ width: rect.width, height: rect.height });
  }, []);

  useEffect(() => {
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    const container = containerRef.current;
    const observer = new ResizeObserver(updateCanvasSize);
    if (container) observer.observe(container);

    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      observer.disconnect();
    };
  }, [updateCanvasSize]);

  return {
    canvasRef,
    terrainCanvasRef,
    tokenCanvasRef,
    containerRef,
    layersRef,
    canvasSize,
  };
}
