import express from "express";
import session from "express-session";
import request from "supertest";

const findUnique = jest.fn();
const update = jest.fn();
const findMembership = jest.fn();

jest.mock("../../config/database", () => ({
  prisma: {
    map: { findUnique, update },
    campaignMembership: { findUnique: findMembership },
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

import mapRoutes from "../maps";

const campaignId = "campaign-1";
const mapId = "map-1";
let currentMap: Record<string, unknown>;

function resetMap(tokens: unknown[] = []): void {
  currentMap = {
    id: mapId,
    revision: 0,
    campaignId,
    width: 3,
    height: 2,
    tokens,
  };
  findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === mapId ? currentMap : null,
  );
  update.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: { id: string; revision: number };
      data: Record<string, unknown>;
    }) => {
      expect(where).toEqual({ id: mapId, revision: currentMap.revision });
      const fields = { ...data };
      delete fields.revision;
      currentMap = {
        ...currentMap,
        ...fields,
        revision: Number(currentMap.revision) + 1,
      };
      return currentMap;
    },
  );
  findMembership.mockResolvedValue({ role: "DM" });
}

function app(): express.Express {
  const server = express();
  server.use(express.json());
  server.use(
    session({ secret: "test", resave: false, saveUninitialized: false }),
  );
  server.use((req, _res, next) => {
    req.session.userId = "user-1";
    next();
  });
  server.use("/api/campaigns/:campaignId/maps", mapRoutes);
  return server;
}

describe("map token HTTP adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMap();
  });

  it("preserves create, update, and delete response contracts through map-token commands", async () => {
    const server = app();
    const created = await request(server)
      .post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`)
      .send({ name: "Lantern Bearer", position: { x: 1, y: 1 } });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      message: "Token added successfully",
      token: {
        name: "Lantern Bearer",
        imageUrl: "",
        layer: "token",
        type: "npc",
      },
    });

    const tokenId = created.body.token.id;
    const updated = await request(server)
      .put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${tokenId}`)
      .send({ statBlock: { ac: 13 }, displayMode: "full-art" });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      message: "Token updated successfully",
      token: { id: tokenId, statBlock: { ac: 13 }, displayMode: "full-art" },
    });

    const deleted = await request(server).delete(
      `/api/campaigns/${campaignId}/maps/${mapId}/tokens/${tokenId}`,
    );
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ message: "Token removed successfully" });
    expect(update).toHaveBeenLastCalledWith({
      where: { id: mapId, revision: 2 },
      data: { tokens: [], revision: { increment: 1 } },
    });
  });

  it("retains campaign scoping and validation errors before persistence", async () => {
    const server = app();
    const invalid = await request(server)
      .post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`)
      .send({ name: "Outside", position: { x: 3, y: 0 } });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({
      error: "Validation Error",
      message: "Token position must be within map bounds (0-2, 0-1)",
    });

    currentMap = { ...currentMap, campaignId: "another-campaign" };
    const wrongCampaign = await request(server)
      .post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`)
      .send({ name: "Scoped", position: { x: 0, y: 0 } });
    expect(wrongCampaign.status).toBe(404);
    expect(wrongCampaign.body).toEqual({
      error: "Not Found",
      message: "Map not found in this campaign",
    });
  });
});
