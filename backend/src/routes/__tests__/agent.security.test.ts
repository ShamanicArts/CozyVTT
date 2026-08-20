import express from "express";
import session from "express-session";
import request from "supertest";

const membershipFindUnique = jest.fn();
const grantFindFirst = jest.fn();
const credentialFindFirst = jest.fn();
const credentialUpdate = jest.fn();
const confirmationCreate = jest.fn();
const confirmationUpdateMany = jest.fn();
const auditCreate = jest.fn();
const idempotencyCreate = jest.fn();
const idempotencyUpdate = jest.fn();
const vibeFindUnique = jest.fn();
const campaignUpdate = jest.fn();
const outboxCreate = jest.fn();
const broadcastToCampaign = jest.fn();

jest.mock("../../config/database", () => ({
  prisma: {
    campaignMembership: { findUnique: membershipFindUnique },
    extensionGrant: { findFirst: grantFindFirst },
    agentCredential: {
      findFirst: credentialFindFirst,
      update: credentialUpdate,
    },
    agentConfirmation: {
      create: confirmationCreate,
      updateMany: confirmationUpdateMany,
    },
    agentAuditRecord: { create: auditCreate },
    commandIdempotencyRecord: {
      create: idempotencyCreate,
      update: idempotencyUpdate,
    },
    campaign: { findUnique: vibeFindUnique, update: campaignUpdate },
    outboxEvent: { create: outboxCreate },
    $transaction: async (work: (transaction: unknown) => Promise<unknown>) =>
      work({
        campaign: { findUnique: vibeFindUnique, update: campaignUpdate },
        extensionGrant: { findFirst: grantFindFirst },
        agentAuditRecord: { create: auditCreate },
        commandIdempotencyRecord: {
          create: idempotencyCreate,
          update: idempotencyUpdate,
        },
        outboxEvent: { create: outboxCreate },
      }),
  },
}));

jest.mock("../../websocket/utils", () => ({ broadcastToCampaign }));

import agentRoutes from "../agent";

function app(): express.Express {
  const application = express();
  application.use(express.json());
  application.use(
    session({ secret: "test", resave: false, saveUninitialized: false }),
  );
  application.use((req, _res, next) => {
    req.session.userId = "user-1";
    next();
  });
  application.use("/api/agent", agentRoutes);
  return application;
}

const bearer = { Authorization: "Bearer agent-secret-value" };

