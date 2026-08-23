import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DmToolPanelContainer from "../DmToolPanelContainer";

class ResizeObserverMock {
  static callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    ResizeObserverMock.callback = callback;
  }

  observe() {}
  disconnect() {}
}

describe("DmToolPanelContainer", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps dragged tools map-relative and reclamps them when the rail resizes", () => {
    const containerRef = createRef<HTMLDivElement>();
    render(
      <div ref={containerRef}>
        <DmToolPanelContainer containerRef={containerRef}>
          <div>Tools</div>
        </DmToolPanelContainer>
      </div>,
    );

    const handle = screen.getByTitle("Drag to reposition panels");
    const panel = handle.parentElement!;
    Object.defineProperties(containerRef.current!, {
      clientWidth: { configurable: true, value: 400 },
      clientHeight: { configurable: true, value: 600 },
    });
    Object.defineProperties(panel, {
      offsetWidth: { configurable: true, value: 200 },
      offsetHeight: { configurable: true, value: 300 },
    });
    containerRef.current!.getBoundingClientRect = () =>
      ({ left: 100, top: 50, right: 500, bottom: 650, width: 400, height: 600 }) as DOMRect;
    panel.getBoundingClientRect = () =>
      ({ left: 300, top: 100, right: 500, bottom: 400, width: 200, height: 300 }) as DOMRect;

    fireEvent.pointerDown(handle, { clientX: 310, clientY: 110, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 360, clientY: 110, pointerId: 1 });

    expect(panel.style.position).toBe("absolute");
    expect(panel.style.left).toBe("200px");

    Object.defineProperty(containerRef.current!, "clientWidth", {
      configurable: true,
      value: 150,
    });
    act(() => ResizeObserverMock.callback([], {} as ResizeObserver));
    expect(panel.style.left).toBe("0px");
  });
});
