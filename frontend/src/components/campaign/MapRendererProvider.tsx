import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react';
import { createMapCanvasRendererHost, type MapCanvasRendererHost } from '@/rendering';

const MapRendererHostContext = createContext<MapCanvasRendererHost | null>(null);

/** A trusted first-party module may install layers only through this lifecycle. */
export type MapRendererContribution = (host: MapCanvasRendererHost) => void | (() => void);

/**
 * Campaign-workspace owner for the map renderer extension host.
 *
 * A host is still deliberately scoped to one MapCanvas. CampaignPage currently
 * mounts one canvas, so this is the natural integration boundary for
 * extensions: descendants can use the host without threading a prop through
 * every campaign UI component.
 */
export function MapRendererProvider({ children }: { children: ReactNode }) {
  const hostRef = useRef<MapCanvasRendererHost | null>(null);
  if (hostRef.current === null) {
    hostRef.current = createMapCanvasRendererHost();
  }

  return (
    <MapRendererHostContext.Provider value={hostRef.current}>
      {children}
    </MapRendererHostContext.Provider>
  );
}

/** Returns the host for the current campaign map workspace, if one is mounted. */
export function useMapRendererHost(): MapCanvasRendererHost | null {
  return useContext(MapRendererHostContext);
}

/**
 * Controlled registration seam for first-party modules. The caller receives a
 * disposer and owns calling it on unmount; no renderer contribution is global.
 */
export function useMapRendererContributionRegistration(): (
  contribution: MapRendererContribution,
) => () => void {
  const host = useMapRendererHost();
  return useCallback((contribution: MapRendererContribution) => {
    if (!host) throw new Error('Map renderer contributions require a MapRendererProvider.');
    return contribution(host) ?? (() => {});
  }, [host]);
}
