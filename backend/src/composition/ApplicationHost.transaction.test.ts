import { prisma } from "../config/database";
import {
  ApplicationHost,
  durableExecutionMiddleware,
  HostCommand,
  HostCommandError,
} from "./ApplicationHost";
import {
  PrismaCapabilityAuditPort,
  PrismaExtensionGrantPort,
  PrismaIdempotencyPort,
  PrismaOutboxPort,
} from "../adapters/persistence/PrismaDurableFoundations";
import { PrismaTransactionContext } from "../adapters/persistence/PrismaTransactionContext";
import { OutboxPort } from "../ports/DurableFoundations";
import { productionApplicationHost } from "./productionApplicationHost";
import { SET_ATMOSPHERE_EFFECT } from "../application/campaigns/RealtimeCampaignCommands";
import { Server as SocketIOServer } from "socket.io";
import { setSocketInstance } from "../websocket/utils";

// Local developer shells may carry the Compose hostname without the database
// container running. CI/Compose enables this contract suite explicitly.
const databaseDescribe =
  process.env.RUN_DATABASE_TESTS === "true" && process.env.DATABASE_URL
    ? describe
    : describe.skip;
const prefix = `host-transaction-${Date.now()}-`;

databaseDescribe("ApplicationHost durable transaction boundary", () => {
  const createdCampaignIds: string[] = [];
  const transactions = new PrismaTransactionContext(prisma);
  const audits = new PrismaCapabilityAuditPort(prisma);
  const grants = new PrismaExtensionGrantPort(prisma);
  const idempotency = new PrismaIdempotencyPort(transactions.client);
  const outbox = new PrismaOutboxPort(transactions.client);

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({
      where: {
        OR: [
          { topic: { startsWith: prefix } },
          { campaignId: { startsWith: prefix } },
          { campaignId: { in: createdCampaignIds } },
        ],
      },
    });
    await prisma.commandExecutionOutcome.deleteMany({
      where: {
        OR: [
          { commandType: { startsWith: prefix } },
          { principalId: { startsWith: prefix } },
        ],
      },
    });
    await prisma.commandIdempotencyRecord.deleteMany({
      where: {
        OR: [
          { commandType: { startsWith: prefix } },
          { principalId: { startsWith: prefix } },
        ],
      },
    });
    await prisma.capabilityAuditRecord.deleteMany({
      where: { principalId: { startsWith: prefix } },
    });
    await prisma.extensionGrant.deleteMany({
      where: { extensionId: { startsWith: prefix } },
    });
    await prisma.campaign.deleteMany({
      where: { name: { startsWith: prefix } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: prefix } },
    });
    await prisma.$disconnect();
  });

  const context = (suffix: string) => ({
    principalType: "PLUGIN" as const,
    principalId: `${prefix}capability`,
    campaignId: `${prefix}campaign`,
    extensionId: `${prefix}extension`,
    origin: "PLUGIN" as const,
    idempotencyKey: suffix,
  });

  function hostFor(
    command: HostCommand<{ marker: string }, { id: string }>,
    eventOutbox: OutboxPort = outbox,
  ): ApplicationHost {
    const host = new ApplicationHost();
    host.use(
      durableExecutionMiddleware({
        grants,
        audit: audits,
        idempotency,
        outbox: eventOutbox,
        unitOfWork: transactions,
      }),
    );
    host.register(command);
    return host;
  }

  function writeCommand(
    id: string,
    fail = false,
  ): HostCommand<{ marker: string }, { id: string }> {
    return {
      metadata: {
        id,
        version: "1",
        risk: "MEDIUM",
        permissions: [],
        idempotency: true,
        outbox: {
          topic: `${id}.event`,
          aggregateType: "test",
          aggregateId: (_input, output) => (output as { id: string }).id,
        },
      },
      execute: async ({ marker }) => {
        await transactions.client.extensionGrant.create({
          data: {
            principalType: "PLUGIN",
            principalId: `${prefix}writer`,
            scopeCampaignId: `${prefix}scope`,
            extensionId: marker,
            permission: "READ",
          },
        });
        if (fail) throw new Error("COMMAND_FAILURE");
        return { id: marker };
      },
    };
  }

  it("rolls back command state and stores a safe failed replay when outbox enqueue fails", async () => {
    const marker = `${prefix}outbox-failure`;
    const failingOutbox: OutboxPort = {
      enqueue: async () => {
        throw new Error("OUTBOX_FAILURE");
      },
      claim: async () => [],
      markDelivered: async () => false,
      retry: async () => false,
    };
    const command = writeCommand(`${prefix}outbox-command`);
    const host = hostFor(command, failingOutbox);

    await expect(
      host.dispatch({
        id: command.metadata.id,
        input: { marker },
        context: context("outbox"),
      }),
    ).rejects.toThrow("OUTBOX_FAILURE");

    await expect(
      prisma.extensionGrant.count({ where: { extensionId: marker } }),
    ).resolves.toBe(0);
    await expect(
      prisma.commandIdempotencyRecord.findFirstOrThrow({
        where: { commandType: command.metadata.id },
      }),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      prisma.commandExecutionOutcome.findFirstOrThrow({
        where: { commandType: command.metadata.id },
      }),
    ).resolves.toMatchObject({
      status: "FAILED",
      publicErrorCode: "Error",
      publicErrorMessage: "Command execution failed",
      resultJson: null,
    });
  });

  it("writes command state, completion, and outbox event in one successful transaction", async () => {
    const marker = `${prefix}success`;
    const command = writeCommand(`${prefix}success-command`);
    const host = hostFor(command);

    await expect(
      host.dispatch({
        id: command.metadata.id,
        input: { marker },
        context: context("success"),
      }),
    ).resolves.toEqual({ id: marker });

    await expect(
      prisma.extensionGrant.count({ where: { extensionId: marker } }),
    ).resolves.toBe(1);
    await expect(
      prisma.commandIdempotencyRecord.findFirstOrThrow({
        where: { commandType: command.metadata.id },
      }),
    ).resolves.toMatchObject({ status: "COMPLETED" });
    await expect(
      prisma.outboxEvent.count({
        where: { topic: `${command.metadata.id}.event` },
      }),
    ).resolves.toBe(1);
  });

  it("rolls back failed commands without an outbox event and retains a safe failure", async () => {
    const marker = `${prefix}command-failure`;
    const command = writeCommand(`${prefix}failed-command`, true);
    const host = hostFor(command);

    await expect(
      host.dispatch({
        id: command.metadata.id,
        input: { marker },
        context: context("failed"),
      }),
    ).rejects.toThrow("COMMAND_FAILURE");

    await expect(
      prisma.extensionGrant.count({ where: { extensionId: marker } }),
    ).resolves.toBe(0);
    await expect(
      prisma.commandIdempotencyRecord.findFirstOrThrow({
        where: { commandType: command.metadata.id },
      }),
    ).resolves.toMatchObject({ status: "FAILED" });
    await expect(
      prisma.commandExecutionOutcome.findFirstOrThrow({
        where: { commandType: command.metadata.id },
      }),
    ).resolves.toMatchObject({
      status: "FAILED",
      publicErrorMessage: "Command execution failed",
      resultJson: null,
    });
    await expect(
      prisma.outboxEvent.count({
        where: { topic: `${command.metadata.id}.event` },
      }),
    ).resolves.toBe(0);
  });

  it("keeps denied audits when a command never enters the transaction", async () => {
    const command: HostCommand<{ marker: string }, { id: string }> = {
      metadata: {
        id: `${prefix}denied-command`,
        version: "1",
        risk: "HIGH",
        permissions: ["WRITE"],
      },
      execute: async ({ marker }) => ({ id: marker }),
    };
    const host = hostFor(command);

    await expect(
      host.dispatch({
        id: command.metadata.id,
        input: { marker: "denied" },
        context: context("denied"),
      }),
    ).rejects.toBeInstanceOf(HostCommandError);

    await expect(
      prisma.capabilityAuditRecord.findFirstOrThrow({
        where: { commandType: command.metadata.id, decision: "DENIED" },
      }),
    ).resolves.toMatchObject({ reasonCode: "GRANT_DENIED" });
  });

  it("atomically persists a real production command and its generic outbox event", async () => {
    const socketServer = new SocketIOServer();
    setSocketInstance(socketServer);
    const user = await prisma.user.create({
      data: {
        email: `${prefix}production@example.test`,
        passwordHash: "test",
        displayName: "Production transaction test",
        mfaBackupCodes: [],
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        name: `${prefix}production campaign`,
        description: "transaction test",
        ownerId: user.id,
        vibeSettings: {},
      },
    });
    createdCampaignIds.push(campaign.id);
    const productionContext = {
      principalType: "PLUGIN" as const,
      principalId: `${prefix}production-capability`,
      campaignId: campaign.id,
      extensionId: `${prefix}production-extension`,
      origin: "PLUGIN" as const,
      idempotencyKey: "production-atmosphere",
    };
    await prisma.extensionGrant.createMany({
      data: (["WRITE", "EXECUTE"] as const).map((permission) => ({
        principalType: "PLUGIN",
        principalId: productionContext.principalId,
        scopeCampaignId: campaign.id,
        extensionId: productionContext.extensionId,
        permission,
      })),
    });

    await expect(
      productionApplicationHost.dispatch({
        id: SET_ATMOSPHERE_EFFECT,
        input: { campaignId: campaign.id, effect: "rain" },
        context: productionContext,
      }),
    ).resolves.toBe("rain");

    const persistedCampaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: campaign.id },
    });
    expect(persistedCampaign.vibeSettings).toMatchObject({
      atmosphereEffect: "rain",
    });
    await expect(
      prisma.commandIdempotencyRecord.findFirstOrThrow({
        where: { principalId: productionContext.principalId },
      }),
    ).resolves.toMatchObject({ status: "COMPLETED" });
    await expect(
      prisma.outboxEvent.findFirstOrThrow({
        where: {
          campaignId: campaign.id,
          topic: "application.command.executed.v1",
        },
      }),
    ).resolves.toMatchObject({
      aggregateType: "campaign",
      aggregateId: campaign.id,
      payload: {
        commandId: SET_ATMOSPHERE_EFFECT,
        commandVersion: "1",
      },
    });
  });
});
