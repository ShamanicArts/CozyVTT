import { createHash } from "crypto";
import express from "express";
import session from "express-session";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import request from "supertest";
import type { ExtensionGrantRecord } from "../../../ports/ExtensionAdministrationRepository";
import type { ExtensionInstallation } from "../../host/contracts";
import type { ExtensionInstallationRepository } from "../../host/ports";
import { CommandBus } from "../../../application/commands/CommandBus";
import { ExtensionCommandBridge } from "../../bridge/ExtensionCommandBridge";
import { ExtensionHostService } from "../../host/ExtensionHostService";
import { LocalExtensionPackageCatalog } from "../../host/adapters/LocalExtensionPackageCatalog";
import type { ExtensionPolicyPort } from "../../../application/policy/ExtensionPolicy";
import { ExtensionRegistry } from "../../registry";
import { NodeBubblewrapSandbox } from "../NodeBubblewrapSandbox";
import { SandboxRegistryProxy } from "../SandboxRegistryProxy";
import { SandboxedExtensionSupervisor } from "../SandboxedExtensionSupervisor";

const mockState: {
  credentials: Array<{
    id: string;
    credentialHash: string;
    delegatedUserId: string;
    campaignId: string;
    label: string;
    expiresAt: Date | null;
    revokedAt: Date | null;
  }>;
  confirmations: Array<{
    id: string;
    credentialId: string;
    delegatedUserId: string;
    campaignId: string;
    extensionId: string;
    commandId: string;
    inputDigest: string;
    state: "PENDING" | "APPROVED" | "CONSUMED" | "EXPIRED";
    receiptHash: string | null;
    expiresAt: Date;
    createdAt: Date;
  }>;
  grants: ExtensionGrantRecord[];
  idempotency: Array<{
    principalType: string;
    principalId: string;
    scopeCampaignId: string;
    commandType: string;
    idempotencyKey: string;
    requestDigest: string;
  }>;
  audits: Array<Record<string, unknown>>;
} = {
  credentials: [],
  confirmations: [],
  grants: [],
  idempotency: [],
  audits: [],
};

const mockRuntime: { current: ReturnType<typeof createRuntime> | null } = {
  current: null,
};

jest.mock("../../../config/database", () => ({
  prisma: {
    campaignMembership: {
      findUnique: async ({
        where,
      }: {
        where: { userId_campaignId: { userId: string; campaignId: string } };
      }) =>
        where.userId_campaignId.userId === "human-1" &&
        where.userId_campaignId.campaignId === "campaign-1"
          ? { userId: "human-1" }
          : null,
    },
    extensionGrant: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        mockState.grants.find(
          (grant) =>
            grant.principalType === where.principalType &&
            grant.principalId === where.principalId &&
            grant.scopeCampaignId === where.scopeCampaignId &&
            grant.extensionId === where.extensionId &&
            grant.permission === where.permission &&
            grant.revokedAt === null,
        ) ?? null,
      findMany: async () => mockState.grants,
      upsert: async ({
        create,
      }: {
        create: Omit<ExtensionGrantRecord, "id" | "createdAt">;
      }) => {
        const existing = mockState.grants.find(
          (grant) =>
            grant.principalType === create.principalType &&
            grant.principalId === create.principalId &&
            grant.scopeCampaignId === create.scopeCampaignId &&
            grant.extensionId === create.extensionId &&
            grant.permission === create.permission,
        );
        if (existing) return existing;
        const grant: ExtensionGrantRecord = {
          id: `grant-${mockState.grants.length + 1}`,
          principalType: create.principalType,
          principalId: create.principalId,
          scopeCampaignId: create.scopeCampaignId,
          extensionId: create.extensionId,
          permission: create.permission,
          expiresAt: create.expiresAt,
          revokedAt: null,
          createdAt: new Date(),
        };
        mockState.grants.push(grant);
        return grant;
      },
      updateMany: async () => ({ count: 0 }),
    },
    agentCredential: {
      create: async ({
        data,
      }: {
        data: Omit<(typeof mockState.credentials)[number], "id" | "revokedAt">;
      }) => {
        const credential = {
          ...data,
          id: `credential-${mockState.credentials.length + 1}`,
          revokedAt: null,
        };
        mockState.credentials.push(credential);
        return credential;
      },
      findMany: async () => mockState.credentials,
      updateMany: async () => ({ count: 0 }),
      findFirst: async ({ where }: { where: { credentialHash: string } }) =>
        mockState.credentials.find(
          (credential) =>
            credential.credentialHash === where.credentialHash &&
            credential.revokedAt === null,
        ) ?? null,
      update: async () => undefined,
    },
    agentConfirmation: {
      create: async ({
        data,
      }: {
        data: Omit<
          (typeof mockState.confirmations)[number],
          "id" | "state" | "receiptHash" | "createdAt"
        >;
      }) => {
        const confirmation = {
          ...data,
          id: `confirmation-${mockState.confirmations.length + 1}`,
          state: "PENDING" as const,
          receiptHash: null,
          createdAt: new Date(),
        };
        mockState.confirmations.push(confirmation);
        return confirmation;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const confirmation = mockState.confirmations.find(
          (candidate) =>
            candidate.id === where.id ||
            (candidate.receiptHash === where.receiptHash &&
              candidate.credentialId === where.credentialId &&
              candidate.commandId === where.commandId &&
              candidate.state === where.state),
        );
        if (
          !confirmation ||
          confirmation.delegatedUserId !== where.delegatedUserId
        )
          return { count: 0 };
        if (where.state !== undefined && confirmation.state !== where.state)
          return { count: 0 };
        if (
          confirmation.expiresAt <=
          ((where.expiresAt as { gt: Date } | undefined)?.gt ?? new Date())
        )
          return { count: 0 };
        if (typeof data.state === "string")
          confirmation.state = data.state as (typeof confirmation)["state"];
        if (typeof data.receiptHash === "string")
          confirmation.receiptHash = data.receiptHash;
        return { count: 1 };
      },
      findMany: async () => mockState.confirmations,
    },
    agentAuditRecord: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        mockState.audits.push(data);
        return data;
      },
    },
    commandIdempotencyRecord: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        mockState.idempotency.push({
          principalType: data.principalType as string,
          principalId: data.principalId as string,
          scopeCampaignId: data.scopeCampaignId as string,
          commandType: data.commandType as string,
          idempotencyKey: data.idempotencyKey as string,
          requestDigest: data.requestDigest as string,
        });
        return data;
      },
      update: async () => undefined,
    },
  },
}));

