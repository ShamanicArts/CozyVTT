import { describe, expect, it, vi } from 'vitest';
import {
  RENDERER_CONTRACT_VERSION,
  RendererHost,
  createMapCanvasRendererHost,
  type RendererContext,
  type RendererLayer,
} from '..';

type Surface = 'terrain' | 'overlay';
interface TestContext extends RendererContext {}

function layer(id: string, surface: Surface): RendererLayer<TestContext, Surface> {
  return {
    id,
    surface,
    contractVersion: RENDERER_CONTRACT_VERSION,
    render: () => {},
  };
}

describe('RendererHost', () => {
  it('creates independent MapCanvas hosts with the default extension points', () => {
    const first = createMapCanvasRendererHost();
    const second = createMapCanvasRendererHost();

    expect(first.registry.list().map(({ id }) => id)).toEqual([
      'cozyvtt.map.terrain',
      'cozyvtt.map.tokens',
      'cozyvtt.map.overlay',
    ]);
    first.register({
      id: 'extension',
      surface: 'overlay',
      contractVersion: RENDERER_CONTRACT_VERSION,
      render: () => {},
    });
    expect(second.registry.get('extension')).toBeUndefined();
  });

  it('invalidates runtime changes only while attached and cleans up per-canvas ownership', () => {
    const host = new RendererHost<TestContext, Surface>(RENDERER_CONTRACT_VERSION);
    const invalidate = vi.fn();
    const detach = host.attach(invalidate);
    const added = layer('extension', 'overlay');
    const dispose = host.register(added);

    expect(invalidate).toHaveBeenLastCalledWith('overlay');
    host.swap({ ...added, render: () => {} });
    expect(invalidate).toHaveBeenLastCalledWith('overlay');
    dispose();
    expect(invalidate).toHaveBeenLastCalledWith('overlay');

    detach();
    host.register(layer('after-unmount', 'terrain'));
    // The original disposer belongs to the pre-swap registration, so it must
    // not remove or invalidate the replacement.
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it('does not let a host bind to two canvases at once', () => {
    const host = new RendererHost<TestContext, Surface>(RENDERER_CONTRACT_VERSION);
    const detach = host.attach(() => {});

    expect(() => host.attach(() => {})).toThrow('already attached');
    detach();
    expect(() => host.attach(() => {})).not.toThrow();
  });

  it('contains a failed layer with its host-level error boundary', () => {
    const onLayerError = vi.fn();
    const host = new RendererHost<TestContext, Surface>(RENDERER_CONTRACT_VERSION, onLayerError);
    host.register({
      ...layer('broken', 'terrain'),
      render: () => { throw new Error('extension failure'); },
    });
    const healthy = vi.fn();
    host.register({ ...layer('healthy', 'terrain'), render: healthy });

    host.render('terrain', { contractVersion: RENDERER_CONTRACT_VERSION });

    expect(onLayerError).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
  });
});
