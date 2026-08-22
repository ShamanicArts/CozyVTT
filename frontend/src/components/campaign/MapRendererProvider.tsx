import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  activateRendererContributions,
  createMapCanvasRendererHost,
  type MapCanvasRendererHost,
  type MapRendererModuleImporter,
} from "@/rendering";
import { api } from "@/services/api";
import type { ActiveExtensionRendererContribution } from "@/types/extensions";

interface MapRendererHostContextValue {
  readonly host: MapCanvasRendererHost;
  readonly revision: number;
}

const MapRendererHostContext =
  createContext<MapRendererHostContextValue | null>(null);
const loadProductionRendererContributions = async () =>
  (await api.listActiveExtensionContributions()).renderers;

/**
 * Campaign-workspace owner for the map renderer extension host.
 *
 * A host is still deliberately scoped to one MapCanvas. CampaignPage currently
 * mounts one canvas, so this is the natural integration boundary for
 * extensions: descendants can use the host without threading a prop through
 * every campaign UI component.
 */
export function MapRendererProvider({
  children,
  contributionLoader = loadProductionRendererContributions,
  moduleImporter,
}: {
  children: ReactNode;
  contributionLoader?: () => Promise<ActiveExtensionRendererContribution[]>;
  moduleImporter?: MapRendererModuleImporter;
}) {
  const hostRef = useRef<MapCanvasRendererHost | null>(null);
  if (hostRef.current === null) {
    hostRef.current = createMapCanvasRendererHost();
  }
  const [contributionRevision, setContributionRevision] = useState(0);
  const [hostRevision, setHostRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setContributionRevision((revision) => revision + 1);
    window.addEventListener("cozyvtt:extensions-changed", refresh);
    return () =>
      window.removeEventListener("cozyvtt:extensions-changed", refresh);
  }, []);

  useEffect(() => {
    let active = true;
    let dispose = () => {};
    contributionLoader()
      .then((contributions) =>
        activateRendererContributions(
          hostRef.current!,
          contributions,
          moduleImporter,
        ),
      )
      .then((cleanup) => {
        if (active) {
          dispose = cleanup;
          setHostRevision((revision) => revision + 1);
        } else cleanup();
      })
      .catch(() => {
        // Runtime contributions are optional; the built-in renderer remains.
      });
    return () => {
      active = false;
      dispose();
    };
  }, [contributionLoader, contributionRevision, moduleImporter]);

  return (
    <MapRendererHostContext.Provider
      value={{ host: hostRef.current, revision: hostRevision }}
    >
      {children}
    </MapRendererHostContext.Provider>
  );
}

/** Returns the host for the current campaign map workspace, if one is mounted. */
export function useMapRendererHost(): MapCanvasRendererHost | null {
  return useContext(MapRendererHostContext)?.host ?? null;
}
