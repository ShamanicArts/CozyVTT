import { exportCampaign } from "../../services/campaignExporter";
import {
  importCampaign as importArchive,
  previewCampaignImport as previewArchive,
} from "../../services/campaignImporter";
import {
  CampaignArchiveService,
  CampaignArchiveExportOptions,
  CampaignArchiveImportOptions,
} from "../../ports/CampaignArchiveService";
import {
  CampaignArchiveExport,
  CampaignArchiveImportResult,
  CampaignArchivePreview,
} from "../../domain/campaignArchives/CampaignArchive";

/**
 * Adapter around CozyVTT's established archive engine. It deliberately keeps
 * ZIP safety checks, Prisma writes, asset persistence, and rollback behavior
 * together until that engine itself is separately decomposed.
 */
export class LegacyCampaignArchiveService implements CampaignArchiveService {
  exportCampaign(
    campaignId: string,
    options: CampaignArchiveExportOptions,
  ): Promise<CampaignArchiveExport> {
    return exportCampaign(campaignId, options);
  }

  previewCampaignImport(archive: Buffer): Promise<CampaignArchivePreview> {
    return previewArchive(archive);
  }

  importCampaign(
    archive: Buffer,
    userId: string,
    options: CampaignArchiveImportOptions,
  ): Promise<CampaignArchiveImportResult> {
    return importArchive(archive, userId, options);
  }
}
