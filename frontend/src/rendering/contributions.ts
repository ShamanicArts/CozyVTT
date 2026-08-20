import type { ActiveExtensionRendererContribution } from "@/types/extensions";
import {
  type MapCanvasRendererContext,
  type MapCanvasRendererHost,
  type MapCanvasRenderSurface,
} from "./mapCanvas";
import { RENDERER_CONTRACT_VERSION } from "./contracts";

export interface MapRendererPluginLayer {
  readonly id: string;
  readonly surface: MapCanvasRenderSurface;
  readonly order?: number;
  readonly render: (context: MapCanvasRendererContext) => void;
}

export interface MapRendererPluginApi {
  readonly contractVersion: typeof RENDERER_CONTRACT_VERSION;
  registerLayer(layer: MapRendererPluginLayer): () => void;
  replaceLayer(
    targetId: string,
    layer: Omit<MapRendererPluginLayer, "id">,
  ): () => void;
  invalidate(...surfaces: MapCanvasRenderSurface[]): void;
}

export type MapRendererModuleImporter = (url: string) => Promise<unknown>;

const runtimeImport: MapRendererModuleImporter = (url) =>
  import(/* @vite-ignore */ url) as Promise<unknown>;

/**
 * Loads active, operator-reviewed browser modules and owns every layer they
 * register. Deactivation or campaign unmount disposes only those exact layers.
 */
export async function activateRendererContributions(
  host: MapCanvasRendererHost,
  contributions: readonly ActiveExtensionRendererContribution[],
  importer: MapRendererModuleImporter = runtimeImport,
): Promise<() => void> {
  const disposers: Array<() => void> = [];
  for (const contribution of contributions) {
    if (contribution.renderer.contractVersion !== RENDERER_CONTRACT_VERSION)
      continue;
    try {
      const imported = await importer(contribution.renderer.moduleUrl);
      const activate = readActivator(imported);
      const owned = createOwnedApi(
        host,
        contribution.extensionId,
        contribution.renderer.id,
        disposers,
      );
      const dispose = await activate(owned);
      if (typeof dispose === "function" && !disposers.includes(dispose))
        disposers.push(dispose);
    } catch (error) {
      console.error(
        `[CozyVTT renderer] Could not activate ${contribution.extensionId}/${contribution.renderer.id}.`,
        error,
      );
    }
  }
  return () => {
    for (const dispose of disposers.reverse()) {
      try {
        dispose();
      } catch (error) {
        console.error("[CozyVTT renderer] Contribution cleanup failed.", error);
      }
    }
  };
}

function createOwnedApi(
  host: MapCanvasRendererHost,
  extensionId: string,
  rendererId: string,
  disposers: Array<() => void>,
): MapRendererPluginApi {
  const qualify = (id: string) => {
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) {
      throw new Error("Renderer layer ids must be lowercase kebab-case.");
    }
    return `${extensionId}.${rendererId}.${id}`;
  };
  return {
    contractVersion: RENDERER_CONTRACT_VERSION,
    registerLayer: (layer) => {
      const dispose = host.register({
        ...layer,
        id: qualify(layer.id),
        contractVersion: RENDERER_CONTRACT_VERSION,
      });
      disposers.push(dispose);
      return dispose;
    },
    replaceLayer: (targetId, layer) => {
      const previous = host.registry.get(targetId);
      if (!previous)
        throw new Error(`Renderer layer "${targetId}" is not available.`);
      const replacement = {
        ...layer,
        id: targetId,
        contractVersion: RENDERER_CONTRACT_VERSION,
      };
      host.swap(replacement);
      const dispose = () => {
        if (host.registry.get(targetId) === replacement) host.swap(previous);
      };
      disposers.push(dispose);
      return dispose;
    },
    invalidate: (...surfaces) => host.invalidate(...surfaces),
  };
}

function readActivator(
  imported: unknown,
): (
  api: MapRendererPluginApi,
) => void | (() => void) | Promise<void | (() => void)> {
  if (typeof imported !== "object" || imported === null) {
    throw new Error("Renderer module must export activateMapRenderer.");
  }
  const candidate = imported as Record<string, unknown>;
  const value =
    candidate.activateMapRenderer ??
    (typeof candidate.default === "object" && candidate.default !== null
      ? (candidate.default as Record<string, unknown>).activateMapRenderer
      : candidate.default);
  if (typeof value !== "function") {
    throw new Error("Renderer module must export activateMapRenderer.");
  }
  return value as (
    api: MapRendererPluginApi,
  ) => void | (() => void) | Promise<void | (() => void)>;
}
