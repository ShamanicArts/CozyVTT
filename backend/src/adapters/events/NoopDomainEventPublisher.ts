import { DomainEvent, DomainEventPublisher } from '../../ports/DomainEventPublisher';

/**
 * Safe default while durable event delivery is introduced. Commands still
 * publish through the port, so replacing this adapter does not require route
 * or use-case changes.
 */
export class NoopDomainEventPublisher implements DomainEventPublisher {
  async publish(_event: DomainEvent): Promise<void> {
    // Intentionally empty: no event transport is configured in this deployment.
  }
}
