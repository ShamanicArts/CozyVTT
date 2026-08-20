import express from "express";
import session from "express-session";
import request from "supertest";

const create = jest.fn();
const findUnique = jest.fn();
const update = jest.fn();
const remove = jest.fn();
const membership = jest.fn();
const campaign = jest.fn();

jest.mock("../../config/database", () => ({
  prisma: {
    tokenTemplate: { create, findUnique, update, delete: remove },
    campaignMembership: { findUnique: membership },
    campaign: { findUnique: campaign },
  },
}));

jest.mock("../../middleware/compose", () => ({
  campaignMember: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
  campaignDM: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));

import tokenTemplateRoutes from "../tokenTemplates";

describe("token-template HTTP adapter", () => {
  const template = {
    id: "template-1",
    campaignId: "campaign-1",
    createdById: "user-1",
    name: "Owl",
    imageUrl: null,
    type: "npc",
    disposition: null,
    displayMode: "pog",
    size: { width: 1, height: 1 },
    notes: null,
    hp: null,
    showHpBar: false,
    statBlock: null,
    sightRadius: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  it("keeps the create API contract while dispatching through the application command", async () => {
    create.mockResolvedValue({
      id: "template-1",
      campaignId: "campaign-1",
      createdById: "user-1",
      name: "Clockwork Owl",
      imageUrl: null,
      type: "npc",
      disposition: "friendly",
      displayMode: "pog",
      size: { width: 1, height: 1 },
      notes: null,
      hp: { current: 3, max: 3, temp: 0 },
      showHpBar: true,
      statBlock: null,
      sightRadius: null,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      updatedAt: new Date("2025-01-01T00:00:00.000Z"),
    });

    const app = express();
    app.use(express.json());
    app.use(
      session({ secret: "test", resave: false, saveUninitialized: false }),
    );
    app.use((req, _res, next) => {
      req.session.userId = "user-1";
      next();
    });
    app.use("/api/campaigns/:campaignId/token-templates", tokenTemplateRoutes);

    const response = await request(app)
      .post("/api/campaigns/campaign-1/token-templates")
      .send({
        name: "Clockwork Owl",
        type: "npc",
        disposition: "friendly",
        displayMode: "pog",
        size: { width: 1, height: 1 },
        hp: { current: 3, max: 3, temp: 0 },
        showHpBar: true,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: "template-1",
      campaignId: "campaign-1",
      name: "Clockwork Owl",
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        campaignId: "campaign-1",
        createdById: "user-1",
        name: "Clockwork Owl",
        imageUrl: null,
        statBlock: expect.anything(),
      }),
    });
  });
  it("preserves update/delete/from-token/copy contracts", async () => {
    findUnique.mockResolvedValue(template);
    update.mockResolvedValue({ ...template, name: "New" });
    remove.mockResolvedValue(template);
    membership.mockResolvedValue({ role: "DM" });
    campaign.mockResolvedValue({ id: "target" });
    create.mockResolvedValue(template);
    const app = express();
    app.use(express.json());
    app.use(session({ secret: "x", resave: false, saveUninitialized: false }));
    app.use((req, _r, n) => {
      req.session.userId = "user-1";
      n();
    });
    app.use("/api/campaigns/:campaignId/token-templates", tokenTemplateRoutes);
    expect(
      (
        await request(app)
          .put("/api/campaigns/campaign-1/token-templates/template-1")
          .send({ name: "New" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app).delete(
          "/api/campaigns/campaign-1/token-templates/template-1",
        )
      ).body,
    ).toEqual({ message: "Token template deleted" });
    expect(
      (
        await request(app)
          .post("/api/campaigns/campaign-1/token-templates/from-token")
          .send({
            name: "x",
            type: "npc",
            displayMode: "pog",
            size: { width: 1, height: 1 },
            showHpBar: false,
          })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app).post(
          "/api/campaigns/campaign-1/token-templates/template-1/copy-to/campaign-1",
        )
      ).status,
    ).toBe(400);
  });
});
