import express from "express";
import request from "supertest";

const findUnique = jest.fn();
const update = jest.fn();
const broadcastToCampaign = jest.fn();

jest.mock("../../config/database", () => ({
  prisma: { map: { findUnique, update } },
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
  campaignDMOrPlayer: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));

jest.mock("../../websocket/utils", () => ({ broadcastToCampaign }));

import mapRoutes from "../maps";

const campaignId = "campaign-1";
const mapId = "map-1";
const wallId = "11111111-1111-4111-8111-111111111111";
const lightId = "22222222-2222-4222-8222-222222222222";

let currentMap: Record<string, unknown>;

function resetMap(overrides: Record<string, unknown> = {}): void {
  currentMap = {
    id: mapId,
    revision: 0,
    campaignId,
    width: 3,
    height: 2,
    gridSize: 50,
    wallSegments: [],
    fogData: null,
    lights: [],
    lightingEnabled: false,
    ...overrides,
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
}

function app(): express.Express {
  const server = express();
  server.use(express.json());
  server.use("/api/campaigns/:campaignId/maps", mapRoutes);
  return server;
}

const wall = {
  id: wallId,
  x1: 0,
  y1: 0,
  x2: 50,
  y2: 0,
  type: "wall",
};

const light = {
  id: lightId,
  x: 25,
  y: 25,
  brightRadius: 3,
  dimRadius: 6,
  color: "#ffcc66",
  enabled: true,
};

describe("map scene REST adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMap();
  });

  it("routes wall writes through the scene command while preserving response shapes", async () => {
    const server = app();

    const created = await request(server)
      .post(`/api/campaigns/${campaignId}/maps/${mapId}/walls`)
      .send(wall);
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ segment: wall, total: 1 });

    const patched = await request(server)
      .patch(`/api/campaigns/${campaignId}/maps/${mapId}/walls/${wallId}`)
      .send({ type: "door-open" });
    expect(patched.status).toBe(200);
    expect(patched.body.segment.type).toBe("door-open");

    const deleted = await request(server).delete(
      `/api/campaigns/${campaignId}/maps/${mapId}/walls/${wallId}`,
    );
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ message: "Wall segment deleted" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ wallSegments: [] }),
      }),
    );
  });

  it("routes light writes through the scene command and preserves broadcasts", async () => {
    const server = app();

    const created = await request(server)
      .post(`/api/campaigns/${campaignId}/maps/${mapId}/lights`)
      .send(light);
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ light, total: 1 });
    expect(broadcastToCampaign).toHaveBeenCalledWith(
      campaignId,
      "light:added",
      { mapId, light },
    );

    const patched = await request(server)
      .patch(`/api/campaigns/${campaignId}/maps/${mapId}/lights/${lightId}`)
      .send({ enabled: false });
    expect(patched.status).toBe(200);
    expect(patched.body.light.enabled).toBe(false);

    const deleted = await request(server).delete(
      `/api/campaigns/${campaignId}/maps/${mapId}/lights/${lightId}`,
    );
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ message: "Light source deleted" });
    expect(broadcastToCampaign).toHaveBeenCalledWith(
      campaignId,
      "light:removed",
      { mapId, lightId },
    );
  });

  it("routes fog operations through the scene command with its established payload", async () => {
    const response = await request(app())
      .post(`/api/campaigns/${campaignId}/maps/${mapId}/fog/operation`)
      .send({ op: "reveal", cells: [0, 99] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      fogState: {
        fogCols: 3,
        fogRows: 2,
        cellPx: 50,
        revealed: [true, false, false, false, false, false],
      },
    });
  });

  it("routes dynamic-lighting toggles through the scene command and retains the broadcast", async () => {
    const response = await request(app())
      .put(`/api/campaigns/${campaignId}/maps/${mapId}/lighting`)
      .send({ enabled: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ lightingEnabled: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lightingEnabled: true }),
      }),
    );
    expect(broadcastToCampaign).toHaveBeenCalledWith(
      campaignId,
      "map:lighting:updated",
      {
        mapId,
        lightingEnabled: true,
      },
    );
  });

  it("preserves REST validation and campaign-scoped map rejection before dispatch", async () => {
    const server = app();
    const invalid = await request(server)
      .post(`/api/campaigns/${campaignId}/maps/${mapId}/walls`)
      .send({ ...wall, x1: "not-a-number" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe("Validation Error");

    currentMap = { ...currentMap, campaignId: "another-campaign" };
    const wrongCampaign = await request(server)
      .put(`/api/campaigns/${campaignId}/maps/${mapId}/lighting`)
      .send({ enabled: true });
    expect(wrongCampaign.status).toBe(404);
    expect(wrongCampaign.body).toEqual({
      error: "Not Found",
      message: "Map not found in this campaign",
    });
  });
});
