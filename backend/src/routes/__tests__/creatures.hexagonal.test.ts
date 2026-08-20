import express from "express";
import session from "express-session";
import request from "supertest";

const findUnique = jest.fn(),
  create = jest.fn(),
  update = jest.fn(),
  remove = jest.fn(),
  favFind = jest.fn(),
  favCreate = jest.fn(),
  favDelete = jest.fn();
const seed = jest.fn(),
  status = jest.fn();
jest.mock("../../config/database", () => ({
  prisma: {
    creatureTemplate: { findUnique, create, update, delete: remove },
    creatureFavorite: {
      findUnique: favFind,
      create: favCreate,
      delete: favDelete,
    },
  },
}));
jest.mock("../../middleware/compose", () => ({
  campaignMember: (
    _q: express.Request,
    _s: express.Response,
    n: express.NextFunction,
  ) => n(),
  campaignDM: (
    _q: express.Request,
    _s: express.Response,
    n: express.NextFunction,
  ) => n(),
}));
jest.mock("../../services/creatureSeed", () => ({
  seedSrdCreatures: seed,
  getSrdSeedStatus: status,
}));
import routes from "../creatures";
const creature: any = {
  id: "c1",
  name: "Goblin",
  source: "custom",
  campaignId: "camp",
  gameSystem: null,
  challengeRating: null,
  creatureType: null,
  alignment: null,
  imageUrl: null,
  statBlock: {},
  size: { width: 1, height: 1 },
  disposition: "hostile",
  displayMode: "pog",
};
function app() {
  const x = express();
  x.use(express.json());
  x.use(session({ secret: "x", resave: false, saveUninitialized: false }));
  x.use((q, _s, n) => {
    q.session.userId = "u";
    n();
  });
  x.use("/api/campaigns/:campaignId/creatures", routes);
  return x;
}
beforeEach(() => {
  jest.clearAllMocks();
  findUnique.mockResolvedValue(creature);
  create.mockImplementation(async ({ data }: any) => data);
  update.mockImplementation(async ({ data }: any) => ({
    ...creature,
    ...data,
  }));
  remove.mockResolvedValue(creature);
  favFind.mockResolvedValue(null);
  favCreate.mockResolvedValue({});
  status.mockResolvedValue({ seeded: false, count: 0 });
});
describe("creature HTTP adapter", () => {
  it("keeps create/update/delete/duplicate/favorite contracts", async () => {
    const x = app();
    expect(
      (
        await request(x)
          .post("/api/campaigns/camp/creatures")
          .send({ name: "Orc", statBlock: {} })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(x)
          .put("/api/campaigns/camp/creatures/c1")
          .send({ name: "New" })
      ).status,
    ).toBe(200);
    expect(
      (await request(x).delete("/api/campaigns/camp/creatures/c1")).body,
    ).toEqual({ message: "Creature template deleted" });
    expect(
      (await request(x).post("/api/campaigns/camp/creatures/c1/duplicate"))
        .status,
    ).toBe(201);
    expect(
      (await request(x).post("/api/campaigns/camp/creatures/c1/favorite")).body,
    ).toEqual({ favorited: true });
  });
  it("returns seed success and protects concurrent seed", async () => {
    let release!: () => void;
    seed.mockImplementation(
      () =>
        new Promise((r) => {
          release = () => r({ created: 2, skipped: 1 });
        }),
    );
    const x = app();
    const first = request(x)
      .post("/api/campaigns/camp/creatures/seed")
      .then((r) => r);
    await new Promise((r) => setImmediate(r));
    expect(
      (await request(x).post("/api/campaigns/camp/creatures/seed")).status,
    ).toBe(409);
    release();
    expect((await first).body).toMatchObject({
      message: "SRD creature seeding complete",
      created: 2,
      skipped: 1,
    });
  });
});
