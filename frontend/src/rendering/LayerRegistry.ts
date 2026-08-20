import type {
  RendererContext,
  RendererContractVersion,
  RendererLayer,
  RendererLayerErrorHandler,
} from './contracts';

interface RegisteredLayer<Context extends RendererContext, Surface extends string> {
  readonly layer: RendererLayer<Context, Surface>;
  /** Stable tie-breaker for layers with the same explicit order. */
  readonly sequence: number;
}

/** Thrown before an incompatible or malformed layer can reach the render loop. */
export class RendererLayerRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RendererLayerRegistrationError';
  }
}

/**
 * Ordered runtime registry for renderer layers.
 *
 * Registration and replacement are atomic from the renderer's point of view:
 * `render` always works from a sorted snapshot. Layers may therefore safely
 * register, unregister, or swap other layers from callbacks without mutating
 * the frame currently being rendered.
 */
export class LayerRegistry<
  Context extends RendererContext,
  Surface extends string = string,
> {
  private readonly layers = new Map<string, RegisteredLayer<Context, Surface>>();
  private nextSequence = 0;

  constructor(readonly contractVersion: RendererContractVersion) {}

  /**
   * Adds a new layer and returns an ownership-safe disposer. The disposer only
   * removes the exact registration it created, never a later swap of that id.
   */
  register(layer: RendererLayer<Context, Surface>): () => void {
    this.validateLayer(layer);
    if (this.layers.has(layer.id)) {
      throw new RendererLayerRegistrationError(`Renderer layer "${layer.id}" is already registered.`);
    }

    const registered: RegisteredLayer<Context, Surface> = {
      layer,
      sequence: this.nextSequence++,
    };
    this.layers.set(layer.id, registered);

    return () => {
      if (this.layers.get(layer.id) === registered) {
        this.layers.delete(layer.id);
      }
    };
  }

  /** Removes a layer by id and reports whether it was present. */
  unregister(id: string): boolean {
    return this.layers.delete(id);
  }

  /**
   * Atomically replaces a registered layer while retaining its tie-breaker.
   * The id is intentionally stable: callers may safely retain references to
   * a named extension point while replacing its implementation at runtime.
   */
  swap(layer: RendererLayer<Context, Surface>): void {
    this.validateLayer(layer);
    const previous = this.layers.get(layer.id);
    if (!previous) {
      throw new RendererLayerRegistrationError(`Renderer layer "${layer.id}" is not registered and cannot be swapped.`);
    }

    // A swap is commonly about behavior, not placement. Preserve the existing
    // order unless the replacement deliberately supplies a new one.
    const replacement = layer.order === undefined && previous.layer.order !== undefined
      ? { ...layer, order: previous.layer.order }
      : layer;
    this.layers.set(layer.id, {
      layer: replacement,
      sequence: previous.sequence,
    });
  }

  get(id: string): RendererLayer<Context, Surface> | undefined {
    return this.layers.get(id)?.layer;
  }

  /** Returns a deterministic snapshot, optionally filtered to one surface. */
  list(surface?: Surface): ReadonlyArray<RendererLayer<Context, Surface>> {
    return this.sortedSnapshot(surface).map(({ layer }) => layer);
  }

  /** Runs every layer on a surface in deterministic order. */
  render(surface: Surface, context: Context, onLayerError?: RendererLayerErrorHandler<Context, Surface>): void {
    if (context.contractVersion !== this.contractVersion) {
      throw new RendererLayerRegistrationError(
        `Render context contract ${context.contractVersion} does not match registry contract ${this.contractVersion}.`,
      );
    }

    for (const { layer } of this.sortedSnapshot(surface)) {
      try {
        layer.render(context);
      } catch (error) {
        if (!onLayerError) throw error;
        onLayerError({ error, layer, context });
      }
    }
  }

  private sortedSnapshot(surface?: Surface): RegisteredLayer<Context, Surface>[] {
    return [...this.layers.values()]
      .filter(({ layer }) => surface === undefined || layer.surface === surface)
      .sort((a, b) => (a.layer.order ?? 0) - (b.layer.order ?? 0) || a.sequence - b.sequence);
  }

  private validateLayer(layer: RendererLayer<Context, Surface>): void {
    if (!layer.id.trim()) {
      throw new RendererLayerRegistrationError('Renderer layers require a non-empty id.');
    }
    if (layer.contractVersion !== this.contractVersion) {
      throw new RendererLayerRegistrationError(
        `Renderer layer "${layer.id}" targets contract ${layer.contractVersion}, but this registry supports ${this.contractVersion}.`,
      );
    }
    if (!Number.isFinite(layer.order ?? 0)) {
      throw new RendererLayerRegistrationError(`Renderer layer "${layer.id}" has a non-finite order.`);
    }
  }
}
