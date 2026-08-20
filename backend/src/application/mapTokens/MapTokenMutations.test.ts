import {
  CreateMapToken,
  DeleteMapToken,
  UpdateMapToken,
} from "./MapTokenMutations";
import { MapToken, MapTokenMap } from "../../domain/mapTokens/MapToken";
import { MapTokenAssetUrlNormalizer } from "../../ports/MapTokenAssetUrlNormalizer";
import { MapTokenRepository } from "../../ports/MapTokenRepository";

const existingToken: MapToken = {
  id: "token-1",
  name: "Mira",
  imageUrl: "/api/assets/tokens/old",
  position: { x: 2, y: 3 },
  size: { width: 1, height: 1 },
  layer: "token",
  visible: true,
  controlledBy: "player-1",
  rotation: 0,
  conditions: [],
  metadata: { existing: true },
  type: "player",
  disposition: "friendly",
  hp: null,
  showHpBar: false,
  notes: "",
  initiative: null,
  displayMode: "pog",
  statBlock: null,
  creatureTemplateId: null,
};

function mapWith(tokens: MapToken[] = [existingToken]): MapTokenMap {
  return {
    id: "map-1",
    revision: 6,
    campaignId: "campaign-1",
    width: 20,
    height: 10,
    tokens,
  };
}

function repository(
  map: MapTokenMap = mapWith(),
  role: string | null = "DM",
): MapTokenRepository {
  return {
    findMap: jest.fn(async () => map),
    findMembershipRole: jest.fn(async () => role),
    updateTokens: jest.fn(async (_mapId, _expectedRevision, tokens) => ({
      id: map.id,
      revision: 7,
      tokens,
    })),
  };
}

const assets: MapTokenAssetUrlNormalizer = {
  normalizeTokenImageUrl: jest.fn((url: string) => `/api/assets/tokens/${url}`),
};

describe("map-token application mutations", () => {
  it("creates a normalized, defaulted token and persists it in the scoped map", async () => {
    const store = repository();
    const result = await new CreateMapToken(store, assets).execute({
      type: "map-token.create",
      campaignId: "campaign-1",
      mapId: "map-1",
      data: {
        name: "Goblin",
        imageUrl: "asset-id",
        position: { x: 5, y: 6 },
        type: "npc",
        displayMode: "top-down",
      },
    });

    expect(result.token).toMatchObject({
      name: "Goblin",
      imageUrl: "/api/assets/tokens/asset-id",
      position: { x: 5, y: 6 },
      layer: "token",
      visible: true,
      type: "npc",
      displayMode: "top-down",
    });
    expect(store.updateTokens).toHaveBeenCalledWith(
      "map-1",
      6,
      expect.arrayContaining([expect.objectContaining({ name: "Goblin" })]),
    );
  });

  it("retains legacy validation and map scope responses", async () => {
    const command = new CreateMapToken(repository(), assets);
    await expect(
      command.execute({
        type: "map-token.create",
        campaignId: "campaign-1",
        mapId: "map-1",
        data: { name: "Bad", position: { x: 20, y: 1 } },
      }),
    ).rejects.toMatchObject({
      status: 400,
      error: "Validation Error",
      message: "Token position must be within map bounds (0-19, 0-9)",
    });
    await expect(
      new DeleteMapToken(
        repository({ ...mapWith(), campaignId: "other" }),
      ).execute({
        type: "map-token.delete",
        campaignId: "campaign-1",
        mapId: "map-1",
        tokenId: "token-1",
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: "Map not found in this campaign",
    });
  });

  it("enforces controlled-token permissions and preserves player-safe merges", async () => {
    const store = repository(mapWith(), "PLAYER");
    const command = new UpdateMapToken(store, assets);
    const result = await command.execute({
      type: "map-token.update",
      campaignId: "campaign-1",
      mapId: "map-1",
      tokenId: "token-1",
      userId: "player-1",
      updates: {
        position: { x: 4, y: 5 },
        rotation: 90,
        metadata: { moved: true },
      },
    });
    expect(result.token).toMatchObject({
      position: { x: 4, y: 5 },
      rotation: 90,
      metadata: { existing: true, moved: true },
    });

    await expect(
      command.execute({
        type: "map-token.update",
        campaignId: "campaign-1",
        mapId: "map-1",
        tokenId: "token-1",
        userId: "player-1",
        updates: { hp: { current: 1, max: 1, temp: 0 } },
      }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Only DM can update token field: hp",
    });
  });

  it("allows DM stat-block/image changes and deletes only a present scoped token", async () => {
    const store = repository();
    const updated = await new UpdateMapToken(store, assets).execute({
      type: "map-token.update",
      campaignId: "campaign-1",
      mapId: "map-1",
      tokenId: "token-1",
      userId: "dm-1",
      updates: {
        imageUrl: "new-asset",
        statBlock: { ac: 14 },
        creatureTemplateId: "template-1",
        displayMode: "full-art",
      },
    });
    expect(updated.token).toMatchObject({
      imageUrl: "/api/assets/tokens/new-asset",
      statBlock: { ac: 14 },
      creatureTemplateId: "template-1",
      displayMode: "full-art",
    });

    await new DeleteMapToken(store).execute({
      type: "map-token.delete",
      campaignId: "campaign-1",
      mapId: "map-1",
      tokenId: "token-1",
    });
    expect(store.updateTokens).toHaveBeenLastCalledWith("map-1", 6, []);
  });
});
