import { PrismaClient } from '@prisma/client';
import {
  AssetCampaignRole,
  AssetRecord,
  AssetScope,
  AssetUploadMetadata,
  AssetView,
} from '../../domain/assets/Asset';
import { AssetMutationRepository } from '../../ports/AssetMutationRepository';

/** Prisma adapter for asset mutation state and authorization facts. */
export class PrismaAssetMutationRepository implements AssetMutationRepository {
  constructor(private readonly client: PrismaClient) {}

  async findAsset(id: string): Promise<AssetRecord | null> {
    const asset = await this.client.asset.findUnique({ where: { id } });
    return asset as AssetRecord | null;
  }

  async findGlobalAssetManager(userId: string): Promise<boolean> {
    const user = await this.client.user.findUnique({
      where: { id: userId },
      select: { globalAssetManager: true },
    });
    return user?.globalAssetManager === true;
  }

  async findCampaignRole(userId: string, campaignId: string): Promise<AssetCampaignRole | null> {
    const membership = await this.client.campaignMembership.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
      select: { role: true },
    });
    return membership?.role as AssetCampaignRole | undefined ?? null;
  }

  async campaignExists(campaignId: string): Promise<boolean> {
    return !!await this.client.campaign.findUnique({ where: { id: campaignId }, select: { id: true } });
  }

  async createAsset(uploadedById: string, metadata: AssetUploadMetadata): Promise<AssetView> {
    const asset = await this.client.asset.create({
      data: {
        type: metadata.type,
        scope: metadata.scope,
        uploadedById,
        campaignId: metadata.campaignId,
        filename: metadata.filename,
        originalName: metadata.originalName,
        mimeType: metadata.mimeType,
        fileSize: metadata.fileSize,
        filePath: metadata.filePath,
        thumbnailPath: metadata.thumbnailPath,
        name: metadata.name,
        description: metadata.description,
        tags: metadata.tags,
      },
      include: {
        uploadedBy: { select: { id: true, displayName: true } },
        campaign: { select: { id: true, name: true } },
      },
    });
    return asset as AssetView;
  }

  async deleteAsset(id: string): Promise<void> {
    await this.client.asset.delete({ where: { id } });
  }

  async updateAssetScope(id: string, scope: AssetScope, campaignId: string | null): Promise<AssetView> {
    const asset = await this.client.asset.update({
      where: { id },
      data: { scope, campaignId },
      include: {
        uploadedBy: { select: { id: true, displayName: true } },
        campaign: { select: { id: true, name: true } },
      },
    });
    return asset as AssetView;
  }
}
