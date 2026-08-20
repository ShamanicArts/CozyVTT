import {
  ApplicationHost,
  HostCommandError,
  IdempotencyReplayError,
  durableExecutionMiddleware,
  digestCanonical,
} from "./ApplicationHost";
import { DurableExecutionPorts } from "./ApplicationHost";
import { UnitOfWorkPort } from "../ports/UnitOfWork";
const ports = (): jest.Mocked<DurableExecutionPorts> => ({
  grants: { hasGrant: jest.fn(async () => true) },
  audit: { append: jest.fn(async () => undefined) },
  idempotency: {
    register: jest.fn(async () => "CREATED"),
    complete: jest.fn(async () => undefined),
  },
  outbox: {
    enqueue: jest.fn(async () => "event"),
    claim: jest.fn(),
    markDelivered: jest.fn(),
    retry: jest.fn(),
  },
});
describe("ApplicationHost", () => {
  it("catalogs unique commands and preserves context-free compatibility", async () => {
    const host = new ApplicationHost();
    host.register({
      metadata: { id: "example", version: "1", risk: "LOW", permissions: [] },
      execute: async (input: { value: number }) => input.value + 1,
    });
    expect(host.list()).toHaveLength(1);
    await expect(
      host.dispatch({ id: "example", input: { value: 1 } }),
    ).resolves.toBe(2);
    expect(() =>
      host.register({
        metadata: { id: "example", version: "1", risk: "LOW", permissions: [] },
        execute: async () => undefined,
      }),
    ).toThrow(HostCommandError);
  });
  it("uses stable canonical digests and enforces grants/idempotency", async () => {
    expect(digestCanonical({ b: 1, a: 2 })).toBe(
      digestCanonical({ a: 2, b: 1 }),
    );
    const dependencies = ports();
    const host = new ApplicationHost();
    host.use(durableExecutionMiddleware(dependencies));
    host.register({
      metadata: {
        id: "agent.write",
        version: "1",
        risk: "HIGH",
        permissions: ["WRITE"],
        idempotency: true,
      },
      execute: async () => "ok",
    });
    await expect(
      host.dispatch({
        id: "agent.write",
        input: { x: 1 },
        context: {
          principalType: "AGENT",
          principalId: "agent",
          extensionId: "ext",
          origin: "AGENT",
          idempotencyKey: "key",
        },
      }),
    ).resolves.toBe("ok");
    expect(dependencies.idempotency.complete).toHaveBeenCalled();
    (dependencies.idempotency.register as jest.Mock).mockResolvedValueOnce(
      "REPLAY",
    );
    await expect(
      host.dispatch({
        id: "agent.write",
        input: { x: 1 },
        context: {
          principalType: "AGENT",
          principalId: "agent",
          extensionId: "ext",
          origin: "AGENT",
          idempotencyKey: "key",
        },
      }),
    ).rejects.toBeInstanceOf(IdempotencyReplayError);
  });
  it("uses the unit of work only for protected agent or extension execution", async () => {
    const dependencies = ports();
    const execute = jest.fn();
    const unitOfWork: UnitOfWorkPort = {
      execute: async <T>(work: () => Promise<T>) => {
        execute();
        return work();
      },
    };
    const host = new ApplicationHost();
    host.use(durableExecutionMiddleware({ ...dependencies, unitOfWork }));
    host.register({
      metadata: {
        id: "agent.transactional-write",
        version: "1",
        risk: "MEDIUM",
        permissions: [],
        idempotency: true,
        outbox: {
          topic: "command.executed",
          aggregateType: "command",
          aggregateId: () => "aggregate",
        },
      },
      execute: async () => "ok",
    });

    await expect(
      host.dispatch({
        id: "agent.transactional-write",
        input: {},
        context: {
          principalType: "AGENT",
          principalId: "agent",
          extensionId: "extension",
          origin: "AGENT",
          idempotencyKey: "key",
        },
      }),
    ).resolves.toBe("ok");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(dependencies.outbox.enqueue).toHaveBeenCalledTimes(1);

    await host.dispatch({ id: "agent.transactional-write", input: {} });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("uses the delegated user's campaign membership instead of a duplicate MCP grant", async () => {
    const dependencies = ports();
    (dependencies.grants.hasGrant as jest.Mock).mockResolvedValue(false);
    dependencies.delegatedAgentAccess = {
      activeCredentialDelegates: jest.fn(async () => true),
    };
    const host = new ApplicationHost();
    host.use(durableExecutionMiddleware(dependencies));
    host.register({
      metadata: {
        id: "agent.member-write",
        version: "1",
        risk: "MEDIUM",
        permissions: ["WRITE"],
      },
      execute: async () => "ok",
    });

    await expect(
      host.dispatch({
        id: "agent.member-write",
        input: {},
        context: {
          principalType: "AGENT",
          principalId: "credential-1",
          delegatedIdentity: "user-1",
          campaignId: "campaign-1",
          extensionId: "cozyvtt.core-agent",
          origin: "AGENT",
        },
      }),
    ).resolves.toBe("ok");
    expect(dependencies.grants.hasGrant).not.toHaveBeenCalled();
  });
});
