import { randomUUID } from "crypto";
import express from "express";
import request from "supertest";
import { prisma } from "../config/database";
import { sha256Digest } from "../application/agents/AgentPrincipalAuthenticator";
import { CORE_AGENT_EXTENSION_ID } from "../application/agents/CoreAgentCatalog";
import mcpRoutes from "./mcp";

const describeDatabase =
  process.env.RUN_DATABASE_TESTS === "true" && process.env.DATABASE_URL
    ? describe
    : describe.skip;

describeDatabase("MCP Streamable HTTP adapter", () => {
  const ownerId = randomUUID();
  const credentialToken = `cozyvtt_test_${randomUUID()}`;
  let campaignId = "";
  let credentialId = "";

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        id: ownerId,
        email: `mcp-${ownerId}@example.invalid`,
        passwordHash: "not-used",
        displayName: "MCP Test",
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        name: "MCP Test",
        ownerId: owner.id,
        vibeSettings: {},
        memberships: {
          create: { userId: owner.id, role: "DM" },
        },
      },
    });
    campaignId = campaign.id;
    const credential = await prisma.agentCredential.create({
      data: {
        credentialHash: sha256Digest(credentialToken),
        delegatedUserId: owner.id,
        campaignId,
        label: "MCP integration",
        createdById: owner.id,
      },
    });
    credentialId = credential.id;
    await prisma.extensionGrant.create({
      data: {
        principalType: "AGENT",
        principalId: credential.id,
        scopeCampaignId: campaignId,
        extensionId: CORE_AGENT_EXTENSION_ID,
        permission: "READ",
        grantedById: owner.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.agentAuditRecord.deleteMany({
      where: { principalId: credentialId },
    });
    await prisma.extensionGrant.deleteMany({
      where: { principalId: credentialId },
    });
    await prisma.agentCredential.deleteMany({ where: { id: credentialId } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it("authenticates, discovers, and calls a campaign-scoped query over HTTP", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/mcp", mcpRoutes);
    const post = (body: Record<string, unknown>) =>
      request(app)
        .post(`/api/mcp/campaigns/${campaignId}`)
        .set("Authorization", `Bearer ${credentialToken}`)
        .set("Accept", "application/json, text/event-stream")
        .set("MCP-Protocol-Version", "2025-03-26")
        .send(body);

    await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "cozyvtt-test", version: "1.0.0" },
      },
    }).expect(200);

    const listed = await post({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }).expect(200);
    expect(listed.body.result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "query_campaign_summary_get" }),
      ]),
    );

    const called = await post({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "query_campaign_summary_get", arguments: {} },
    }).expect(200);
    expect(called.body.result.structuredContent).toMatchObject({
      id: campaignId,
      name: "MCP Test",
    });
  });

  it("rejects missing bearer credentials", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/mcp", mcpRoutes);
    await request(app)
      .post(`/api/mcp/campaigns/${campaignId}`)
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
      .expect(401);
  });
});
