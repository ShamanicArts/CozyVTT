import express from "express";
import session from "express-session";
import request from "supertest";

const findMany = jest.fn();
const upsert = jest.fn();
const updateMany = jest.fn();

jest.mock("../../config/database", () => ({
  prisma: { extensionGrant: { findMany, upsert, updateMany } },
}));

import extensionRoutes from "../extensions";

function app(role: "ADMIN" | "USER"): express.Express {
  const application = express();
  application.use(express.json());
  application.use(
    session({ secret: "test", resave: false, saveUninitialized: false }),
  );
  application.use((req, _res, next) => {
    req.session.userId = "admin-1";
    req.session.platformRole = role;
    next();
  });
  application.use("/api/admin/extensions", extensionRoutes);
  return application;
}

describe("extension administration HTTP adapter", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires platform admin and creates exact scoped grants", async () => {
    expect(
      (await request(app("USER")).get("/api/admin/extensions/grants")).status,
    ).toBe(403);
    upsert.mockResolvedValue({
      id: "grant-1",
      extensionId: "cozyvtt.core-agent",
    });
    const response = await request(app("ADMIN"))
      .post("/api/admin/extensions/grants")
      .send({
        principalType: "USER",
        principalId: "user-1",
        scopeCampaignId: "campaign-1",
        extensionId: "cozyvtt.core-agent",
        permission: "EXECUTE",
      });
    expect(response.status).toBe(201);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          principalType_principalId_scopeCampaignId_extensionId_permission:
            expect.objectContaining({
              principalId: "user-1",
              scopeCampaignId: "campaign-1",
            }),
        },
      }),
    );
  });
});
