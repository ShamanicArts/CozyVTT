import { OutboxPort } from "../../ports/DurableFoundations";

export interface OutboxConsumer {
  topic: string;
  consume(event: {
    id: string;
    topic: string;
    payload: unknown;
  }): Promise<void>;
}
export interface OutboxDispatcherOptions {
  batchSize?: number;
  leaseMs?: number;
  retryDelayMs?: number;
  maxAttempts?: number;
  pollMs?: number;
}

/** Worker-safe dispatcher. It is opt-in: application bootstrap must explicitly start it. */
export class OutboxDispatcher {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private readonly consumers = new Map<string, OutboxConsumer>();
  private readonly options: Required<OutboxDispatcherOptions>;
  constructor(
    private readonly outbox: OutboxPort,
    private readonly workerId: string,
    options: OutboxDispatcherOptions = {},
  ) {
    this.options = {
      batchSize: options.batchSize ?? 20,
      leaseMs: options.leaseMs ?? 30_000,
      retryDelayMs: options.retryDelayMs ?? 1_000,
      maxAttempts: options.maxAttempts ?? 8,
      pollMs: options.pollMs ?? 1_000,
    };
  }
  register(consumer: OutboxConsumer): void {
    this.consumers.set(consumer.topic, consumer);
  }
  async dispatchOnce(): Promise<number> {
    const now = new Date();
    const events = await this.outbox.claim(
      this.workerId,
      this.options.batchSize,
      new Date(now.getTime() + this.options.leaseMs),
      now,
    );
    for (const event of events) {
      const consumer = this.consumers.get(event.topic);
      try {
        if (!consumer)
          throw new Error(`No outbox consumer registered for ${event.topic}`);
        await consumer.consume(event);
        await this.outbox.markDelivered(event.id, event.claimToken);
      } catch (error) {
        await this.outbox.retry(
          event.id,
          event.claimToken,
          error instanceof Error ? error.message : "Unknown outbox error",
          new Date(Date.now() + this.options.retryDelayMs),
          event.attempts >= this.options.maxAttempts,
        );
      }
    }
    return events.length;
  }
  start(): void {
    if (this.timer) return;
    this.running = true;
    const tick = async () => {
      if (!this.running) return;
      try {
        await this.dispatchOnce();
      } catch {
        // A claim/store outage must not terminate the worker loop. Individual
        // event failures are already recorded by dispatchOnce.
      }
      if (this.running) this.timer = setTimeout(tick, this.options.pollMs);
    };
    void tick();
  }
  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
