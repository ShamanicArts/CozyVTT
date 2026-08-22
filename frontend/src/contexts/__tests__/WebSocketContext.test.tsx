import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const socketMock = vi.hoisted(() => {
  const socketHandlers = new Map<string, () => void>();
  const managerHandlers = new Map<string, () => void>();
  const socket = {
    connected: true,
    disconnect: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      socketHandlers.set(event, handler);
    }),
    io: {
      on: vi.fn((event: string, handler: () => void) => {
        managerHandlers.set(event, handler);
      }),
    },
  };
  return {
    client: {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      getSocket: vi.fn(() => socket),
      startHeartbeat: vi.fn(() => undefined),
    },
    managerHandlers,
  };
});

vi.mock('@/services/socket', () => ({ default: socketMock.client }));
vi.mock('@/services/api', () => ({ default: { pingSession: vi.fn() } }));

import { WebSocketProvider, useWebSocket } from '../WebSocketContext';

function Probe() {
  const { status, reconnectCount } = useWebSocket();
  return <output>{`${status}:${reconnectCount}`}</output>;
}

describe('WebSocketProvider', () => {
  it('tracks Socket.IO manager reconnection lifecycle events', async () => {
    render(
      <MemoryRouter initialEntries={['/campaign/campaign-1']}>
        <Routes>
          <Route
            path="/campaign/:id"
            element={
              <WebSocketProvider>
                <Probe />
              </WebSocketProvider>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('connected:0')).toBeInTheDocument());
    expect(socketMock.managerHandlers.has('reconnect_attempt')).toBe(true);
    expect(socketMock.managerHandlers.has('reconnect')).toBe(true);

    act(() => socketMock.managerHandlers.get('reconnect_attempt')?.());
    expect(screen.getByText('connecting:0')).toBeInTheDocument();
    act(() => socketMock.managerHandlers.get('reconnect')?.());
    expect(screen.getByText('connected:1')).toBeInTheDocument();
  });
});
