import {
  APPLICATION_COMMAND_EXECUTED_V1,
  createProductionOutboxDispatcher,
  outboxHealth,
} from "./productionOutboxRuntime";
import type { PrismaClient } from "@prisma/client";

interface DispatcherInternals {
  timer?: unknown;
  consumers: Map<string, { consume: (event: unknown) => Promise<void> }>;
}

describe("production outbox runtime", () => {
  const prisma = {
    outboxEvent: { count: jest.fn() },
    message: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(() => jest.clearAllMocks());

  it("does not poll merely by constructing the runtime and reports backlog health", async () => {
    prisma.outboxEvent.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    const dispatcher = createProductionOutboxDispatcher(prisma as unknown as PrismaClient);
    expect((dispatcher as unknown as DispatcherInternals).timer).toBeUndefined();
    await expect(outboxHealth(prisma as unknown as PrismaClient)).resolves.toEqual({
      pending: 3,
      deadLetter: 1,
    });
    expect(prisma.outboxEvent.count).toHaveBeenNthCalledWith(1, {
      where: { status: { in: ["PENDING", "CLAIMED"] } },
    });
  });

  it("has exactly the versioned command activity consumer and keeps its payload value-free", async () => {
    const dispatcher = createProductionOutboxDispatcher(prisma as unknown as PrismaClient);
    const consumers = (dispatcher as unknown as DispatcherInternals).consumers;
    expect([...consumers.keys()]).toEqual([APPLICATION_COMMAND_EXECUTED_V1]);
    await expect(
      consumers.get(APPLICATION_COMMAND_EXECUTED_V1)!.consume({
        id: "event",
        topic: APPLICATION_COMMAND_EXECUTED_V1,
        payload: {
          commandId: "map.update",
          commandVersion: "1",
          input: "must-not-log",
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("projects an extension command into preserved campaign activity", async () => {
    prisma.message.findUnique.mockResolvedValue(null);
    prisma.message.create.mockResolvedValue({
      id: "event",
      createdAt: new Date("2026-08-23T09:00:00.000Z"),
    });
    const dispatcher = createProductionOutboxDispatcher(prisma as unknown as PrismaClient);
    const consumers = (dispatcher as unknown as DispatcherInternals).consumers;
    await consumers.get(APPLICATION_COMMAND_EXECUTED_V1)!.consume({
      id: "event",
      topic: APPLICATION_COMMAND_EXECUTED_V1,
      payload: {
        commandId: "vtt.atmosphere.effect.set",
        commandVersion: "1",
        campaignId: "campaign-1",
        origin: "PLUGIN",
        extensionId: "cozyvtt.agent",
      },
    });
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: "event",
          campaignId: "campaign-1",
          content: "cozyvtt.agent: Set campaign atmosphere effect.",
          metadata: expect.objectContaining({
            activity: expect.objectContaining({ kind: "scene" }),
          }),
        }),
      }),
    );
  });
});
