import type { CreatureTemplate } from "../../domain/creatures/Creature";
import type { CreatureRepository } from "../../ports/CreatureRepository";
import {
  CreateCreature,
  CreatureError,
  DeleteCreature,
  DuplicateCreature,
  ToggleCreatureFavorite,
  UpdateCreature,
} from "./CreatureMutations";

const creature: CreatureTemplate = {
  id: "c1",
  name: "Goblin",
  source: "custom",
  campaignId: "camp",
  createdById: "owner",
  gameSystem: "DND_5E",
  challengeRating: "1/4",
  creatureType: "Small humanoid",
  alignment: "neutral evil",
  imageUrl: null,
  statBlock: {},
  size: { width: 1, height: 1 },
  disposition: "hostile",
  displayMode: "pog",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validStatBlock = {
  ac: 10,
  speed: "30 ft.",
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
};

function repository(): jest.Mocked<CreatureRepository> {
  return {
    find: jest.fn(async (_id) => creature),
    create: jest.fn(async (data) => ({
      ...creature,
      ...data,
      id: "created",
    })),
    update: jest.fn(async (_id, data) => ({ ...creature, ...data })),
    delete: jest.fn(async (_id) => undefined),
    favorite: jest.fn(async (_campaignId, _userId, _creatureId) => true),
    seed: jest.fn(async () => ({
      created: 1,
      updated: 0,
      skipped: 0,
      alreadyExisted: 0,
    })),
  };
}

describe("creature commands", () => {
  it("rejects a blank creature name", async () => {
    await expect(
      new CreateCreature(repository()).execute({
        type: "creature.create",
        campaignId: "camp",
        userId: "u",
        data: { name: "", statBlock: validStatBlock },
      }),
    ).rejects.toEqual(
      new CreatureError(400, "Validation Error", "Creature name is required"),
    );
  });

  it("creates a custom creature with the established defaults", async () => {
    const repo = repository();
    await new CreateCreature(repo).execute({
      type: "creature.create",
      campaignId: "camp",
      userId: "u",
      data: { name: "  Orc  ", statBlock: validStatBlock },
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Orc",
        source: "custom",
        campaignId: "camp",
        createdById: "u",
        size: { width: 1, height: 1 },
        disposition: "hostile",
        displayMode: "pog",
      }),
    );
  });

  it("normalizes token image references for every creature write", async () => {
    const repo = repository();
    await new CreateCreature(repo).execute({
      type: "creature.create",
      campaignId: "camp",
      userId: "u",
      data: { name: "Orc", statBlock: validStatBlock, imageUrl: "asset-1" },
    });
    await new UpdateCreature(repo).execute({
      type: "creature.update",
      campaignId: "camp",
      creatureId: "c1",
      data: { imageUrl: "asset-2" },
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrl: "/api/assets/tokens/asset-1" }),
    );
    expect(repo.update).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ imageUrl: "/api/assets/tokens/asset-2" }),
    );

    repo.find.mockResolvedValue({ ...creature, imageUrl: "asset-3" });
    await new DuplicateCreature(repo).execute({
      type: "creature.duplicate",
      campaignId: "camp",
      userId: "u",
      creatureId: "c1",
    });
    expect(repo.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ imageUrl: "/api/assets/tokens/asset-3" }),
    );
  });

  it("keeps update, delete, duplicate, and favorite behaviors behind commands", async () => {
    const repo = repository();
    await new UpdateCreature(repo).execute({
      type: "creature.update",
      campaignId: "camp",
      creatureId: "c1",
      data: { name: "New" },
    });
    await new DeleteCreature(repo).execute({
      type: "creature.delete",
      campaignId: "camp",
      creatureId: "c1",
    });
    await expect(
      new DuplicateCreature(repo).execute({
        type: "creature.duplicate",
        campaignId: "camp",
        userId: "u",
        creatureId: "c1",
      }),
    ).resolves.toMatchObject({ name: "Goblin (Custom)", source: "custom" });
    await expect(
      new ToggleCreatureFavorite(repo).execute({
        type: "creature.favorite.toggle",
        campaignId: "camp",
        userId: "u",
        creatureId: "c1",
      }),
    ).resolves.toBe(true);
  });
});
