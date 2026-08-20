/** Public archive data carried between the application and archive adapters. */
export interface CampaignArchiveExport {
  buffer: Buffer;
  filename: string;
}

export interface CampaignArchivePreview {
  formatVersion: number;
  exportedAt: string;
  exportedFrom: string;
  campaignName: string;
  gameSystem: string;
  mapCount: number;
  tokenCount: number;
  creatureCount: number;
  tokenTemplateCount: number;
  assetCount: number;
  includesAudio: boolean;
  totalSizeBytes: number;
}

export interface CampaignArchiveImportResult {
  campaignId: string;
  campaignName: string;
  mapCount: number;
  tokenCount: number;
  creatureCount: number;
  tokenTemplateCount: number;
}

/** Expected input failure whose established HTTP body differs from import failures. */
export class CampaignArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignArchiveError";
  }
}
