import { createHash, randomUUID } from "crypto";
import express from "express";
import session from "express-session";
import request from "supertest";
import { prisma } from "../config/database";
import { sha256Digest } from "../application/agents/AgentPrincipalAuthenticator";
import { productionMcpOAuthRouter } from "../composition/productionMcpOAuth";
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
  });

  afterAll(async () => {
    const oauthCredentials = await prisma.mcpOAuthRefreshToken.findMany({
      where: { delegatedUserId: ownerId },
      select: { credentialId: true },
    });
    const allCredentialIds = [
      credentialId,
      ...oauthCredentials.map(({ credentialId: id }) => id),
    ];
    await prisma.agentAuditRecord.deleteMany({
      where: { principalId: { in: allCredentialIds } },
    });
    await prisma.mcpOAuthRefreshToken.deleteMany({
      where: { delegatedUserId: ownerId },
    });
    await prisma.mcpOAuthAuthorization.deleteMany({
      where: { delegatedUserId: ownerId },
    });
    await prisma.agentCredential.deleteMany({
      where: { id: { in: allCredentialIds } },
    });
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
        .post("/api/mcp")
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
        expect.objectContaining({ name: "query_campaign_snapshot_get" }),
        expect.objectContaining({ name: "query_campaign_events_read" }),
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

    await prisma.campaignEventRecord.create({
      data: {
        campaignId,
        type: "initiative.turn.started",
        correlationId: "mcp-event-test",
        payload: { actorId: "npc-1" },
      },
    });
    const events = await post({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "query_campaign_events_read",
        arguments: { afterCursor: "0", limit: 10 },
      },
    }).expect(200);
    expect(events.body.result).toMatchObject({
      structuredContent: {
        result: expect.arrayContaining([
          expect.objectContaining({
            type: "initiative.turn.started",
            correlationId: "mcp-event-test",
          }),
        ]),
      },
    });
  });

  it("rejects missing bearer credentials", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/mcp", mcpRoutes);
    await request(app)
      .post("/api/mcp")
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
      .expect(401);
  });

  it("connects through OAuth discovery, one browser approval, and no explicit grants", async () => {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(
      session({
        secret: "mcp-oauth-test-session-secret",
        resave: false,
        saveUninitialized: false,
      }),
    );
    app.get("/__test/login", (req, res) => {
      req.session.userId = ownerId;
      res.status(204).send();
    });
    app.use(productionMcpOAuthRouter());
    app.use("/api/mcp", mcpRoutes);

    const redirectUri = "http://127.0.0.1:49152/callback";
    const registered = await request(app)
      .post("/register")
      .send({
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        client_name: "Table helper",
      })
      .expect(201);
    const clientId = registered.body.client_id as string;
    const verifier = "cozyvtt-oauth-pkce-verifier-that-is-long-enough";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const authorization = await request(app)
      .get("/authorize")
      .query({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "client-state",
        resource: "http://localhost:4000/api/mcp",
        scope: "mcp",
      })
      .expect(302);
    const requestId = new URL(authorization.headers.location).searchParams.get(
      "request",
    );
    expect(requestId).toEqual(expect.any(String));

    const browser = request.agent(app);
    await browser.get("/__test/login").expect(204);
    const view = await browser
      .get(`/api/mcp/oauth/requests/${requestId}`)
      .expect(200);
    expect(view.body).toMatchObject({
      clientName: "Table helper",
      campaigns: [expect.objectContaining({ id: campaignId, role: "DM" })],
    });
    const approved = await browser
      .post(`/api/mcp/oauth/requests/${requestId}/approve`)
      .send({ campaignId })
      .expect(200);
    const callback = new URL(approved.body.redirectUrl);
    expect(callback.searchParams.get("state")).toBe("client-state");
    const code = callback.searchParams.get("code");
    expect(code).toEqual(expect.any(String));

    const exchanged = await request(app)
      .post("/token")
      .type("form")
      .send({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        resource: "http://localhost:4000/api/mcp",
      })
      .expect(200);
    expect(exchanged.body).toMatchObject({
      token_type: "Bearer",
      scope: "mcp",
    });
    expect(exchanged.body.access_token).toEqual(expect.any(String));
    expect(exchanged.body.refresh_token).toEqual(expect.any(String));

    const refreshed = await request(app)
      .post("/token")
      .type("form")
      .send({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: exchanged.body.refresh_token,
        resource: "http://localhost:4000/api/mcp",
      })
      .expect(200);
    expect(refreshed.body.access_token).not.toBe(exchanged.body.access_token);
    expect(refreshed.body.refresh_token).not.toBe(exchanged.body.refresh_token);
    await request(app)
      .post("/token")
      .type("form")
      .send({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: exchanged.body.refresh_token,
      })
      .expect(400);

    const listed = await request(app)
      .post("/api/mcp")
      .set("Authorization", `Bearer ${refreshed.body.access_token}`)
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 7, method: "tools/list", params: {} })
      .expect(200);
    expect(listed.body.result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "query_campaign_summary_get" }),
      ]),
    );
    expect(
      await prisma.extensionGrant.count({
        where: {
          principalType: "AGENT",
          scopeCampaignId: campaignId,
        },
      }),
    ).toBe(0);

    await request(app)
      .post("/revoke")
      .type("form")
      .send({
        client_id: clientId,
        token: refreshed.body.refresh_token,
        token_type_hint: "refresh_token",
      })
      .expect(200);
    await request(app)
      .post("/api/mcp")
      .set("Authorization", `Bearer ${refreshed.body.access_token}`)
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 8, method: "tools/list", params: {} })
      .expect(401);

    await prisma.mcpOAuthClient.deleteMany({ where: { clientId } });
  });
});
