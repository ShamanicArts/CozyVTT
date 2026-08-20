import { describe, expect, it, vi } from 'vitest';
import {
  LayerRegistry,
  RENDERER_CONTRACT_VERSION,
  RendererLayerRegistrationError,
  type RendererContext,
  type RendererLayer,
} from '..';

type Surface = 'terrain' | 'overlay';

interface TestContext extends RendererContext {
  readonly calls: string[];
}

const context = (): TestContext => ({
  contractVersion: RENDERER_CONTRACT_VERSION,
  calls: [],
});

function layer(
  id: string,
  surface: Surface,
  order = 0,
  render: (renderContext: TestContext) => void = (renderContext) => renderContext.calls.push(id),
): RendererLayer<TestContext, Surface> {
  return {
    id,
    surface,
    order,
    contractVersion: RENDERER_CONTRACT_VERSION,
    render,
  };
}

describe('LayerRegistry', () => {
  it('renders each surface by order, preserving registration order for ties', () => {
    const registry = new LayerRegistry<TestContext, Surface>(RENDERER_CONTRACT_VERSION);
    registry.register(layer('later', 'terrain', 10));
    registry.register(layer('first-tie', 'terrain', 0));
    registry.register(layer('second-tie', 'terrain', 0));
    registry.register(layer('overlay', 'overlay', -100));

    const renderContext = context();
    registry.render('terrain', renderContext);

    expect(renderContext.calls).toEqual(['first-tie', 'second-tie', 'later']);
  });

  it('supports runtime swap and makes stale disposers harmless', () => {
    const registry = new LayerRegistry<TestContext, Surface>(RENDERER_CONTRACT_VERSION);
    const disposeOriginal = registry.register(layer('tokens', 'terrain', 5));
    registry.swap(layer('tokens', 'terrain', 5, (renderContext) => renderContext.calls.push('replacement')));
    disposeOriginal();

    const renderContext = context();
    registry.render('terrain', renderContext);

    expect(renderContext.calls).toEqual(['replacement']);
    expect(registry.unregister('tokens')).toBe(true);
    expect(registry.unregister('tokens')).toBe(false);
  });

  it('rejects malformed, duplicate, and incompatible layers before rendering', () => {
    const registry = new LayerRegistry<TestContext, Surface>(RENDERER_CONTRACT_VERSION);
    registry.register(layer('terrain', 'terrain'));

    expect(() => registry.register(layer('terrain', 'terrain'))).toThrow(RendererLayerRegistrationError);
    expect(() => registry.register({ ...layer('wrong-version', 'terrain'), contractVersion: '2.0.0' })).toThrow(RendererLayerRegistrationError);
    expect(() => registry.register(layer('not-a-number', 'terrain', Number.NaN))).toThrow(RendererLayerRegistrationError);
  });

  it('isolates a failing extension when the host supplies an error handler', () => {
    const registry = new LayerRegistry<TestContext, Surface>(RENDERER_CONTRACT_VERSION);
    registry.register(layer('bad', 'terrain', 0, () => { throw new Error('boom'); }));
    registry.register(layer('healthy', 'terrain', 1));
    const onLayerError = vi.fn();
    const renderContext = context();

    registry.render('terrain', renderContext, onLayerError);

    expect(onLayerError).toHaveBeenCalledTimes(1);
    expect(renderContext.calls).toEqual(['healthy']);
  });

  it('keeps a swapped layer in place unless its new order is explicit', () => {
    const registry = new LayerRegistry<TestContext, Surface>(RENDERER_CONTRACT_VERSION);
    registry.register(layer('first', 'terrain', 5));
    registry.register(layer('second', 'terrain', 10));
    registry.swap({
      ...layer('first', 'terrain'),
      render: (renderContext) => renderContext.calls.push('replacement'),
    });

    const renderContext = context();
    registry.render('terrain', renderContext);

    expect(renderContext.calls).toEqual(['replacement', 'second']);
  });
});
