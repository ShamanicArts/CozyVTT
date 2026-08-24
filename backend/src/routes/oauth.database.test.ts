import { createHash, randomUUID } from "crypto";
import express from "express";
import session from "express-session";
import request from "supertest";
import { prisma } from "../config/database";
import { sha256Digest } from "../application/oauth/OAuthService";
import { productionOAuthRouter } from "../composition/productionOAuth";
import { productionHttpTransportRegistry } from "../composition/productionExtensionRuntime";
import oauthConsentRoutes from "./oauthConsent";
import pluginTransportRoutes from "./pluginTransports";

const describeDatabase =
  process.env.RUN_DATABASE_TESTS === "true" && process.env.DATABASE_URL
    ? describe
    : describe.skip;

describeDatabase("OAuth platform service", () => {
  const ownerId = randomUUID();
  const credentialToken = `cozyvtt_test_${randomUUID()}`;
  let campaignId = "";
  let credentialId = "";
  let unregisterResource: (() => void) | undefined;

  beforeAll(async () => {
    unregisterResource = productionHttpTransportRegistry.register(
      "test-plugin",
      [{ id: "events", method: "GET", path: "/events", oauthResourceId: "event-stream", requiredScopes: ["events:read"] }],
      [{ id: "event-stream", path: "/events", scopes: ["events:read"] }],
      { events: async (_request, context) => Response.json(context.authorization) },
    );
    const owner = await prisma.user.create({
      data: {
        id: ownerId,
        email: `oauth-${ownerId}@example.invalid`,
        passwordHash: "not-used",
        displayName: "OAuth Test",
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        name: "OAuth Test",
        ownerId: owner.id,
        vibeSettings: {},
        memberships: {
          create: { userId: owner.id, role: "DM" },
        },
      },
    });
    campaignId = campaign.id;
    const credential = await prisma.delegatedPluginCredential.create({
      data: {
        credentialHash: sha256Digest(credentialToken),
        delegatedUserId: owner.id,
        campaignId,
        label: "OAuth integration",
        createdById: owner.id,
      },
    });
    credentialId = credential.id;
  });

  afterAll(async () => {
    const oauthCredentials = await prisma.oAuthRefreshToken.findMany({
      where: { delegatedUserId: ownerId },
      select: { credentialId: true },
    });
    const allCredentialIds = [
      credentialId,
      ...oauthCredentials.map(({ credentialId: id }) => id),
    ];
    await prisma.capabilityAuditRecord.deleteMany({
      where: { principalId: { in: allCredentialIds } },
    });
    await prisma.oAuthRefreshToken.deleteMany({
      where: { delegatedUserId: ownerId },
    });
    await prisma.oAuthAuthorization.deleteMany({
      where: { delegatedUserId: ownerId },
    });
    await prisma.delegatedPluginCredential.deleteMany({
      where: { id: { in: allCredentialIds } },
    });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    unregisterResource?.();
    await prisma.$disconnect();
  });

  it("issues resource-bound tokens and passes delegated context to a plugin", async () => {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(
      session({
        secret: "oauth-test-session-secret",
        resave: false,
        saveUninitialized: false,
      }),
    );
    app.get("/__test/login", (req, res) => {
      req.session.userId = ownerId;
      res.status(204).send();
    });
    app.use(productionOAuthRouter());
    app.use("/api/oauth", oauthConsentRoutes);
    app.use("/api/plugin-transports", pluginTransportRoutes);

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
        resource: "http://localhost:4000/api/plugin-transports/test-plugin/events",
        scope: "events:read",
      })
      .expect(302);
    const requestId = new URL(authorization.headers.location).searchParams.get(
      "request",
    );
    expect(requestId).toEqual(expect.any(String));

    const browser = request.agent(app);
    await browser.get("/__test/login").expect(204);
    const view = await browser
      .get(`/api/oauth/requests/${requestId}`)
      .expect(200);
    expect(view.body).toMatchObject({
      clientName: "Table helper",
      campaigns: [expect.objectContaining({ id: campaignId, role: "DM" })],
    });
    const approved = await browser
      .post(`/api/oauth/requests/${requestId}/approve`)
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
        resource: "http://localhost:4000/api/plugin-transports/test-plugin/events",
      })
      .expect(200);
    expect(exchanged.body).toMatchObject({
      token_type: "Bearer",
      scope: "events:read",
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
        resource: "http://localhost:4000/api/plugin-transports/test-plugin/events",
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

    const context = await request(app)
      .get("/api/plugin-transports/test-plugin/events")
      .set("Authorization", `Bearer ${refreshed.body.access_token}`)
      .expect(200);
    expect(context.body).toMatchObject({ campaignId, delegatedUserId: ownerId, resourceId: "event-stream", scopes: ["events:read"] });
    expect(
      await prisma.extensionGrant.count({
        where: {
          principalType: "PLUGIN",
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
      .get("/api/plugin-transports/test-plugin/events")
      .set("Authorization", `Bearer ${refreshed.body.access_token}`)
      .expect(401);

    await prisma.oAuthClient.deleteMany({ where: { clientId } });
  });
});
