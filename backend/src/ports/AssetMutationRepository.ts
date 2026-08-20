import {
  AssetCampaignRole,
  AssetRecord,
  AssetScope,
  AssetUploadMetadata,
  AssetView,
} from '../domain/assets/Asset';

/** Persistence and authorization facts required by asset mutation use cases. */
export interface AssetMutationRepository {
  findAsset(id: string): Promise<AssetRecord | null>;
  findGlobalAssetManager(userId: string): Promise<boolean>;
  findCampaignRole(userId: string, campaignId: string): Promise<AssetCampaignRole | null>;
  campaignExists(campaignId: string): Promise<boolean>;
  createAsset(uploadedById: string, metadata: AssetUploadMetadata): Promise<AssetView>;
  deleteAsset(id: string): Promise<void>;
  updateAssetScope(id: string, scope: AssetScope, campaignId: string | null): Promise<AssetView>;
}
