import { Command, CommandHandler } from "../commands/CommandBus";
import {
  CampaignArchiveError,
  CampaignArchiveExport,
  CampaignArchiveImportResult,
  CampaignArchivePreview,
} from "../../domain/campaignArchives/CampaignArchive";
import { CampaignArchiveService } from "../../ports/CampaignArchiveService";

export const EXPORT_CAMPAIGN_ARCHIVE = "campaign-archive.export" as const;
export const PREVIEW_CAMPAIGN_ARCHIVE_IMPORT =
  "campaign-archive.preview-import" as const;
export const IMPORT_CAMPAIGN_ARCHIVE = "campaign-archive.import" as const;

export interface ExportCampaignArchiveCommand extends Command<CampaignArchiveExport> {
  readonly type: typeof EXPORT_CAMPAIGN_ARCHIVE;
  readonly campaignId: string;
  readonly includeAudio: boolean;
  readonly includeTokens: boolean;
}

export interface PreviewCampaignArchiveImportCommand extends Command<CampaignArchivePreview> {
  readonly type: typeof PREVIEW_CAMPAIGN_ARCHIVE_IMPORT;
  readonly archive: Buffer;
}

export interface ImportCampaignArchiveCommand extends Command<CampaignArchiveImportResult> {
  readonly type: typeof IMPORT_CAMPAIGN_ARCHIVE;
  readonly archive: Buffer;
  readonly userId: string;
  readonly campaignName: unknown;
  readonly importTokens: unknown;
}

export class ExportCampaignArchive implements CommandHandler<
  ExportCampaignArchiveCommand,
  CampaignArchiveExport
> {
  constructor(private readonly archives: CampaignArchiveService) {}

  execute(
    command: ExportCampaignArchiveCommand,
  ): Promise<CampaignArchiveExport> {
    return this.archives.exportCampaign(command.campaignId, {
      includeAudio: command.includeAudio,
      includeTokens: command.includeTokens,
    });
  }
}

export class PreviewCampaignArchiveImport implements CommandHandler<
  PreviewCampaignArchiveImportCommand,
  CampaignArchivePreview
> {
  constructor(private readonly archives: CampaignArchiveService) {}

  execute(
    command: PreviewCampaignArchiveImportCommand,
  ): Promise<CampaignArchivePreview> {
    return this.archives.previewCampaignImport(command.archive);
  }
}

export class ImportCampaignArchive implements CommandHandler<
  ImportCampaignArchiveCommand,
  CampaignArchiveImportResult
> {
  constructor(private readonly archives: CampaignArchiveService) {}

  async execute(
    command: ImportCampaignArchiveCommand,
  ): Promise<CampaignArchiveImportResult> {
    const campaignName =
      typeof command.campaignName === "string"
        ? command.campaignName.trim()
        : undefined;
    if (
      campaignName !== undefined &&
      (campaignName.length === 0 || campaignName.length > 200)
    ) {
      throw new CampaignArchiveError(
        "Campaign name must be between 1 and 200 characters.",
      );
    }
    return this.archives.importCampaign(command.archive, command.userId, {
      importTokens: command.importTokens !== "false",
      campaignName: campaignName || undefined,
    });
  }
}
