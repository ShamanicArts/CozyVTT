import {
  AssetActor,
  AssetMutationError,
  AssetScope,
  AssetType,
  AssetUploadMetadata,
  AssetView,
  assetForbidden,
  assetNotFound,
  assetValidationError,
} from '../../domain/assets/Asset';
import { AssetFileStore } from '../../ports/AssetFileStore';
import { AssetMutationRepository } from '../../ports/AssetMutationRepository';
import { Command, CommandHandler } from '../commands/CommandBus';

export const PREPARE_ASSET_UPLOAD = 'asset.upload.prepare' as const;
export const CREATE_ASSET = 'asset.create' as const;
export const DELETE_ASSET = 'asset.delete' as const;
export const UPDATE_ASSET_SCOPE = 'asset.scope.update' as const;

export interface PreparedAssetUpload {
  type: AssetType;
  scope: AssetScope;
  campaignId: string | null;
}

export interface PrepareAssetUploadCommand extends Command<PreparedAssetUpload> {
  readonly type: typeof PREPARE_ASSET_UPLOAD;
  readonly actor: AssetActor;
  readonly input: { type?: unknown; scope?: unknown; campaignId?: unknown };
}

export interface CreateAssetCommand extends Command<AssetView> {
  readonly type: typeof CREATE_ASSET;
  readonly actor: AssetActor;
  /** Raw classification is deliberately accepted so non-HTTP adapters receive the same policy checks. */
  readonly input: { type?: unknown; scope?: unknown; campaignId?: unknown };
  readonly metadata: Omit<AssetUploadMetadata, 'type' | 'scope' | 'campaignId'>;
}

export interface DeleteAssetCommand extends Command<void> {
  readonly type: typeof DELETE_ASSET;
  readonly actor: AssetActor;
  readonly assetId: string;
}

export interface UpdateAssetScopeCommand extends Command<AssetView> {
  readonly type: typeof UPDATE_ASSET_SCOPE;
  readonly actor: AssetActor;
  readonly assetId: string;
  readonly input: { scope?: unknown; campaignId?: unknown };
}

/** Shared authorization policy so HTTP, capabilities, and future adapters cannot drift. */
abstract class AssetCommandBase {
  constructor(protected readonly repository: AssetMutationRepository) {}

  protected async prepareUpload(actor: AssetActor, input: PrepareAssetUploadCommand['input']): Promise<PreparedAssetUpload> {
    const type = input.type;
    if (!type) throw assetValidationError('Asset type is required');
    if (!isAssetType(type)) {
      throw assetValidationError('Invalid asset type. Must be MAP, TOKEN, AUDIO, or AVATAR');
    }

    const scope = (type === 'AVATAR' ? 'USER' : (input.scope || 'USER'));
    if (!isAssetScope(scope)) {
      throw assetValidationError('Invalid scope. Must be GLOBAL, USER, or CAMPAIGN');
    }

    if (scope === 'USER') return { type, scope, campaignId: null };

    if (scope === 'GLOBAL') {
      const canManageGlobalAssets = actor.isAdmin || await this.repository.findGlobalAssetManager(actor.userId);
      if (!canManageGlobalAssets) {
        throw assetForbidden('Only administrators or global asset managers can upload GLOBAL assets');
      }
      return { type, scope, campaignId: null };
    }

    const campaignId = input.campaignId;
    if (!campaignId || typeof campaignId !== 'string') {
      throw assetValidationError('Campaign ID is required for CAMPAIGN scope');
    }
    const role = await this.repository.findCampaignRole(actor.userId, campaignId);
    if (!role) throw assetForbidden('You do not have access to this campaign');
    if (role !== 'DM' && type !== 'TOKEN') {
      throw assetForbidden('Only the Dungeon Master can upload campaign assets');
    }
    return { type, scope, campaignId };
  }
}

/** Validates the eventual asset mutation before MIME/size middleware uses its normalized type. */
export class PrepareAssetUpload extends AssetCommandBase implements CommandHandler<PrepareAssetUploadCommand, PreparedAssetUpload> {
  async execute(command: PrepareAssetUploadCommand): Promise<PreparedAssetUpload> {
    return this.prepareUpload(command.actor, command.input);
  }
}

/** Creates metadata only after an ingress adapter has securely stored and inspected the file bytes. */
export class CreateAsset extends AssetCommandBase implements CommandHandler<CreateAssetCommand, AssetView> {
  constructor(repository: AssetMutationRepository, private readonly files: AssetFileStore) { super(repository); }

  async execute(command: CreateAssetCommand): Promise<AssetView> {
    try {
      const prepared = await this.prepareUpload(command.actor, command.input);
      return await this.repository.createAsset(command.actor.userId, { ...command.metadata, ...prepared });
    } catch (error) {
      // The bytes have already been stored. Roll back both original and optional
      // thumbnail on *any* post-storage policy/persistence failure.
      await this.removeIgnoringFailure(command.metadata.filePath);
      if (command.metadata.thumbnailPath) await this.removeIgnoringFailure(command.metadata.thumbnailPath);
      throw error;
    }
  }

