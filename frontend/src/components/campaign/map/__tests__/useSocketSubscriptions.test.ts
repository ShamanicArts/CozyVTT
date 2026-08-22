import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  synchronizeSocketSubscriptions,
  useSocketSubscriptions,
} from '../useSocketSubscriptions';

describe('synchronizeSocketSubscriptions', () => {
  it('registers every handler and removes the same handlers during cleanup', () => {
    const socket = {
      on: vi.fn(),
      off: vi.fn(),
    };
    const moved = vi.fn();
    const changed = vi.fn();

    const cleanup = synchronizeSocketSubscriptions(socket as never, [
      { event: 'token.moved', handler: moved },
      { event: 'map.changed', handler: changed },
    ]);

    expect(socket.on).toHaveBeenNthCalledWith(1, 'token.moved', moved);
    expect(socket.on).toHaveBeenNthCalledWith(2, 'map.changed', changed);

    cleanup();
    expect(socket.off).toHaveBeenNthCalledWith(1, 'token.moved', moved);
    expect(socket.off).toHaveBeenNthCalledWith(2, 'map.changed', changed);
  });

  it('is a safe no-op while no socket is connected', () => {
    expect(() => synchronizeSocketSubscriptions(null, [{ event: 'ignored', handler: vi.fn() }])()).not.toThrow();
  });

  it('registers when a stable source receives a socket and replaces it on reconnect', () => {
    const first = { on: vi.fn(), off: vi.fn() };
    const second = { on: vi.fn(), off: vi.fn() };
    let active: typeof first | null = null;
    const source = { getSocket: () => active as never };
    const handler = vi.fn();
    const subscriptions = [{ event: 'map.changed', handler }];
    const { rerender, unmount } = renderHook(
      ({ revision }) =>
        useSocketSubscriptions(source, subscriptions, revision),
      { initialProps: { revision: 0 } },
    );

    active = first;
    rerender({ revision: 1 });
    expect(first.on).toHaveBeenCalledWith('map.changed', handler);

    active = second;
    rerender({ revision: 2 });
    expect(first.off).toHaveBeenCalledWith('map.changed', handler);
    expect(second.on).toHaveBeenCalledWith('map.changed', handler);

    unmount();
    expect(second.off).toHaveBeenCalledWith('map.changed', handler);
  });
});
