import type { PrismaClient } from "@prisma/client";
import { exportCampaign } from "./exportCampaignArchive";
import {
  importCampaign as importArchive,
  previewCampaignImport as previewArchive,
} from "./importCampaignArchive";
import type {
  CampaignArchiveService,
  CampaignArchiveExportOptions,
  CampaignArchiveImportOptions,
} from "../../ports/CampaignArchiveService";
import type {
  CampaignArchiveExport,
  CampaignArchiveImportResult,
  CampaignArchivePreview,
} from "../../domain/campaignArchives/CampaignArchive";

/** Infrastructure adapter for the ZIP, Prisma, and filesystem archive engine. */
export class CampaignArchiveEngineAdapter implements CampaignArchiveService {
  constructor(
    private readonly client: PrismaClient,
    private readonly uploadsBase = process.env.UPLOAD_DIR || "uploads",
  ) {}

  exportCampaign(
    campaignId: string,
    options: CampaignArchiveExportOptions,
  ): Promise<CampaignArchiveExport> {
    return exportCampaign(this.client, campaignId, options);
  }

  previewCampaignImport(archive: Buffer): Promise<CampaignArchivePreview> {
    return previewArchive(this.client, archive);
  }

  importCampaign(
    archive: Buffer,
    userId: string,
    options: CampaignArchiveImportOptions,
  ): Promise<CampaignArchiveImportResult> {
    return importArchive(this.client, this.uploadsBase, archive, userId, options);
  }
}
