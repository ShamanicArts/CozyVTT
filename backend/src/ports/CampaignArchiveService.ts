import {
  CampaignArchiveExport,
  CampaignArchiveImportResult,
  CampaignArchivePreview,
} from "../domain/campaignArchives/CampaignArchive";

export interface CampaignArchiveExportOptions {
  includeAudio: boolean;
  includeTokens: boolean;
}

export interface CampaignArchiveImportOptions {
  importTokens: boolean;
  campaignName?: string;
}

/** Boundary for archive construction, inspection, persistence, and asset rollback. */
export interface CampaignArchiveService {
  exportCampaign(
    campaignId: string,
    options: CampaignArchiveExportOptions,
  ): Promise<CampaignArchiveExport>;
  previewCampaignImport(archive: Buffer): Promise<CampaignArchivePreview>;
  importCampaign(
    archive: Buffer,
    userId: string,
    options: CampaignArchiveImportOptions,
  ): Promise<CampaignArchiveImportResult>;
}