jest.mock("../../../composition/productionExtensionRuntime", () => ({
  productionExtensionRuntime: () => {
    if (!mockRuntime.current) throw new Error("Test runtime is not configured");
    return mockRuntime.current;
  },
}));

import agentRoutes from "../../../routes/agent";
import extensionRoutes from "../../../routes/extensions";

const extensionId = "cozyvtt.sandbox-route-fixture";
const commandId = "sandbox.fixture.echo";
const toolId = "sandbox_echo";

class MemoryInstallations implements ExtensionInstallationRepository {
  private readonly records = new Map<string, ExtensionInstallation>();

  async find(extensionIdToFind: string): Promise<ExtensionInstallation | null> {
    return this.records.get(extensionIdToFind) ?? null;
  }

  async list(): Promise<ExtensionInstallation[]> {
    return [...this.records.values()];
  }

  async save(
    input: Omit<ExtensionInstallation, "installedAt" | "updatedAt">,
  ): Promise<ExtensionInstallation> {
    const previous = this.records.get(input.extensionId);
    const record: ExtensionInstallation = {
      ...input,
      installedAt: previous?.installedAt ?? new Date(),
      updatedAt: new Date(),
    };
    this.records.set(record.extensionId, record);
    return record;
  }

  async remove(extensionIdToRemove: string): Promise<void> {
    this.records.delete(extensionIdToRemove);
  }
}

function createRuntime(root: string, installations: MemoryInstallations) {
  const registry = new ExtensionRegistry();
  const bus = new CommandBus();
  const policy: ExtensionPolicyPort = {
    check: async ({ principal, scope, extensionId: requestedExtensionId }) => ({
      allowed: mockState.grants.some(
        (grant) =>
          grant.principalType === "AGENT" &&
          grant.principalId === principal.id &&
          grant.scopeCampaignId === scope.campaignId &&
          grant.extensionId === requestedExtensionId &&
          grant.permission === "EXECUTE" &&
          grant.revokedAt === null,
      ),
      missing: [],
    }),
  };
  const bridge = new ExtensionCommandBridge(
    registry,
    bus,
    policy,
    {
      record: async (event) => {
        mockState.audits.push({
          commandType: event.commandId ?? event.toolId ?? "extension.catalog",
          inputDigest: event.inputDigest ?? "sha256:catalog-no-input",
          extensionId: event.extensionId,
          decision: event.outcome,
        });
      },
    },
    [],
  );
  const catalog = new LocalExtensionPackageCatalog(root);
  const sandbox = new NodeBubblewrapSandbox(catalog, 1, 1_000);
  const proxy = new SandboxRegistryProxy(registry, bus, bridge, sandbox);
  const supervisor = new SandboxedExtensionSupervisor(sandbox);
  const lifecycle = {
    activate: async (installation: ExtensionInstallation) => {
      await supervisor.activate(installation);
      await proxy.activate(installation);
    },
    deactivate: async (installation: ExtensionInstallation) => {
      await proxy.deactivate(installation.extensionId);
      await supervisor.deactivate(installation);
    },
  };
  const host = new ExtensionHostService(
    catalog,
    { assertTrusted: async () => undefined },
    installations,
    registry,
    undefined,
    lifecycle,
  );
  return {
    registry,
    bridge,
    host,
    rehydrate: async () => {
      for (const installation of await host.list())
        if (
          installation.state === "active" &&
          installation.installMode === "sandboxed"
        )
          await host.activate(installation.extensionId);
    },
  };
}

