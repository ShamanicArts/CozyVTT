import { prisma } from "../../config/database";
import {
  PrismaAgentAuditPort,
  PrismaExtensionGrantPort,
  PrismaIdempotencyPort,
  PrismaOutboxPort,
} from "./PrismaDurableFoundations";

const prefix = `durable-test-${Date.now()}-`;
const grants = new PrismaExtensionGrantPort(prisma);
const audits = new PrismaAgentAuditPort(prisma);
const idempotency = new PrismaIdempotencyPort(prisma);
const outbox = new PrismaOutboxPort(prisma);

afterAll(async () => {
  await prisma.outboxEvent.deleteMany({
    where: { topic: { startsWith: prefix } },
  });
  await prisma.commandIdempotencyRecord.deleteMany({
    where: { commandType: { startsWith: prefix } },
  });
  await prisma.agentAuditRecord.deleteMany({
    where: { commandType: { startsWith: prefix } },
  });
  await prisma.extensionGrant.deleteMany({
    where: { extensionId: { startsWith: prefix } },
  });
  await prisma.$disconnect();
});

describe("Prisma durable foundations adapters", () => {
  it("defaults grants to deny and excludes expired or revoked grants", async () => {
    const input = {
      principalType: "AGENT" as const,
      principalId: `${prefix}agent`,
      campaignId: "campaign",
      extensionId: `${prefix}extension`,
      permission: "EXECUTE" as const,
    };
    await expect(grants.hasGrant(input)).resolves.toBe(false);
    const { campaignId, ...grant } = input;
    await prisma.extensionGrant.create({
      data: { ...grant, scopeCampaignId: campaignId },
    });
    await expect(grants.hasGrant(input)).resolves.toBe(true);
    await prisma.extensionGrant.updateMany({
      where: { extensionId: input.extensionId },
      data: { revokedAt: new Date() },
    });
    await expect(grants.hasGrant(input)).resolves.toBe(false);
    await prisma.extensionGrant.create({
      data: {
        ...grant,
        scopeCampaignId: "expired",
        expiresAt: new Date(Date.now() - 1),
      },
    });
    await expect(
      grants.hasGrant({ ...input, campaignId: "expired" }),
    ).resolves.toBe(false);
  });

  it("writes value-free audit rows with only the supplied digest", async () => {
    await audits.append({
      principalType: "AGENT",
      principalId: `${prefix}agent`,
      delegatedIdentity: "delegated",
      commandType: `${prefix}audit`,
      inputDigest: "sha256:abc",
      decision: "DENIED",
      reasonCode: "NO_GRANT",
    });
    const record = await prisma.agentAuditRecord.findFirstOrThrow({
      where: { commandType: `${prefix}audit` },
    });
    expect(record.inputDigest).toBe("sha256:abc");
    expect(Object.keys(record)).not.toContain("input");
    expect(Object.keys(record)).not.toContain("payload");
  });

  it("rejects idempotent replays and records completion without storing result values", async () => {
    const input = {
      principalType: "AGENT" as const,
      principalId: `${prefix}agent`,
      campaignId: "campaign",
      commandType: `${prefix}command`,
      idempotencyKey: "same-key",
      requestDigest: "sha256:request",
      expiresAt: new Date(Date.now() + 60_000),
    };
    await expect(idempotency.register(input)).resolves.toBe("CREATED");
    await expect(idempotency.register(input)).resolves.toBe("REPLAY");
    await expect(
      idempotency.register({ ...input, requestDigest: "sha256:other" }),
    ).resolves.toBe("CONFLICT");
    await idempotency.complete({ ...input, resultDigest: "sha256:result" });
    const record = await prisma.commandIdempotencyRecord.findFirstOrThrow({
      where: { commandType: input.commandType },
    });
    expect(record.status).toBe("COMPLETED");
    expect(record.resultDigest).toBe("sha256:result");
  });

  it("reclaims an expired processing lease with the same digest", async () => {
    const input = {
      principalType: "AGENT" as const,
      principalId: `${prefix}lease-agent`,
      campaignId: "campaign",
      commandType: `${prefix}lease`,
      idempotencyKey: "lease-key",
      requestDigest: "sha256:request",
      expiresAt: new Date(Date.now() + 60_000),
    };
    await idempotency.register(input);
    await prisma.commandIdempotencyRecord.updateMany({
      where: { commandType: input.commandType },
      data: { claimToken: "stale", leaseExpiresAt: new Date(Date.now() - 1) },
    });
    await expect(idempotency.register(input)).resolves.toBe("RECLAIMED");
  });

  it("allows only one concurrent claim and supports retry then dead-letter", async () => {
    const id = await outbox.enqueue({
      topic: `${prefix}event`,
      aggregateType: "test",
      aggregateId: "aggregate",
      payload: { retry: true },
    });
    const lease = new Date(Date.now() + 60_000);
    const [first, second] = await Promise.all([
      outbox.claim("worker-a", 1, lease),
      outbox.claim("worker-b", 1, lease),
    ]);
    const claimed = [...first, ...second];
    expect(claimed).toHaveLength(1);
    expect(
      await outbox.retry(
        id,
        claimed[0].claimToken,
        "temporary",
        new Date(Date.now() - 1),
      ),
    ).toBe(true);
    const retried = await outbox.claim("worker-c", 1, lease);
    expect(retried).toHaveLength(1);
    expect(
      await outbox.retry(
        id,
        retried[0].claimToken,
        "permanent",
        new Date(),
        true,
      ),
    ).toBe(true);
    const record = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id },
    });
    expect(record.status).toBe("DEAD_LETTER");
    expect(record.lastError).toBe("permanent");
  });

  it("clears an ownership claim when delivery succeeds", async () => {
    const id = await outbox.enqueue({
      topic: `${prefix}delivered`,
      aggregateType: "test",
      aggregateId: "delivered",
      payload: {},
    });
    const [claimed] = await outbox.claim(
      "worker-delivery",
      1,
      new Date(Date.now() + 60_000),
    );
    expect(await outbox.markDelivered(id, claimed.claimToken)).toBe(true);
    const record = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id },
    });
    expect(record).toMatchObject({
      status: "DELIVERED",
      claimedBy: null,
      claimToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
    });
  });
});
