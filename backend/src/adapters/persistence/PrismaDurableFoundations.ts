import { Prisma, PrismaClient } from "@prisma/client";
import {
  CapabilityAuditPort,
  ExtensionGrantPort,
  IdempotencyPort,
  OutboxPort,
} from "../../ports/DurableFoundations";

export class PrismaExtensionGrantPort implements ExtensionGrantPort {
  constructor(private readonly client: PrismaClient) {}
  async hasGrant(
    input: Parameters<ExtensionGrantPort["hasGrant"]>[0],
  ): Promise<boolean> {
    return Boolean(
      await this.client.extensionGrant.findFirst({
        where: {
          principalType: input.principalType,
          principalId: input.principalId,
          scopeCampaignId: input.campaignId ?? "",
          extensionId: input.extensionId,
          permission: input.permission,
          revokedAt: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: input.now ?? new Date() } },
          ],
        },
        select: { id: true },
      }),
    );
  }
}

export class PrismaCapabilityAuditPort implements CapabilityAuditPort {
  constructor(private readonly client: PrismaClient) {}
  async append(input: Parameters<CapabilityAuditPort["append"]>[0]): Promise<void> {
    await this.client.capabilityAuditRecord.create({ data: input });
  }
}

export class PrismaIdempotencyPort implements IdempotencyPort {
  constructor(private readonly client: PrismaClient) {}
  async register(
    input: Parameters<IdempotencyPort["register"]>[0],
  ): Promise<"CREATED" | "REPLAY" | "CONFLICT" | "RECLAIMED"> {
    const { campaignId, now: _now, ...data } = input;
    const scopeCampaignId = campaignId ?? "";
    const where = {
      principalType_principalId_scopeCampaignId_commandType_idempotencyKey: {
        principalType: input.principalType,
        principalId: input.principalId,
        scopeCampaignId,
        commandType: input.commandType,
        idempotencyKey: input.idempotencyKey,
      },
    };
    const inserted = await this.client.commandIdempotencyRecord.createMany({
      data: [{ ...data, scopeCampaignId }],
      skipDuplicates: true,
    });
    if (inserted.count === 1) return "CREATED";
    const existing =
      await this.client.commandIdempotencyRecord.findUniqueOrThrow({ where });
    if (existing.requestDigest !== input.requestDigest) return "CONFLICT";
    const now = input.now ?? new Date();
    if (
      existing.status === "PROCESSING" &&
      existing.leaseExpiresAt &&
      existing.leaseExpiresAt < now
    ) {
      const result = await this.client.commandIdempotencyRecord.updateMany({
        where: {
          id: existing.id,
          status: "PROCESSING",
          leaseExpiresAt: { lt: now },
        },
        data: { claimToken: null, leaseExpiresAt: null },
      });
      if (result.count) return "RECLAIMED";
    }
    return "REPLAY";
  }
  async complete(
    input: Parameters<IdempotencyPort["complete"]>[0],
  ): Promise<void> {
    const resultJson = boundedResult(input.result);
    const key = idempotencyKey(input);
    await this.client.commandExecutionOutcome.upsert({
      where: key,
      create: {
        principalType: input.principalType,
        principalId: input.principalId,
        scopeCampaignId: input.campaignId ?? "",
        commandType: input.commandType,
        idempotencyKey: input.idempotencyKey,
        requestDigest: input.requestDigest,
        capabilityVersion: input.capabilityVersion,
        status: "COMPLETED",
        resultJson,
        resultDigest: input.resultDigest,
        expiresAt: input.expiresAt,
      },
      update: {
        status: "COMPLETED",
        resultJson,
        resultDigest: input.resultDigest,
        publicErrorCode: null,
        publicErrorMessage: null,
        completedAt: new Date(),
        expiresAt: input.expiresAt,
      },
    });
    await this.client.commandIdempotencyRecord.update({
      where: key,
      data: {
        status: "COMPLETED",
        resultDigest: input.resultDigest,
        completedAt: new Date(),
        claimToken: null,
        leaseExpiresAt: null,
      },
    });
  }
  async fail(input: Parameters<IdempotencyPort["fail"]>[0]): Promise<void> {
    const key = idempotencyKey(input);
    await this.client.commandExecutionOutcome.upsert({
      where: key,
      create: {
        principalType: input.principalType,
        principalId: input.principalId,
        scopeCampaignId: input.campaignId ?? "",
        commandType: input.commandType,
        idempotencyKey: input.idempotencyKey,
        requestDigest: input.requestDigest,
        capabilityVersion: input.capabilityVersion,
        status: "FAILED",
        publicErrorCode: input.errorCode.slice(0, 120),
        publicErrorMessage: input.errorMessage.slice(0, 240),
        expiresAt: input.expiresAt,
      },
      update: {
        status: "FAILED",
        resultJson: Prisma.DbNull,
        resultDigest: null,
        publicErrorCode: input.errorCode.slice(0, 120),
        publicErrorMessage: input.errorMessage.slice(0, 240),
        completedAt: new Date(),
        expiresAt: input.expiresAt,
      },
    });
    await this.client.commandIdempotencyRecord.upsert({
      where: key,
      create: {
        principalType: input.principalType,
        principalId: input.principalId,
        scopeCampaignId: input.campaignId ?? "",
        commandType: input.commandType,
        idempotencyKey: input.idempotencyKey,
        requestDigest: input.requestDigest,
        status: "FAILED",
        completedAt: new Date(),
        expiresAt: input.expiresAt,
      },
      update: {
        status: "FAILED",
        completedAt: new Date(),
        claimToken: null,
        leaseExpiresAt: null,
        expiresAt: input.expiresAt,
      },
    });
  }
  async getOutcome(
    input: Parameters<IdempotencyPort["getOutcome"]>[0],
  ): ReturnType<IdempotencyPort["getOutcome"]> {
    const outcome = await this.client.commandExecutionOutcome.findUnique({
      where: idempotencyKey(input),
    });
    if (!outcome) return null;
    if (input.requestDigest && outcome.requestDigest !== input.requestDigest)
      return { status: "CONFLICT" };
    if (outcome.status === "COMPLETED")
      return { status: "COMPLETED", result: outcome.resultJson };
    if (outcome.status === "FAILED")
      return {
        status: "FAILED",
        errorCode: outcome.publicErrorCode ?? "COMMAND_FAILED",
        errorMessage: outcome.publicErrorMessage ?? "Command execution failed",
      };
    return null;
  }
  async cleanupExpired(now: Date): Promise<number> {
    const [outcomes] = await Promise.all([
      this.client.commandExecutionOutcome.deleteMany({
        where: { expiresAt: { lte: now } },
      }),
      this.client.commandIdempotencyRecord.deleteMany({
        where: { expiresAt: { lte: now } },
      }),
    ]);
    return outcomes.count;
  }
}