  private async removeIgnoringFailure(filePath: string): Promise<void> {
    try { await this.files.remove(filePath); } catch { /* cleanup is best effort */ }
  }
}

export class DeleteAsset extends AssetCommandBase implements CommandHandler<DeleteAssetCommand, void> {
  constructor(repository: AssetMutationRepository, private readonly files: AssetFileStore) { super(repository); }

  async execute(command: DeleteAssetCommand): Promise<void> {
    const asset = await this.repository.findAsset(command.assetId);
    if (!asset) throw assetNotFound('Asset not found');

    const isOwner = asset.uploadedById === command.actor.userId;
    if (asset.scope === 'GLOBAL') {
      const manager = command.actor.isAdmin || await this.repository.findGlobalAssetManager(command.actor.userId);
      if (!command.actor.isAdmin && !(isOwner && manager)) {
        throw assetForbidden('Only admins or the uploading global asset manager can delete global assets');
      }
    } else if (asset.scope === 'USER') {
      if (!isOwner && !command.actor.isAdmin) throw assetForbidden('Only the owner can delete personal assets');
    } else if (asset.scope === 'CAMPAIGN') {
      const role = asset.campaignId
        ? await this.repository.findCampaignRole(command.actor.userId, asset.campaignId)
        : null;
      if (!isOwner && role !== 'DM' && !command.actor.isAdmin) {
        throw assetForbidden('Only the uploader, campaign DM, or an admin can delete campaign assets');
      }
    }

    // Preserve legacy failure semantics: file cleanup is best effort and a DB
    // delete is still authoritative even when storage has already lost a file.
    await this.removeIgnoringFailure(asset.filePath);
    if (asset.thumbnailPath) await this.removeIgnoringFailure(asset.thumbnailPath);
    await this.repository.deleteAsset(asset.id);
  }

  private async removeIgnoringFailure(filePath: string): Promise<void> {
    try { await this.files.remove(filePath); } catch { /* best-effort cleanup */ }
  }
}

export class UpdateAssetScope extends AssetCommandBase implements CommandHandler<UpdateAssetScopeCommand, AssetView> {
  async execute(command: UpdateAssetScopeCommand): Promise<AssetView> {
    const scope = command.input.scope;
    if (!scope || !isAssetScope(scope)) throw assetValidationError('scope must be GLOBAL, USER, or CAMPAIGN');

    const asset = await this.repository.findAsset(command.assetId);
    if (!asset) throw assetNotFound('Asset not found');

    const involvesGlobal = scope === 'GLOBAL' || asset.scope === 'GLOBAL';
    const manager = involvesGlobal && !command.actor.isAdmin
      ? await this.repository.findGlobalAssetManager(command.actor.userId)
      : false;
    if (involvesGlobal && !command.actor.isAdmin && !manager) {
      throw assetForbidden('Only administrators or global asset managers can change scope to or from Global');
    }

    let campaignId: string | null = null;
    if (scope === 'CAMPAIGN') {
      const requestedCampaignId = command.input.campaignId;
      if (!requestedCampaignId || typeof requestedCampaignId !== 'string') {
        throw assetValidationError('campaignId is required when scope is CAMPAIGN');
      }
      if (!await this.repository.campaignExists(requestedCampaignId)) throw assetNotFound('Campaign not found');
      campaignId = requestedCampaignId;
    }

    if (!command.actor.isAdmin) {
      const isOwner = asset.uploadedById === command.actor.userId;
      if (asset.scope === 'USER' && !isOwner) {
        throw assetForbidden('Only the asset owner can move personal assets');
      }
      if (asset.scope === 'CAMPAIGN' && asset.campaignId && !isOwner) {
        const sourceRole = await this.repository.findCampaignRole(command.actor.userId, asset.campaignId);
        if (sourceRole !== 'DM') throw assetForbidden('Only the asset owner or campaign DM can move this asset');
      }
      if (scope === 'CAMPAIGN' && campaignId) {
        const targetRole = await this.repository.findCampaignRole(command.actor.userId, campaignId);
        if (!targetRole) throw assetForbidden('You must be a member of the target campaign to move assets there');
      }
    }

    return this.repository.updateAssetScope(asset.id, scope, campaignId);
  }
}

function isAssetType(value: unknown): value is AssetType {
  return value === 'MAP' || value === 'TOKEN' || value === 'AUDIO' || value === 'AVATAR';
}

function isAssetScope(value: unknown): value is AssetScope {
  return value === 'GLOBAL' || value === 'USER' || value === 'CAMPAIGN';
}

export function isAssetMutationError(error: unknown): error is AssetMutationError {
  return error instanceof AssetMutationError;
}
