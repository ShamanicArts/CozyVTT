import { LayerRegistry } from './LayerRegistry';
import type {
  RendererContext,
  RendererContractVersion,
  RendererLayer,
  RendererLayerErrorHandler,
} from './contracts';

type Invalidate<Surface extends string> = (...surfaces: Surface[]) => void;

/**
 * Per-renderer lifecycle owner for a layer registry.
 *
 * A host is deliberately an instance, never a process-global registry: one
 * map canvas gets one host and therefore one extension lifecycle. Registering,
 * swapping, and removing layers automatically invalidates their surface while
 * the host is attached to a canvas.
 */
export class RendererHost<
  Context extends RendererContext,
  Surface extends string = string,
> {
  readonly registry: LayerRegistry<Context, Surface>;
  private invalidator: Invalidate<Surface> | null = null;

  constructor(
    contractVersion: RendererContractVersion,
    private readonly onLayerError?: RendererLayerErrorHandler<Context, Surface>,
  ) {
    this.registry = new LayerRegistry<Context, Surface>(contractVersion);
  }

  /**
   * Connects this host to one canvas's redraw scheduler. The returned cleanup
   * detaches only this binding, making host ownership safe across unmounts.
   */
  attach(invalidate: Invalidate<Surface>): () => void {
    if (this.invalidator !== null) {
      throw new Error('RendererHost is already attached to a canvas. Create one host per canvas instance.');
    }
    this.invalidator = invalidate;

    return () => {
      if (this.invalidator === invalidate) {
        this.invalidator = null;
      }
    };
  }

  register(layer: RendererLayer<Context, Surface>): () => void {
    const dispose = this.registry.register(layer);
    this.invalidate(layer.surface);
    return () => {
      const removed = this.registry.get(layer.id) === layer;
      dispose();
      if (removed) this.invalidate(layer.surface);
    };
  }

  unregister(id: string): boolean {
    const layer = this.registry.get(id);
    const removed = this.registry.unregister(id);
    if (removed && layer) this.invalidate(layer.surface);
    return removed;
  }

  swap(layer: RendererLayer<Context, Surface>): void {
    this.registry.swap(layer);
    this.invalidate(layer.surface);
  }

  /** Lets an extension redraw its own surface after its independent state changes. */
  invalidate(...surfaces: Surface[]): void {
    this.invalidator?.(...surfaces);
  }

  render(surface: Surface, context: Context, onLayerError?: RendererLayerErrorHandler<Context, Surface>): void {
    this.registry.render(surface, context, onLayerError ?? this.onLayerError);
  }
}