describe("agent HTTP adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    credentialFindFirst.mockResolvedValue({
      id: "credential-1",
      delegatedUserId: "user-1",
      campaignId: "campaign-1",
      label: "fixture",
      expiresAt: null,
      revokedAt: null,
    });
    membershipFindUnique.mockResolvedValue({ userId: "user-1" });
    credentialUpdate.mockResolvedValue({ id: "credential-1" });
    idempotencyCreate.mockResolvedValue({ id: "key-1" });
    idempotencyUpdate.mockResolvedValue({ id: "key-1" });
    vibeFindUnique.mockResolvedValue({ vibeSettings: {} });
    campaignUpdate.mockResolvedValue({ id: "campaign-1" });
    outboxCreate.mockResolvedValue({ id: "outbox-1" });
  });

  it("requires a bearer credential and default-denies without a durable agent grant", async () => {
    credentialFindFirst.mockResolvedValue(null);
    expect(
      (await request(app()).get("/api/agent/campaigns/campaign-1/catalog"))
        .status,
    ).toBe(401);

    credentialFindFirst.mockResolvedValue({
      id: "credential-1",
      delegatedUserId: "user-1",
      campaignId: "campaign-1",
    });
    grantFindFirst.mockResolvedValue(null);
    const catalog = await request(app())
      .get("/api/agent/campaigns/campaign-1/catalog")
      .set(bearer);
    expect(catalog.status).toBe(200);
    expect(catalog.body.commands).toEqual([]);
    expect(grantFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          principalType: "AGENT",
          principalId: "credential-1",
          scopeCampaignId: "campaign-1",
        }),
      }),
    );
  });

  it("separates agent request from human approval and consumes the approved receipt once", async () => {
    grantFindFirst.mockResolvedValue({ id: "grant-1" });
    confirmationCreate.mockResolvedValue({
      id: "confirmation-1",
      expiresAt: new Date("2026-08-20T12:05:00.000Z"),
    });
    const pending = await request(app())
      .post("/api/agent/campaigns/campaign-1/confirmations")
      .set(bearer)
      .send({
        commandId: "campaign.atmosphere.effect.set",
        input: { effect: "rain" },
      });
    expect(pending.status).toBe(202);
    expect(pending.body.receipt).toBeUndefined();

    confirmationUpdateMany.mockResolvedValueOnce({ count: 1 });
    const approval = await request(app()).post(
      "/api/agent/confirmations/confirmation-1/approve",
    );
    expect(approval.status).toBe(200);
    expect(approval.body.receipt).toEqual(expect.any(String));

    confirmationUpdateMany.mockResolvedValueOnce({ count: 0 });
    const changedInput = await request(app())
      .post(
        "/api/agent/campaigns/campaign-1/commands/campaign.atmosphere.effect.set",
      )
      .set(bearer)
      .set("Idempotency-Key", "idem-key-1")
      .set("X-Agent-Confirmation", approval.body.receipt)
      .send({ input: { effect: "mist" } });
    expect(changedInput.status).toBe(409);

    confirmationUpdateMany.mockResolvedValueOnce({ count: 1 });
    const accepted = await request(app())
      .post(
        "/api/agent/campaigns/campaign-1/commands/campaign.atmosphere.effect.set",
      )
      .set(bearer)
      .set("Idempotency-Key", "idem-key-1")
      .set("X-Agent-Confirmation", approval.body.receipt)
      .send({ input: { effect: "rain" } });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({
      commandId: "campaign.atmosphere.effect.set",
      result: "rain",
    });
    expect(broadcastToCampaign).toHaveBeenCalledTimes(1);
    expect(broadcastToCampaign).toHaveBeenCalledWith(
      "campaign-1",
      "atmosphere.effect.updated",
      expect.objectContaining({ effect: "rain", setBy: "user-1" }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          principalType: "AGENT",
          principalId: "credential-1",
          delegatedIdentity: "user-1",
        }),
      }),
    );

    confirmationUpdateMany.mockResolvedValueOnce({ count: 0 });
    const replay = await request(app())
      .post(
        "/api/agent/campaigns/campaign-1/commands/campaign.atmosphere.effect.set",
      )
      .set(bearer)
      .set("Idempotency-Key", "idem-key-2")
      .set("X-Agent-Confirmation", approval.body.receipt)
      .send({ input: { effect: "rain" } });
    expect(replay.status).toBe(409);
  });

  it("lists and executes a READ-granted campaign query without confirmation or idempotency", async () => {
    membershipFindUnique.mockResolvedValue({ userId: "user-1", role: "DM" });
    grantFindFirst.mockImplementation(
      async ({ where }: { where: { permission: string } }) =>
        where.permission === "READ" ? { id: "read-grant" } : null,
    );
    vibeFindUnique.mockResolvedValue({
      id: "campaign-1",
      name: "Lantern",
      description: null,
      status: "ACTIVE",
      currentVibe: null,
      spiritLayerEnabled: false,
    });
    const catalog = await request(app())
      .get("/api/agent/campaigns/campaign-1/catalog")
      .set(bearer);
    expect(catalog.body.commands).toEqual([]);
    expect(catalog.body.queries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "campaign.summary.get", risk: "READ" }),
      ]),
    );
    const response = await request(app())
      .post("/api/agent/campaigns/campaign-1/queries/campaign.summary.get")
      .set(bearer)
      .send({ input: {} });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      queryId: "campaign.summary.get",
      result: { id: "campaign-1" },
    });
    expect(idempotencyCreate).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          commandType: "campaign.summary.get",
          decision: "EXECUTED",
        }),
      }),
    );
  });
});
