import { Prisma, PrismaClient } from "@prisma/client";
import {
  AgentAuditPort,
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

export class PrismaAgentAuditPort implements AgentAuditPort {
  constructor(private readonly client: PrismaClient) {}
  async append(input: Parameters<AgentAuditPort["append"]>[0]): Promise<void> {
    await this.client.agentAuditRecord.create({ data: input });
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
    try {
      await this.client.commandIdempotencyRecord.create({
        data: { ...data, scopeCampaignId },
      });
      return "CREATED";
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      )
        throw error;
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
  }
  async complete(
    input: Parameters<IdempotencyPort["complete"]>[0],
  ): Promise<void> {
    await this.client.commandIdempotencyRecord.update({
      where: {
        principalType_principalId_scopeCampaignId_commandType_idempotencyKey: {
          principalType: input.principalType,
          principalId: input.principalId,
          scopeCampaignId: input.campaignId ?? "",
          commandType: input.commandType,
          idempotencyKey: input.idempotencyKey,
        },
      },
      data: {
        status: "COMPLETED",
        resultDigest: input.resultDigest,
        completedAt: new Date(),
        claimToken: null,
        leaseExpiresAt: null,
      },
    });
  }
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
