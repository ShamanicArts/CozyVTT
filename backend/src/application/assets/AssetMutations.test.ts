import {
  CREATE_ASSET,
  CreateAsset,
  DELETE_ASSET,
  DeleteAsset,
  PREPARE_ASSET_UPLOAD,
  PrepareAssetUpload,
  UPDATE_ASSET_SCOPE,
  UpdateAssetScope,
} from './AssetMutations';
import { AssetMutationError, AssetRecord, AssetView } from '../../domain/assets/Asset';
import { AssetFileStore } from '../../ports/AssetFileStore';
import { AssetMutationRepository } from '../../ports/AssetMutationRepository';

function asset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: 'asset-1', type: 'MAP', scope: 'USER', uploadedById: 'owner', campaignId: null,
    filename: 'map.png', originalName: 'Map.png', mimeType: 'image/png', fileSize: 10,
    filePath: 'uploads/map.png', thumbnailPath: 'uploads/thumb_map.png', name: 'Map',
    description: null, tags: [], createdAt: new Date('2025-01-01'), ...overrides,
  };
}

function repository(overrides: Partial<jest.Mocked<AssetMutationRepository>> = {}): jest.Mocked<AssetMutationRepository> {
  return {
    findAsset: jest.fn(async (_id: string) => asset()),
    findGlobalAssetManager: jest.fn(async (_userId: string) => false),
    findCampaignRole: jest.fn(async (_userId: string, _campaignId: string) => 'DM'),
    campaignExists: jest.fn(async (_campaignId: string) => true),
    createAsset: jest.fn(async (_userId: string, metadata) => ({ ...asset(), ...metadata } as AssetView)),
    deleteAsset: jest.fn(async (_id: string) => undefined),
    updateAssetScope: jest.fn(async (_id: string, scope, campaignId) => ({ ...asset(), scope, campaignId } as AssetView)),
    ...overrides,
  };
}

const files: jest.Mocked<AssetFileStore> = { remove: jest.fn(async (_path: string) => undefined) };
const owner = { userId: 'owner', isAdmin: false };

beforeEach(() => jest.clearAllMocks());

describe('asset mutation commands', () => {
  it('normalizes avatar uploads to personal scope before file validation', async () => {
    const result = await new PrepareAssetUpload(repository()).execute({
      type: PREPARE_ASSET_UPLOAD, actor: owner,
      input: { type: 'AVATAR', scope: 'GLOBAL', campaignId: 'campaign-1' },
    });
    expect(result).toEqual({ type: 'AVATAR', scope: 'USER', campaignId: null });
  });

  it('retains campaign upload policy: members may upload tokens while DMs may upload other types', async () => {
    const store = repository({ findCampaignRole: jest.fn(async (_userId: string, _campaignId: string) => 'PLAYER') });
    const command = new PrepareAssetUpload(store);
    await expect(command.execute({
      type: PREPARE_ASSET_UPLOAD, actor: owner, input: { type: 'MAP', scope: 'CAMPAIGN', campaignId: 'campaign-1' },
    })).rejects.toEqual(new AssetMutationError(403, 'Forbidden', 'Only the Dungeon Master can upload campaign assets'));
    await expect(command.execute({
      type: PREPARE_ASSET_UPLOAD, actor: owner, input: { type: 'TOKEN', scope: 'CAMPAIGN', campaignId: 'campaign-1' },
    })).resolves.toEqual({ type: 'TOKEN', scope: 'CAMPAIGN', campaignId: 'campaign-1' });
  });

  it('rolls back original and thumbnail when asset persistence fails', async () => {
    const store = repository({ createAsset: jest.fn(async (_userId: string, _metadata) => { throw new Error('database unavailable'); }) });
    await expect(new CreateAsset(store, files).execute({
      type: CREATE_ASSET, actor: owner, input: { type: 'MAP', scope: 'USER' },
      metadata: {
        filename: 'map.png', originalName: 'Map.png', mimeType: 'image/png', fileSize: 10,
        filePath: 'uploads/map.png', thumbnailPath: 'uploads/thumb_map.png', name: 'Map', description: null, tags: [],
      },
    })).rejects.toThrow('database unavailable');
    expect(files.remove).toHaveBeenCalledWith('uploads/map.png');
    expect(files.remove).toHaveBeenCalledWith('uploads/thumb_map.png');
  });

  it('only permits an uploading global asset manager to remove their own global asset', async () => {
    const store = repository({
      findAsset: jest.fn(async (_id: string) => asset({ scope: 'GLOBAL' })),
      findGlobalAssetManager: jest.fn(async (_userId: string) => true),
    });
    await new DeleteAsset(store, files).execute({ type: DELETE_ASSET, actor: owner, assetId: 'asset-1' });
    expect(store.deleteAsset).toHaveBeenCalledWith('asset-1');

    const other = repository({
      findAsset: jest.fn(async (_id: string) => asset({ scope: 'GLOBAL' })),
      findGlobalAssetManager: jest.fn(async (_userId: string) => true),
    });
    await expect(new DeleteAsset(other, files).execute({
      type: DELETE_ASSET, actor: { userId: 'other', isAdmin: false }, assetId: 'asset-1',
    })).rejects.toEqual(new AssetMutationError(403, 'Forbidden', 'Only admins or the uploading global asset manager can delete global assets'));
  });

  it('keeps filesystem cleanup best-effort while deleting the authoritative row', async () => {
    const failingFiles: jest.Mocked<AssetFileStore> = { remove: jest.fn(async (_path: string) => { throw new Error('disk busy'); }) };
    const store = repository();
    await new DeleteAsset(store, failingFiles).execute({ type: DELETE_ASSET, actor: owner, assetId: 'asset-1' });
    expect(store.deleteAsset).toHaveBeenCalledWith('asset-1');
  });

  it('requires target membership for an owner moving an asset into a campaign', async () => {
    const store = repository({ findCampaignRole: jest.fn(async (_userId: string, _campaignId: string) => null) });
    await expect(new UpdateAssetScope(store).execute({
      type: UPDATE_ASSET_SCOPE, actor: owner, assetId: 'asset-1', input: { scope: 'CAMPAIGN', campaignId: 'campaign-1' },
    })).rejects.toEqual(new AssetMutationError(403, 'Forbidden', 'You must be a member of the target campaign to move assets there'));
    expect(store.updateAssetScope).not.toHaveBeenCalled();
  });
});
