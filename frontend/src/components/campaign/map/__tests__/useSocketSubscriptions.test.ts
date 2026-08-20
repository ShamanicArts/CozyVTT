import { describe, expect, it, vi } from 'vitest';
import { synchronizeSocketSubscriptions } from '../useSocketSubscriptions';

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
});
