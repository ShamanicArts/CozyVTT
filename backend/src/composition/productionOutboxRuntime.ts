import type { PrismaClient } from "@prisma/client";
import {
  PrismaIdempotencyPort,
  PrismaOutboxPort,
} from "../adapters/persistence/PrismaDurableFoundations";
import { OutboxDispatcher } from "../application/events/OutboxDispatcher";
import logger from "../utils/logger";

export const APPLICATION_COMMAND_EXECUTED_V1 =
  "application.command.executed.v1";

export function createProductionOutboxDispatcher(
  prisma: PrismaClient,
): OutboxDispatcher {
  const dispatcher = new OutboxDispatcher(
    new PrismaOutboxPort(prisma),
    process.env.OUTBOX_WORKER_ID ?? `api-${process.pid}`,
    { batchSize: 20, pollMs: 1_000, retryDelayMs: 1_000, maxAttempts: 8 },
  );
  dispatcher.register({
    topic: APPLICATION_COMMAND_EXECUTED_V1,
    async consume(event) {
      const payload = event.payload as {
        commandId?: unknown;
        commandVersion?: unknown;
      };
      logger.info("application command delivered", {
        eventId: event.id,
        commandId:
          typeof payload.commandId === "string" ? payload.commandId : "unknown",
        commandVersion:
          typeof payload.commandVersion === "string"
            ? payload.commandVersion
            : "unknown",
      });
    },
  });
  return dispatcher;
}

export async function outboxHealth(
  prisma: PrismaClient,
): Promise<{ pending: number; deadLetter: number }> {
  const [pending, deadLetter] = await Promise.all([
    prisma.outboxEvent.count({
      where: { status: { in: ["PENDING", "CLAIMED"] } },
    }),
    prisma.outboxEvent.count({ where: { status: "DEAD_LETTER" } }),
  ]);
  return { pending, deadLetter };
}

export function startIdempotencyCleanup(prisma: PrismaClient): NodeJS.Timeout {
  const idempotency = new PrismaIdempotencyPort(prisma);
  const clean = () =>
    idempotency
      .cleanupExpired(new Date())
      .catch((error) =>
        logger.error("idempotency cleanup failed", {
          message: error instanceof Error ? error.message : "unknown",
        }),
      );
  void clean();
  const timer = setInterval(clean, 24 * 60 * 60 * 1_000);
  timer.unref();
  return timer;
}
