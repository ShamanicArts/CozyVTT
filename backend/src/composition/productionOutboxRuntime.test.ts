import {
  APPLICATION_COMMAND_EXECUTED_V1,
  createProductionOutboxDispatcher,
  outboxHealth,
} from "./productionOutboxRuntime";

describe("production outbox runtime", () => {
  const prisma = {
    outboxEvent: { count: jest.fn() },
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it("does not poll merely by constructing the runtime and reports backlog health", async () => {
    prisma.outboxEvent.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    const dispatcher = createProductionOutboxDispatcher(prisma);
    expect((dispatcher as any).timer).toBeUndefined();
    await expect(outboxHealth(prisma)).resolves.toEqual({
      pending: 3,
      deadLetter: 1,
    });
    expect(prisma.outboxEvent.count).toHaveBeenNthCalledWith(1, {
      where: { status: { in: ["PENDING", "CLAIMED"] } },
    });
  });

  it("has exactly the versioned command activity consumer and keeps its payload value-free", async () => {
    const dispatcher = createProductionOutboxDispatcher(prisma);
    const consumers = (dispatcher as any).consumers as Map<
      string,
      { consume: (event: any) => Promise<void> }
    >;
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
});
