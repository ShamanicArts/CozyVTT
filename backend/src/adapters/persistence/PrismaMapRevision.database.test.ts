import { randomUUID } from "crypto";
import { prisma } from "../../config/database";
import { MapRevisionConflictError } from "../../domain/maps/MapRevision";
import { updateMapAtRevision } from "./PrismaMapRevision";

const describeDatabase =
  process.env.RUN_DATABASE_TESTS === "true" && process.env.DATABASE_URL
    ? describe
    : describe.skip;

describeDatabase("map revision compare-and-swap against PostgreSQL", () => {
  const ownerId = randomUUID();
  const testEmailPrefix = "map-revision-";

  beforeAll(async () => {
    await prisma.campaign.deleteMany({
      where: { owner: { email: { startsWith: testEmailPrefix } } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: testEmailPrefix } },
    });
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { ownerId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it("allows exactly one of two concurrent writers at the same revision", async () => {
    const owner = await prisma.user.create({
      data: {
        id: ownerId,
        email: `${testEmailPrefix}${ownerId}@example.invalid`,
        passwordHash: "not-used",
        displayName: "Map Revision Test",
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        name: "Map Revision Test",
        ownerId: owner.id,
        vibeSettings: {},
      },
    });
    const map = await prisma.map.create({
      data: {
        campaignId: campaign.id,
        name: "Before",
        imageUrl: "",
        baseLayerUrl: "",
        width: 20,
        height: 20,
        tokens: [],
        annotations: [],
      },
    });

    const results = await Promise.allSettled([
      updateMapAtRevision(prisma, map.id, map.revision, { name: "Writer A" }),
      updateMapAtRevision(prisma, map.id, map.revision, { name: "Writer B" }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    const rejected = results.find(({ status }) => status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status !== "rejected")
      throw new Error("Expected one rejected writer");
    expect(rejected.reason).toBeInstanceOf(MapRevisionConflictError);
    expect(rejected.reason).toMatchObject({
      mapId: map.id,
      expectedRevision: map.revision,
    });
    await expect(
      prisma.map.findUniqueOrThrow({ where: { id: map.id } }),
    ).resolves.toMatchObject({
      revision: map.revision + 1,
    });
  });
});
