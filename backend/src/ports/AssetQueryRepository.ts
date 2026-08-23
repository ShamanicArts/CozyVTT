export interface AssetQueryInput {
  userId: string;
  isAdmin: boolean;
  type?: string;
  scope?: string;
  campaignId?: string;
  search?: string;
  uploadedBy?: string;
  page: number;
  limit: number;
}

export interface AssetQueryRecord extends Record<string, unknown> {
  id: string;
  type: string;
  scope: string;
  uploadedById: string;
  campaignId: string | null;
  filePath: string;
  originalName: string;
  mimeType: string;
}

export interface AssetQueryRepository {
  list(input: AssetQueryInput): Promise<{
    assets: AssetQueryRecord[];
    total: number;
  }>;
  find(id: string, type?: string): Promise<AssetQueryRecord | null>;
  latestAvatar(userId: string): Promise<AssetQueryRecord | null>;
  isCampaignMember(userId: string, campaignId: string): Promise<boolean>;
}

export interface AssetContentStore {
  read(filePath: string): Promise<Buffer | null>;
  createThumbnail(filePath: string, filename: string): Promise<string | null>;
}
