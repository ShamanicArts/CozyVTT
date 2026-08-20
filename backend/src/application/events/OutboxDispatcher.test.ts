import { OutboxDispatcher } from "./OutboxDispatcher";
import { OutboxPort } from "../../ports/DurableFoundations";
const outbox = (): jest.Mocked<OutboxPort> => ({
  enqueue: jest.fn(),
  claim: jest.fn(),
  markDelivered: jest.fn(),
  retry: jest.fn(),
});
describe("OutboxDispatcher", () => {
  it("claims a bounded batch and acknowledges its consumer result", async () => {
    const store = outbox();
    store.claim.mockResolvedValue([
      {
        id: "e1",
        topic: "map.changed",
        payload: {},
        claimToken: "c1",
        attempts: 1,
      },
    ]);
    store.markDelivered.mockResolvedValue(true);
    const dispatcher = new OutboxDispatcher(store, "worker-1", {
      batchSize: 1,
    });
    dispatcher.register({ topic: "map.changed", consume: jest.fn() });
    expect(await dispatcher.dispatchOnce()).toBe(1);
    expect(store.claim).toHaveBeenCalledWith(
      "worker-1",
      1,
      expect.any(Date),
      expect.any(Date),
    );
    expect(store.markDelivered).toHaveBeenCalledWith("e1", "c1");
  });
  it("dead-letters a failed event at max attempts", async () => {
    const store = outbox();
    store.claim.mockResolvedValue([
      {
        id: "e1",
        topic: "missing",
        payload: {},
        claimToken: "c1",
        attempts: 2,
      },
    ]);
    store.retry.mockResolvedValue(true);
    const dispatcher = new OutboxDispatcher(store, "worker-1", {
      maxAttempts: 2,
    });
    await dispatcher.dispatchOnce();
    expect(store.retry).toHaveBeenCalledWith(
      "e1",
      "c1",
      "No outbox consumer registered for missing",
      expect.any(Date),
      true,
    );
  });
});
