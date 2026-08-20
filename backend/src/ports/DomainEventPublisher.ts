/** A fact that occurred in the domain and may be observed by adapters. */
export interface DomainEvent {
  readonly type: string;
  readonly occurredAt: Date;
}

/**
 * Event boundary. Implementations can bridge to Socket.IO, a queue, or an
 * outbox without making application commands depend on those transports.
 */
export interface DomainEventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
