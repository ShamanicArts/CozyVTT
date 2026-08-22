import type { AssetMutationRepository } from "../../ports/AssetMutationRepository";
import type { MapCoreRepository } from "../../ports/MapCoreRepository";
import type { RemoteMapAssetIngress } from "../../ports/RemoteMapAssetIngress";
import type { Command, CommandHandler } from "../commands/CommandBus";
import {
  CREATE_ASSET,
  CreateAsset,
  DELETE_ASSET,
  DeleteAsset,
} from "../assets/AssetMutations";
import {
  CREATE_MAP,
  CreateMap,
  SET_CURRENT_MAP,
  SetCurrentMap,
} from "./MapLifecycleCommands";

export const IMPORT_REMOTE_MAP = "map.import-remote" as const;

export interface ImportRemoteMapInput {
  campaignId: string;
  sourceUrl: string;
  name: string;
  width: number;
  height: number;
  gridSize: number;
  feetPerSquare?: number;
  diagonalRule?: "flat" | "alternating";
  activate?: boolean;
  description?: string;
  tags?: string[];
}

export interface ImportRemoteMapResult {
  assetId: string;
  mapId: string;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  gridSize: number;
  active: boolean;
}

export interface ImportRemoteMapCommand extends Command<ImportRemoteMapResult> {
  readonly type: typeof IMPORT_REMOTE_MAP;
  readonly actorId: string;
  readonly campaignId: string;
  readonly sourceUrl: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly gridSize: number;
  readonly feetPerSquare?: number;
  readonly diagonalRule?: "flat" | "alternating";
  readonly activate?: boolean;
  readonly description?: string;
  readonly tags?: string[];
}

/**
 * End-to-end remote map ingestion shared by plugin and any future API adapter.
 * Database work participates in the production ApplicationHost transaction;
 * filesystem bytes are compensated explicitly on every failure path.
 */
export class ImportRemoteMap implements CommandHandler<
  ImportRemoteMapCommand,
  ImportRemoteMapResult
> {
  private readonly createAsset: CreateAsset;
  private readonly deleteAsset: DeleteAsset;
  private readonly createMap: CreateMap;
  private readonly setCurrentMap: SetCurrentMap;

  constructor(
    private readonly assetRepository: AssetMutationRepository,
    private readonly ingress: RemoteMapAssetIngress,
    private readonly mapRepository: MapCoreRepository,
  ) {
    this.createAsset = new CreateAsset(assetRepository, ingress);
    this.deleteAsset = new DeleteAsset(assetRepository, ingress);
    this.createMap = new CreateMap(mapRepository);
    this.setCurrentMap = new SetCurrentMap(mapRepository);
  }

  async execute(
    command: ImportRemoteMapCommand,
  ): Promise<ImportRemoteMapResult> {
    const actor = { userId: command.actorId, isAdmin: false };
    const role = await this.assetRepository.findCampaignRole(
      command.actorId,
      command.campaignId,
    );
    if (role !== "DM") {
      throw new Error("Only the Dungeon Master can import campaign maps");
    }

    const stored = await this.ingress.store(
      command.sourceUrl,
      command.campaignId,
    );
    const asset = await this.createAsset.execute({
      type: CREATE_ASSET,
      actor,
      input: {
        type: "MAP",
        scope: "CAMPAIGN",
        campaignId: command.campaignId,
      },
      metadata: {
        ...stored,
        name: command.name.trim(),
        description: command.description?.trim() || null,
        tags: command.tags ?? ["battlemap", "remote-import"],
      },
    });

    let mapId: string | null = null;
    try {
      const map = await this.createMap.execute({
        type: CREATE_MAP,
        campaignId: command.campaignId,
        input: {
          name: command.name,
          imageUrl: asset.id,
          width: command.width,
          height: command.height,
          gridSize: command.gridSize,
          feetPerSquare: command.feetPerSquare,
          diagonalRule: command.diagonalRule,
        },
      });
      mapId = map.id;
      const active = command.activate !== false;
      if (active) {
        await this.setCurrentMap.execute({
          type: SET_CURRENT_MAP,
          campaignId: command.campaignId,
          mapId: map.id,
        });
      }
      return {
        assetId: asset.id,
        mapId: map.id,
        name: map.name,
        imageUrl: map.imageUrl,
        width: map.width,
        height: map.height,
        gridSize: map.gridSize,
        active,
      };
    } catch (error) {
      if (mapId) {
        await this.mapRepository.deleteMap(mapId).catch(() => undefined);
      }
      await this.deleteAsset
        .execute({
          type: DELETE_ASSET,
          actor,
          assetId: asset.id,
        })
        .catch(() => undefined);
      throw error;
    }
  }
}