function idempotencyKey(input: {
  principalType: import("../../ports/DurableFoundations").DurablePrincipalType;
  principalId: string;
  campaignId?: string;
  commandType: string;
  idempotencyKey: string;
}) {
  return {
    principalType_principalId_scopeCampaignId_commandType_idempotencyKey: {
      principalType: input.principalType,
      principalId: input.principalId,
      scopeCampaignId: input.campaignId ?? "",
      commandType: input.commandType,
      idempotencyKey: input.idempotencyKey,
    },
  };
}

function boundedResult(result: unknown): Prisma.InputJsonValue {
  const normalized = result === undefined ? null : result;
  const serialized = JSON.stringify(normalized);
  if (Buffer.byteLength(serialized, "utf8") > 65_536)
    throw new Error("Idempotent command result exceeds 64 KiB");
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

export class PrismaOutboxPort implements OutboxPort {
  constructor(private readonly client: PrismaClient) {}
  async enqueue(input: Parameters<OutboxPort["enqueue"]>[0]): Promise<string> {
    const event = await this.client.outboxEvent.create({
      data: { ...input, payload: input.payload as Prisma.InputJsonValue },
    });
    return event.id;
  }
  async claim(
    workerId: string,
    limit: number,
    leaseUntil: Date,
    now = new Date(),
  ): Promise<
    Array<{
      id: string;
      topic: string;
      payload: unknown;
      claimToken: string;
      attempts: number;
    }>
  > {
    const candidates = await this.client.outboxEvent.findMany({
      where: {
        OR: [
          { status: "PENDING", availableAt: { lte: now } },
          { status: "CLAIMED", leaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    const claimed: Array<{
      id: string;
      topic: string;
      payload: unknown;
      claimToken: string;
      attempts: number;
    }> = [];
    for (const event of candidates) {
      const claimToken = crypto.randomUUID();
      const updated = await this.client.outboxEvent.updateMany({
        where: {
          id: event.id,
          OR: [
            { status: "PENDING", availableAt: { lte: now } },
            { status: "CLAIMED", leaseExpiresAt: { lt: now } },
          ],
        },
        data: {
          status: "CLAIMED",
          claimedBy: workerId,
          claimToken,
          claimedAt: now,
          leaseExpiresAt: leaseUntil,
          attempts: { increment: 1 },
        },
      });
      if (updated.count)
        claimed.push({
          id: event.id,
          topic: event.topic,
          payload: event.payload,
          claimToken,
          attempts: event.attempts + 1,
        });
    }
    return claimed;
  }
  async markDelivered(id: string, claimToken: string): Promise<boolean> {
    const result = await this.client.outboxEvent.updateMany({
      where: { id, claimToken, status: "CLAIMED" },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
        claimedBy: null,
        claimToken: null,
        claimedAt: null,
        leaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }
  async retry(
    id: string,
    claimToken: string,
    error: string,
    availableAt: Date,
    deadLetter = false,
  ): Promise<boolean> {
    const data = deadLetter
      ? {
          status: "DEAD_LETTER" as const,
          deadLetteredAt: new Date(),
          lastError: error,
          claimedBy: null,
          claimToken: null,
          claimedAt: null,
          leaseExpiresAt: null,
        }
      : {
          status: "PENDING" as const,
          availableAt,
          lastError: error,
          claimedBy: null,
          claimToken: null,
          claimedAt: null,
          leaseExpiresAt: null,
        };
    const result = await this.client.outboxEvent.updateMany({
      where: { id, claimToken, status: "CLAIMED" },
      data,
    });
    return result.count === 1;
  }
}
