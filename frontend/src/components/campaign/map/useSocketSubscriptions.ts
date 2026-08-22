import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';

type SocketSource = { getSocket: () => Socket | null } | null | undefined;

export interface SocketSubscription {
  event: string;
  handler: (...args: any[]) => void;
}

/**
 * Applies an event list as one lifecycle unit and returns an exact inverse.
 * Exported separately so socket ownership can be tested without rendering a
 * full campaign canvas.
 */
export function synchronizeSocketSubscriptions(
  socket: Socket | null,
  subscriptions: readonly SocketSubscription[],
): () => void {
  if (!socket) return () => {};
  for (const { event, handler } of subscriptions) socket.on(event, handler);
  return () => {
    for (const { event, handler } of subscriptions) socket.off(event, handler);
  };
}

/** Keeps a MapCanvas event group in sync with the active WebSocket client. */
export function useSocketSubscriptions(
  source: SocketSource,
  subscriptions: readonly SocketSubscription[],
  connectionRevision: unknown,
): void {
  useEffect(
    () => synchronizeSocketSubscriptions(source?.getSocket() ?? null, subscriptions),
    [source, subscriptions, connectionRevision],
  );
}
