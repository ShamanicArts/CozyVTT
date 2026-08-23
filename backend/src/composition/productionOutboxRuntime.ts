import type { PrismaClient } from "@prisma/client";
import {
  PrismaIdempotencyPort,
  PrismaOutboxPort,
} from "../adapters/persistence/PrismaDurableFoundations";
import { OutboxDispatcher } from "../application/events/OutboxDispatcher";
import logger from "../utils/logger";
import { findCoreCapabilityCommand } from "../application/capabilities/CoreCapabilityCatalog";
import {
  PUBLIC_ROLL_AS_ACTOR,
  PUBLIC_SPEAK_AS_ACTOR,
} from "../application/capabilities/CapabilityGameplayCommands";
import {
  PUBLIC_END_SESSION,
  PUBLIC_PAUSE_SESSION,
  PUBLIC_RESUME_SESSION,
  PUBLIC_START_SESSION,
} from "../application/capabilities/CapabilityGmCommands";
import { PUBLIC_PUBLISH_CAMPAIGN_ACTIVITY } from "../application/capabilities/CampaignActivityCommands";
import { getSocketInstance } from "../websocket/socketInstance";

export const APPLICATION_COMMAND_EXECUTED_V1 =
  "application.command.executed.v1";

const commandsWithOwnActivity = new Set<string>([
  PUBLIC_SPEAK_AS_ACTOR,
  PUBLIC_ROLL_AS_ACTOR,
  PUBLIC_START_SESSION,
  PUBLIC_PAUSE_SESSION,
  PUBLIC_RESUME_SESSION,
  PUBLIC_END_SESSION,
  PUBLIC_PUBLISH_CAMPAIGN_ACTIVITY,
]);

function commandActivityKind(commandId: string) {
  if (commandId.startsWith("vtt.session.")) return "session";
  if (
    commandId.startsWith("vtt.map.") ||
    commandId.startsWith("vtt.scene.") ||
    commandId.startsWith("vtt.atmosphere.") ||
    commandId.startsWith("vtt.campaign.vibe") ||
    commandId === "map.import-remote"
  ) {
    return "scene";
  }
  return "mechanic";
}

async function publishCommandActivity(
  prisma: PrismaClient,
  eventId: string,
  payload: {
    commandId: string;
    campaignId: string;
    extensionId: string;
  },
): Promise<void> {
  if (commandsWithOwnActivity.has(payload.commandId)) return;
  if (await prisma.message.findUnique({ where: { id: eventId }, select: { id: true } })) {
    return;
  }
  const descriptor = findCoreCapabilityCommand(payload.commandId);
  const title = descriptor?.title ?? payload.commandId;
  const content = `${payload.extensionId}: ${title}.`;
  const metadata = {
    action: "application.command.executed",
    activity: {
      version: 1,
      kind: commandActivityKind(payload.commandId),
      importance: "consequential",
      source: "extension",
      extensionId: payload.extensionId,
      eventType: payload.commandId,
      commandId: payload.commandId,
    },
  };
  const message = await prisma.message.create({
    data: {
      id: eventId,
      campaignId: payload.campaignId,
      userId: null,
      type: "SYSTEM",
      content,
      metadata,
    },
    select: { id: true, createdAt: true },
  });
  try {
    getSocketInstance().to(payload.campaignId).emit("chat.system", {
      id: message.id,
      content,
      metadata,
      timestamp: message.createdAt.toISOString(),
    });
  } catch {
    // Persistence remains authoritative when no realtime server is attached.
  }
}

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
        campaignId?: unknown;
        extensionId?: unknown;
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
      if (
        typeof payload.commandId === "string" &&
        typeof payload.campaignId === "string" &&
        typeof payload.extensionId === "string"
      ) {
        await publishCommandActivity(prisma, event.id, {
          commandId: payload.commandId,
          campaignId: payload.campaignId,
          extensionId: payload.extensionId,
        });
      }
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
