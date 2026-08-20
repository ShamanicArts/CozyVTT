/**
 * Transport- and ORM-neutral state for asset mutations.  Asset bytes remain
 * outside this model: HTTP (or another ingress adapter) validates and stores
 * them before issuing an application command.
 */
export type AssetType = 'MAP' | 'TOKEN' | 'AUDIO' | 'AVATAR';
export type AssetScope = 'GLOBAL' | 'USER' | 'CAMPAIGN';
export type AssetCampaignRole = 'DM' | 'PLAYER' | 'SPECTATOR';

export interface AssetActor {
  userId: string;
  isAdmin: boolean;
}

export interface AssetRecord {
  id: string;
  type: AssetType;
  scope: AssetScope;
  uploadedById: string;
  campaignId: string | null;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  thumbnailPath: string | null;
  name: string;
  description: string | null;
  tags: string[];
  createdAt: Date;
}

/** The existing HTTP responses augment this with uploader and campaign summaries. */
export type AssetView = AssetRecord & Record<string, unknown>;

export interface AssetUploadMetadata {
  type: AssetType;
  scope: AssetScope;
  campaignId: string | null;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  thumbnailPath: string | null;
  name: string;
  description: string | null;
  tags: string[];
}

/**
 * Stable failures mapped by delivery adapters without exposing ORM details.
 * Message text matches the pre-command HTTP contract.
 */
export class AssetMutationError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404,
    public readonly error: 'Validation Error' | 'Forbidden' | 'Not Found',
    message: string
  ) {
    super(message);
    this.name = 'AssetMutationError';
  }
}

export const assetValidationError = (message: string) =>
  new AssetMutationError(400, 'Validation Error', message);

export const assetForbidden = (message: string) =>
  new AssetMutationError(403, 'Forbidden', message);

export const assetNotFound = (message: string) =>
  new AssetMutationError(404, 'Not Found', message);
