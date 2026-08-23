import { randomUUID } from "node:crypto";
import { prisma } from "../../config/database";
import { PrismaCampaignEventJournal } from "./PrismaCampaignEventJournal";
import {
  InitiativeStateConflictError,
  PrismaInitiativeCombatStateStore,
} from "./PrismaInitiativeCombatStateStore";
import { PrismaCampaignSnapshotRepository } from "./PrismaCampaignSnapshotRepository";

const describeDatabase =
  process.env.RUN_DATABASE_TESTS === "true" && process.env.DATABASE_URL
    ? describe
    : describe.skip;

describeDatabase("durable campaign primitives against PostgreSQL", () => {
  const ownerId = randomUUID();
  const playerId = randomUUID();
  let campaignId = "";

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          email: `primitive-dm-${ownerId}@example.invalid`,
          passwordHash: "not-used",
          displayName: "Primitive DM",
        },
        {
          id: playerId,
          email: `primitive-player-${playerId}@example.invalid`,
          passwordHash: "not-used",
          displayName: "Primitive Player",
        },
      ],
    });
    const campaign = await prisma.campaign.create({
      data: {
        name: "Durable primitive test",
        ownerId,
        vibeSettings: {},
        memberships: {
          create: [
            { userId: ownerId, role: "DM" },
            { userId: playerId, role: "PLAYER" },
          ],
        },
      },
    });
    campaignId = campaign.id;
    const map = await prisma.map.create({
      data: {
        campaignId,
        name: "Visibility test map",
        imageUrl: "/map.png",
        baseLayerUrl: "/map.png",
        width: 20,
        height: 20,
        tokens: [
          {
            id: "player-token",
            name: "Visible hero",
            imageUrl: "/hero.png",
            position: { x: 2, y: 2 },
            size: { width: 1, height: 1 },
            layer: "token",
            visible: true,
            controlledBy: playerId,
            rotation: 0,
            conditions: [],
            metadata: {},
            notes: "DM-only note",
          },
          {
            id: "hidden-token",
            name: "Hidden foe",
            imageUrl: "/foe.png",
            position: { x: 8, y: 8 },
            size: { width: 1, height: 1 },
            layer: "token",
            visible: false,
            controlledBy: null,
            rotation: 0,
            conditions: [],
            metadata: {},
          },
        ],
        annotations: [],
        fogData: { revealedCells: ["1,1"] },
      },
    });
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { currentMapId: map.id },
    });
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, playerId] } } });
    await prisma.$disconnect();
  });

  it("survives a store recreation and rejects a stale initiative revision", async () => {
    const first = new PrismaInitiativeCombatStateStore(prisma);
    const initial = await first.get(campaignId);
    const state = {
      active: true,
      round: 3,
      currentTokenId: "player-token",
      combatants: [
        {
          tokenId: "player-token",
          name: "Visible hero",
          imageUrl: "/hero.png",
          initiative: 17,
          hp: null,
          type: "player" as const,
          disposition: "friendly" as const,
        },
      ],
    };
    await first.set(campaignId, initial.revision, state);
    const afterRestart = await new PrismaInitiativeCombatStateStore(prisma).get(
      campaignId,
    );
    expect(afterRestart.state).toEqual(state);
    await expect(
      first.set(campaignId, initial.revision, { ...state, round: 4 }),
    ).rejects.toBeInstanceOf(InitiativeStateConflictError);
  });

  it("replays ordered cursors without leaking DM or recipient events", async () => {
    const journal = new PrismaCampaignEventJournal(prisma);
    const publicEvent = await journal.append({
      campaignId,
      type: "initiative.turn.started",
      correlationId: "public-correlation",
      payload: { actorId: "player-token" },
    });
    await journal.append({
      campaignId,
      type: "gm.secret.changed",
      correlationId: "dm-correlation",
      visibility: "DM",
      payload: { secret: true },
    });
    await journal.append({
      campaignId,
      type: "actor.private.changed",
      correlationId: "recipient-correlation",
      visibility: "RECIPIENTS",
      recipientIds: [playerId],
      payload: { private: true },
    });

    const playerEvents = await journal.read({
      campaignId,
      principalId: playerId,
      role: "PLAYER",
      afterCursor: "0",
      limit: 20,
    });
    expect(playerEvents.map(({ type }) => type)).toEqual([
      "initiative.turn.started",
      "actor.private.changed",
    ]);
    const afterPublic = await journal.read({
      campaignId,
      principalId: playerId,
      role: "PLAYER",
      afterCursor: publicEvent.cursor,
      limit: 20,
    });
    expect(afterPublic.map(({ type }) => type)).toEqual([
      "actor.private.changed",
    ]);
    const dmEvents = await journal.read({
      campaignId,
      principalId: ownerId,
      role: "DM",
      afterCursor: "0",
      limit: 20,
    });
    expect(dmEvents.map(({ type }) => type)).toEqual([
      "initiative.turn.started",
      "gm.secret.changed",
    ]);
  });

  it("returns a server-filtered player snapshot", async () => {
    const snapshot = await new PrismaCampaignSnapshotRepository(prisma, {
      canSeeSpiritLayer: async () => false,
    }).load({
      campaignId,
      principalId: playerId,
      role: "PLAYER",
    });
    const map = snapshot?.currentMap as {
      tokens: Array<Record<string, unknown>>;
      fogData: unknown;
    };
    expect(map.tokens.map(({ id }) => id)).toEqual(["player-token"]);
    expect(map.tokens[0]).not.toHaveProperty("notes");
    expect(map.fogData).toBeNull();
    expect(snapshot).toMatchObject({
      principal: { id: playerId, role: "PLAYER" },
      initiative: { active: true, round: 3 },
    });
  });
});
