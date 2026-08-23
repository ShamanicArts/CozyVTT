import {
  UvttImportSource,
  UvttMapImportRepository,
} from "../../ports/UvttMapImportRepository";
import { Command, CommandHandler } from "../commands/CommandBus";
export const IMPORT_UVTT_MAP = "map.uvtt.import" as const;
export interface ImportUvttMapResult {
  map: Record<string, unknown>;
  wallCount: number;
  portalCount: number;
  lightCount: number;
  totalSegments: number;
}
export interface ImportUvttMapCommand extends Command<ImportUvttMapResult> {
  readonly type: typeof IMPORT_UVTT_MAP;
  readonly campaignId: string;
  readonly uploadedById: string;
  readonly name: string;
  readonly contents: Buffer;
  readonly gridSize: number;
}
export class UvttImportError extends Error {}
export class ImportUvttMap implements CommandHandler<
  ImportUvttMapCommand,
  ImportUvttMapResult
> {
  constructor(
    private readonly repository: UvttMapImportRepository,
    private readonly source: UvttImportSource,
  ) {}
  async execute(command: ImportUvttMapCommand) {
    let prepared;
    try {
      prepared = await this.source.prepare(command);
    } catch (error) {
      throw new UvttImportError(
        error instanceof Error ? error.message : "Failed to parse UVTT file",
      );
    }
    try {
      const asset = await this.repository.createAsset(prepared.asset);
      const map = await this.repository.createMap({
        ...prepared.map,
        imageUrl: `/api/assets/maps/${asset.id}`,
        baseLayerUrl: `/api/assets/maps/${asset.id}`,
      });
      return {
        map,
        wallCount: prepared.wallCount,
        portalCount: prepared.portalCount,
        lightCount: prepared.lightCount,
        totalSegments: prepared.totalSegments,
      };
    } catch (error) {
      await this.source.remove(prepared.storedFilePath).catch(() => undefined);
      throw error;
    }
  }
}
