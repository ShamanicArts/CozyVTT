/**
 * DmToolPanelContainer
 * Draggable container that stacks DM tool panels (Fog, Walls, Lights)
 * vertically with no overlap. DM can drag the container header to
 * reposition it anywhere on the map canvas.
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
  type RefObject,
} from "react";

interface DmToolPanelContainerProps {
  children: ReactNode;
  /** Ref to the map container element — used to clamp drag position within bounds. */
  containerRef: RefObject<HTMLDivElement | null>;
}

export default function DmToolPanelContainer({
  children,
  containerRef,
}: DmToolPanelContainerProps) {
  // Position relative to the container's top-right corner (right, top offsets).
  // null = use default CSS position; set on first drag.
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const clampPosition = useCallback(
    (next: { x: number; y: number }) => {
      const container = containerRef.current;
      const panel = panelRef.current;
      if (!container || !panel) return next;
      return {
        x: Math.max(0, Math.min(next.x, container.clientWidth - panel.offsetWidth)),
        y: Math.max(0, Math.min(next.y, container.clientHeight - panel.offsetHeight)),
      };
    },
    [containerRef],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      setPosition((current) => (current ? clampPosition(current) : null));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [clampPosition, containerRef]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const panel = panelRef.current;
      const container = containerRef.current;
      if (!panel || !container) return;
      const rect = panel.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      // Keep dragged coordinates local to the map so workspace resizing moves
      // the overlay with its owning surface.
      const curX = position?.x ?? rect.left - containerRect.left;
      const curY = position?.y ?? rect.top - containerRect.top;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: curX,
        origY: curY,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [position],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const newX = dragRef.current.origX + dx;
      const newY = dragRef.current.origY + dy;

      setPosition(clampPosition({ x: newX, y: newY }));
    },
    [clampPosition],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Both default and dragged positions stay relative to the map container.
  const style: React.CSSProperties = position
    ? { position: "absolute", left: position.x, top: position.y, zIndex: 30 }
    : { position: "absolute", top: "3.5rem", right: "0.5rem", zIndex: 30 };

  return (
    <div
      ref={panelRef}
      style={{
        ...style,
        width: "min(200px, calc(100% - 1rem))",
        maxHeight: "calc(100% - 4rem)",
      }}
      className="hidden max-h-[calc(100vh-5rem)] flex-col gap-1.5 overflow-y-auto lg:flex"
    >
      {/* Drag handle */}
      <div
        className="flex items-center justify-center py-0.5 cursor-grab active:cursor-grabbing select-none rounded-t bg-stone-700/60 border border-stone-600/30 hover:bg-stone-700/80 transition-colors"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title="Drag to reposition panels"
      >
        <svg width="16" height="6" viewBox="0 0 16 6" className="opacity-40">
          <circle
            cx="4"
            cy="1.5"
            r="1.2"
            fill="currentColor"
            className="text-stone-400"
          />
          <circle
            cx="8"
            cy="1.5"
            r="1.2"
            fill="currentColor"
            className="text-stone-400"
          />
          <circle
            cx="12"
            cy="1.5"
            r="1.2"
            fill="currentColor"
            className="text-stone-400"
          />
          <circle
            cx="4"
            cy="4.5"
            r="1.2"
            fill="currentColor"
            className="text-stone-400"
          />
          <circle
            cx="8"
            cy="4.5"
            r="1.2"
            fill="currentColor"
            className="text-stone-400"
          />
          <circle
            cx="12"
            cy="4.5"
            r="1.2"
            fill="currentColor"
            className="text-stone-400"
          />
        </svg>
      </div>
      {children}
    </div>
  );
}
