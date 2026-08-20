import { UvttMapImportRepository } from "../../ports/UvttMapImportRepository";
import { Command, CommandHandler } from "../commands/CommandBus";
export const IMPORT_UVTT_MAP = "map.uvtt.import" as const;
export interface ImportUvttMapCommand extends Command<Record<string, unknown>> {
  readonly type: typeof IMPORT_UVTT_MAP;
  readonly asset: Record<string, unknown>;
  readonly map: Record<string, unknown>;
}
export class ImportUvttMap implements CommandHandler<
  ImportUvttMapCommand,
  Record<string, unknown>
> {
  constructor(private readonly repository: UvttMapImportRepository) {}
  async execute(command: ImportUvttMapCommand) {
    const asset = await this.repository.createAsset(command.asset);
    return this.repository.createMap({
      ...command.map,
      imageUrl: `/api/assets/maps/${asset.id}`,
      baseLayerUrl: `/api/assets/maps/${asset.id}`,
    });
  }
}
