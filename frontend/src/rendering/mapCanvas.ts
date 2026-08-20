import type { Map as CampaignMap } from '@/types';
import type { Viewport } from '@/components/campaign/map/layers';
import { RENDERER_CONTRACT_VERSION, type RendererContext } from './contracts';
import { RendererHost } from './RendererHost';

/** The stable extension surfaces exposed by MapCanvas. */
export type MapCanvasRenderSurface = 'terrain' | 'tokens' | 'overlay';

/**
 * Public, per-frame context for MapCanvas renderer extensions.
 *
 * Layers run after the default layer for their surface unless they use `swap`
 * to replace it. `withWorldTransform` supplies the current pan/zoom safely;
 * direct drawing through `context` is screen-space.
 */
export interface MapCanvasRendererContext extends RendererContext {
  readonly surface: MapCanvasRenderSurface;
  readonly canvas: HTMLCanvasElement | null;
  readonly context: CanvasRenderingContext2D | null;
  readonly map: CampaignMap | null;
  readonly viewport: Viewport | null;
  readonly isDM: boolean;
  readonly withWorldTransform: (draw: () => void) => void;
  /** Default implementation extension points; primarily useful with `swap`. */
  readonly drawTerrain: () => void;
  readonly drawTokens: () => void;
  readonly drawOverlay: () => void;
}

export type MapCanvasRendererHost = RendererHost<MapCanvasRendererContext, MapCanvasRenderSurface>;

/**
 * Creates a fresh host for exactly one MapCanvas. Pass it through the
 * `rendererHost` prop, then retain the returned instance in the integration
 * layer that owns that canvas and its extensions.
 */
export function createMapCanvasRendererHost(): MapCanvasRendererHost {
  const host = new RendererHost<MapCanvasRendererContext, MapCanvasRenderSurface>(
    RENDERER_CONTRACT_VERSION,
    ({ error, layer }) => {
      // A third-party layer must not prevent the base VTT layers (or another
      // extension) from drawing. Keep the failure visible to developers while
      // allowing the registry to continue with the rest of the frame.
      console.error(`[CozyVTT renderer] Layer "${layer.id}" failed on ${layer.surface}.`, error);
    },
  );
  // Preserve CozyVTT's existing, tested canvas stack. Third parties can add a
  // higher/lower ordered layer or swap one of these stable ids at runtime.
  host.register({
    id: 'cozyvtt.map.terrain',
    contractVersion: RENDERER_CONTRACT_VERSION,
    surface: 'terrain',
    render: ({ drawTerrain }) => drawTerrain(),
  });
  host.register({
    id: 'cozyvtt.map.tokens',
    contractVersion: RENDERER_CONTRACT_VERSION,
    surface: 'tokens',
    render: ({ drawTokens }) => drawTokens(),
  });
  host.register({
    id: 'cozyvtt.map.overlay',
    contractVersion: RENDERER_CONTRACT_VERSION,
    surface: 'overlay',
    render: ({ drawOverlay }) => drawOverlay(),
  });
  return host;
}