function app(): express.Express {
  const application = express();
  application.use(express.json());
  application.use(
    session({ secret: "sandbox-e2e", resave: false, saveUninitialized: false }),
  );
  application.use((req, _res, next) => {
    req.session.userId = "human-1";
    req.session.platformRole = "ADMIN";
    next();
  });
  application.use("/api/admin/extensions", extensionRoutes);
  application.use("/api/agent", agentRoutes);
  return application;
}

describe("sandboxed extension agent route reachability", () => {
  const roots: string[] = [];

  beforeEach(() => {
    mockState.credentials.splice(0);
    mockState.confirmations.splice(0);
    mockState.grants.splice(0);
    mockState.idempotency.splice(0);
    mockState.audits.splice(0);
    mockRuntime.current = null;
  });

  afterEach(async () => {
    await Promise.all(
      roots
        .splice(0)
        .map((root) => fs.rm(root, { recursive: true, force: true })),
    );
  });

  it("reaches a real bubblewrap sandbox only after durable grant and separate human approval, then survives lifecycle changes", async () => {
    const root = await writeSandboxPackage();
    const installations = new MemoryInstallations();
    mockRuntime.current = createRuntime(root, installations);
    const application = app();

    expect(
      (
        await request(application)
          .post("/api/admin/extensions/install")
          .send({ packageId: extensionId, mode: "sandboxed" })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(application).post(
          `/api/admin/extensions/${extensionId}/activate`,
        )
      ).status,
    ).toBe(200);

    const issued = await request(application)
      .post("/api/agent/credentials")
      .send({ campaignId: "campaign-1", label: "Sandbox test agent" });
    expect(issued.status).toBe(201);
    const credentialId = issued.body.credential.id as string;
    const bearer = { Authorization: `Bearer ${issued.body.token as string}` };

    expect(
      (
        await request(application).post("/api/admin/extensions/grants").send({
          principalType: "AGENT",
          principalId: credentialId,
          scopeCampaignId: "campaign-1",
          extensionId,
          permission: "EXECUTE",
        })
      ).status,
    ).toBe(201);

    const catalog = await request(application)
      .get("/api/agent/campaigns/campaign-1/catalog")
      .set(bearer);
    expect(catalog.status).toBe(200);
    expect(catalog.body.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: toolId,
          extensionId,
          confirmationRequired: true,
        }),
      ]),
    );

    const scopeMismatch = await request(application)
      .post("/api/agent/campaigns/campaign-1/confirmations")
      .set(bearer)
      .send({
        toolId,
        input: { campaignId: "campaign-2", message: "wrong scope" },
      });
    expect(scopeMismatch.status).toBe(400);

    const pending = await request(application)
      .post("/api/agent/campaigns/campaign-1/confirmations")
      .set(bearer)
      .send({ toolId, input: { message: "hello from agent" } });
    expect(pending.status).toBe(202);
    expect(pending.body.receipt).toBeUndefined();

    const pendingList = await request(application).get(
      "/api/agent/confirmations/pending",
    );
    expect(pendingList.body.confirmations).toEqual([
      expect.objectContaining({ id: pending.body.confirmationId }),
    ]);
    const approval = await request(application).post(
      `/api/agent/confirmations/${pending.body.confirmationId as string}/approve`,
    );
    expect(approval.status).toBe(200);

    const invoked = await request(application)
      .post(`/api/agent/campaigns/campaign-1/tools/${toolId}`)
      .set(bearer)
      .set("Idempotency-Key", "sandbox-e2e-request-1")
      .set("X-Agent-Confirmation", approval.body.receipt as string)
      .send({ input: { message: "hello from agent" } });
    expect(invoked.status).toBe(200);
    expect(invoked.body).toMatchObject({
      toolId,
      commandId,
      extensionId,
      result: {
        data: {
          campaignId: "campaign-1",
          message: "hello from agent",
          apiToken: "[REDACTED]",
        },
        redactedFields: 1,
      },
    });
    expect(mockState.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          commandType: commandId,
          inputDigest: expect.stringMatching(/^sha256:/),
        }),
      ]),
    );
    expect(mockState.idempotency).toEqual([
      expect.objectContaining({
        commandType: commandId,
        idempotencyKey: "sandbox-e2e-request-1",
      }),
    ]);

    const receiptReplay = await request(application)
      .post(`/api/agent/campaigns/campaign-1/tools/${toolId}`)
      .set(bearer)
      .set("Idempotency-Key", "sandbox-e2e-request-2")
      .set("X-Agent-Confirmation", approval.body.receipt as string)
      .send({ input: { message: "hello from agent" } });
    expect(receiptReplay.status).toBe(409);

    expect(
      (
        await request(application).post(
          `/api/admin/extensions/${extensionId}/deactivate`,
        )
      ).status,
    ).toBe(200);
    const afterDeactivation = await request(application)
      .get("/api/agent/campaigns/campaign-1/catalog")
      .set(bearer);
    expect(afterDeactivation.body.commands).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: toolId })]),
    );

    expect(
      (
        await request(application).post(
          `/api/admin/extensions/${extensionId}/activate`,
        )
      ).status,
    ).toBe(200);
    const restarted = createRuntime(root, installations);
    mockRuntime.current = restarted;
    await restarted.rehydrate();
    const afterRestart = await request(application)
      .get("/api/agent/campaigns/campaign-1/catalog")
      .set(bearer);
    expect(afterRestart.body.commands).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: toolId })]),
    );
  });

  async function writeSandboxPackage(): Promise<string> {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "cozy-sandbox-route-"),
    );
    roots.push(root);
    const packagePath = path.join(root, "fixture");
    await fs.mkdir(packagePath);
    const runner = `
function reply(id, ok, result) {
  process.stdout.write(JSON.stringify({ version: 1, id, ok, result }) + "\\n");
}
process.stdin.once("data", (buffer) => {
  const request = JSON.parse(buffer.toString("utf8"));
  if (request.method === "activate" || request.method === "deactivate") {
    reply(request.id, true, {});
    return;
  }
  const input = request.params.input;
  reply(request.id, true, {
    campaignId: input.campaignId,
    message: input.message,
    apiToken: "sandbox-secret",
  });
});
`;
    await fs.writeFile(path.join(packagePath, "runner.js"), runner);
    const checksum = `sha256:${createHash("sha256")
      .update("runner.js")
      .update("\\0")
      .update(runner)
      .update("\\0")
      .digest("hex")}`;
    await fs.writeFile(
      path.join(packagePath, "cozyvtt.extension.json"),
      JSON.stringify({
        packageFormat: "cozyvtt-extension-package/1",
        manifest: {
          manifestVersion: "1.0",
          id: extensionId,
          name: "Sandbox route fixture",
          version: "1.0.0",
          description: "A real bubblewrap extension route fixture.",
          compatibility: { extensionApi: "^1.0.0", cozyVtt: "^1.1.0" },
          capabilities: ["commands", "agent-tools"],
          permissions: ["campaign.write"],
          commands: [
            {
              id: commandId,
              version: "1.0.0",
              title: "Echo sandbox input",
              description: "Returns an agent-approved sandbox echo.",
              inputSchema: {
                type: "object",
                properties: {
                  campaignId: { type: "string" },
                  message: { type: "string", minLength: 1 },
                },
                required: ["campaignId", "message"],
                additionalProperties: false,
              },
              outputSchema: {
                type: "object",
                properties: {
                  campaignId: { type: "string" },
                  message: { type: "string" },
                  apiToken: { type: "string" },
                },
                required: ["campaignId", "message", "apiToken"],
                additionalProperties: false,
              },
              requiredPermissions: ["campaign.write"],
              idempotent: true,
            },
          ],
          agentTools: [
            {
              id: toolId,
              title: "Echo through sandbox",
              description: "Executes one sandboxed campaign-scoped command.",
              commandId,
              requiredPermissions: ["campaign.write"],
              risk: "high",
              confirmation: "always",
            },
          ],
        },
        entrypoint: "runner.js",
        checksum,
        dependencies: {},
        contributions: { themes: [] },
      }),
    );
    return root;
  }
});
