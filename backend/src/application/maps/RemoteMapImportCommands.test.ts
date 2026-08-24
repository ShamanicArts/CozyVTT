import type { AssetMutationRepository } from "../../ports/AssetMutationRepository";
import type { MapCoreRepository } from "../../ports/MapCoreRepository";
import type { RemoteMapAssetIngress } from "../../ports/RemoteMapAssetIngress";
import type { AssetRecord } from "../../domain/assets/Asset";
import type { MapCoreRecord } from "../../domain/maps/MapLifecycle";
import { IMPORT_REMOTE_MAP, ImportRemoteMap } from "./RemoteMapImportCommands";

const campaignId = "campaign-1";
const actorId = "dm-1";

function mockFn<T extends (...args: never[]) => unknown>(): jest.Mock<
  ReturnType<T>,
  Parameters<T>
> {
  return jest.fn<ReturnType<T>, Parameters<T>>();
}

function fixture() {
  const assetRecord: AssetRecord = {
    id: "asset-1",
    type: "MAP",
    scope: "CAMPAIGN",
    uploadedById: actorId,
    campaignId,
    filename: "remote.jpg",
    originalName: "remote.jpg",
    mimeType: "image/jpeg",
    fileSize: 1234,
    filePath: "uploads/maps/campaigns/campaign-1/remote.jpg",
    thumbnailPath: "uploads/maps/campaigns/campaign-1/thumb_remote.jpg",
    name: "Real Battle Map",
    description: null,
    tags: ["battlemap"],
    createdAt: new Date(),
  };
  const assetRepository = {
    findAsset:
      mockFn<AssetMutationRepository["findAsset"]>().mockResolvedValue(
        assetRecord,
      ),
    findGlobalAssetManager:
      mockFn<
        AssetMutationRepository["findGlobalAssetManager"]
      >().mockResolvedValue(false),
    findCampaignRole:
      mockFn<AssetMutationRepository["findCampaignRole"]>().mockResolvedValue(
        "DM",
      ),
    campaignExists:
      mockFn<AssetMutationRepository["campaignExists"]>().mockResolvedValue(
        true,
      ),
    createAsset: mockFn<
      AssetMutationRepository["createAsset"]
    >().mockImplementation(async (_userId, metadata) => ({
      id: "asset-1",
      uploadedById: actorId,
      createdAt: new Date(),
      ...metadata,
    })),
    deleteAsset: mockFn<AssetMutationRepository["deleteAsset"]>(),
    updateAssetScope: mockFn<AssetMutationRepository["updateAssetScope"]>(),
  } satisfies jest.Mocked<AssetMutationRepository>;
  const ingress = {
    store: mockFn<RemoteMapAssetIngress["store"]>().mockImplementation(
      async () => ({
        filename: "remote.jpg",
        originalName: "remote.jpg",
        mimeType: "image/jpeg",
        fileSize: 1234,
        filePath: "uploads/maps/campaigns/campaign-1/remote.jpg",
        thumbnailPath: "uploads/maps/campaigns/campaign-1/thumb_remote.jpg",
      }),
    ),
    remove: mockFn<RemoteMapAssetIngress["remove"]>(),
  } satisfies jest.Mocked<RemoteMapAssetIngress>;
  const mapRecord: MapCoreRecord = {
    id: "map-1",
    revision: 0,
    campaignId,
    name: "Real Battle Map",
    imageUrl: "/api/assets/maps/asset-1",
    baseLayerUrl: "/api/assets/maps/asset-1",
    width: 41,
    height: 29,
    gridSize: 32,
    feetPerSquare: 5,
    diagonalRule: "flat",
    spiritLayerUrl: null,
    tokens: [],
    annotations: [],
    wallSegments: [],
    fogData: null,
    lightingEnabled: false,
    lights: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mapRepository = {
    findMap:
      mockFn<MapCoreRepository["findMap"]>().mockResolvedValue(mapRecord),
    createMap:
      mockFn<MapCoreRepository["createMap"]>().mockResolvedValue(mapRecord),
    updateMap: mockFn<MapCoreRepository["updateMap"]>(),
    deleteMap: mockFn<MapCoreRepository["deleteMap"]>(),
    findCurrentMapId:
      mockFn<MapCoreRepository["findCurrentMapId"]>().mockResolvedValue(null),
    setCurrentMap: mockFn<
      MapCoreRepository["setCurrentMap"]
    >().mockImplementation(async () => ({
      currentMap: {
        id: mapRecord.id,
        name: mapRecord.name,
        imageUrl: mapRecord.imageUrl,
      },
    })),
  } satisfies jest.Mocked<MapCoreRepository>;
  const command = new ImportRemoteMap(assetRepository, ingress, mapRepository);
  return { assetRepository, ingress, mapRepository, command };
}

describe("ImportRemoteMap", () => {
  it("stores, creates, and activates a campaign map in one command", async () => {
    const { command, ingress, assetRepository, mapRepository } = fixture();
    await expect(
      command.execute({
        type: IMPORT_REMOTE_MAP,
        actorId,
        campaignId,
        sourceUrl: "https://example.com/battle-map.jpg",
        name: "Real Battle Map",
        width: 41,
        height: 29,
        gridSize: 32,
      }),
    ).resolves.toEqual({
      assetId: "asset-1",
      mapId: "map-1",
      name: "Real Battle Map",
      imageUrl: "/api/assets/maps/asset-1",
      width: 41,
      height: 29,
      gridSize: 32,
      active: true,
    });
    expect(ingress.store).toHaveBeenCalledWith(
      "https://example.com/battle-map.jpg",
      campaignId,
    );
    expect(assetRepository.createAsset).toHaveBeenCalledTimes(1);
    expect(mapRepository.createMap).toHaveBeenCalledTimes(1);
    expect(mapRepository.setCurrentMap).toHaveBeenCalledWith(
      campaignId,
      "map-1",
    );
  });

  it("refuses non-DMs before downloading bytes", async () => {
    const { command, ingress, assetRepository } = fixture();
    assetRepository.findCampaignRole.mockResolvedValue("PLAYER");
    await expect(
      command.execute({
        type: IMPORT_REMOTE_MAP,
        actorId,
        campaignId,
        sourceUrl: "https://example.com/battle-map.jpg",
        name: "Real Battle Map",
        width: 41,
        height: 29,
        gridSize: 32,
      }),
    ).rejects.toThrow("Only the Dungeon Master");
    expect(ingress.store).not.toHaveBeenCalled();
  });

  it("compensates the asset and file when map creation fails", async () => {
    const { command, ingress, assetRepository, mapRepository } = fixture();
    mapRepository.createMap.mockRejectedValue(new Error("map failure"));
    await expect(
      command.execute({
        type: IMPORT_REMOTE_MAP,
        actorId,
        campaignId,
        sourceUrl: "https://example.com/battle-map.jpg",
        name: "Real Battle Map",
        width: 41,
        height: 29,
        gridSize: 32,
      }),
    ).rejects.toThrow("map failure");
    expect(assetRepository.deleteAsset).toHaveBeenCalledWith("asset-1");
    expect(ingress.remove).toHaveBeenCalledTimes(2);
  });
});
