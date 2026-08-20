import { randomUUID } from 'crypto';
import { MapToken, MapTokenError, MapTokenMap } from '../../domain/mapTokens/MapToken';
import { MapTokenAssetUrlNormalizer } from '../../ports/MapTokenAssetUrlNormalizer';
import { MapTokenRepository } from '../../ports/MapTokenRepository';
import { Command, CommandHandler } from '../commands/CommandBus';

export const CREATE_MAP_TOKEN = 'map-token.create' as const;
export const UPDATE_MAP_TOKEN = 'map-token.update' as const;
export const DELETE_MAP_TOKEN = 'map-token.delete' as const;

const VALID_TOKEN_TYPES = ['player', 'npc', 'object'];
const VALID_TOKEN_DISPOSITIONS = ['friendly', 'neutral', 'hostile'];
const VALID_DISPLAY_MODES = ['pog', 'top-down', 'full-art'];

export interface CreateMapTokenCommand extends Command<MapTokenMutationResult> {
  readonly type: typeof CREATE_MAP_TOKEN;
  readonly campaignId: string;
  readonly mapId: string;
  readonly data: unknown;
}

export interface UpdateMapTokenCommand extends Command<MapTokenMutationResult> {
  readonly type: typeof UPDATE_MAP_TOKEN;
  readonly campaignId: string;
  readonly mapId: string;
  readonly tokenId: string;
  readonly userId: string;
  readonly updates: unknown;
}

export interface DeleteMapTokenCommand extends Command<void> {
  readonly type: typeof DELETE_MAP_TOKEN;
  readonly campaignId: string;
  readonly mapId: string;
  readonly tokenId: string;
}

/** The map stays adapter-shaped so the route preserves its existing JSON response verbatim. */
export interface MapTokenMutationResult {
  token: MapToken;
  map: unknown;
}

abstract class MapTokenCommandBase {
  constructor(protected readonly repository: MapTokenRepository) {}

  protected async findMapInCampaign(campaignId: string, mapId: string): Promise<MapTokenMap> {
    const map = await this.repository.findMap(mapId);
    if (!map) throw new MapTokenError(404, 'Not Found', 'Map not found');
    if (map.campaignId !== campaignId) throw new MapTokenError(404, 'Not Found', 'Map not found in this campaign');
    return map;
  }
}

export class CreateMapToken extends MapTokenCommandBase implements CommandHandler<CreateMapTokenCommand, MapTokenMutationResult> {
  constructor(repository: MapTokenRepository, private readonly assetUrls: MapTokenAssetUrlNormalizer) {
    super(repository);
  }

  async execute(command: CreateMapTokenCommand): Promise<MapTokenMutationResult> {
    const map = await this.findMapInCampaign(command.campaignId, command.mapId);
    // Deliberately retain the permissive legacy request shape; Express has
    // already parsed the body and malformed objects still take the old 500 path.
    const data = command.data as any;

    if (!data.name || typeof data.name !== 'string') {
      throw new MapTokenError(400, 'Validation Error', 'Token name is required');
    }
    if (data.imageUrl && typeof data.imageUrl !== 'string') {
      throw new MapTokenError(400, 'Validation Error', 'Token imageUrl must be a string if provided');
    }
    if (!data.position || typeof data.position.x !== 'number' || typeof data.position.y !== 'number') {
      throw new MapTokenError(400, 'Validation Error', 'Token position {x, y} is required');
    }
    if (data.position.x < 0 || data.position.x >= map.width || data.position.y < 0 || data.position.y >= map.height) {
      throw new MapTokenError(400, 'Validation Error', `Token position must be within map bounds (0-${map.width - 1}, 0-${map.height - 1})`);
    }

    const layer = data.layer || 'token';
    if (layer !== 'token' && layer !== 'spirit') {
      throw new MapTokenError(400, 'Validation Error', 'Token layer must be "token" or "spirit"');
    }
    const type = data.type || 'npc';
    if (!VALID_TOKEN_TYPES.includes(type)) throw new MapTokenError(400, 'Validation Error', 'Invalid token type');
    const disposition = data.disposition !== undefined ? data.disposition : null;
    if (disposition !== null && !VALID_TOKEN_DISPOSITIONS.includes(disposition)) {
      throw new MapTokenError(400, 'Validation Error', 'Invalid token disposition');
    }
    const displayMode = data.displayMode || 'pog';
    if (!VALID_DISPLAY_MODES.includes(displayMode)) throw new MapTokenError(400, 'Validation Error', 'Invalid display mode');

    const imageUrl = data.imageUrl ? this.assetUrls.normalizeTokenImageUrl(data.imageUrl) : null;
    const token: MapToken = {
      id: randomUUID(),
      characterId: data.characterId || null,
      name: data.name,
      imageUrl: imageUrl || '',
      position: { x: data.position.x, y: data.position.y },
      size: data.size || { width: 1, height: 1 },
      layer,
      visible: data.visible !== undefined ? data.visible : true,
      controlledBy: data.controlledBy || null,
      rotation: data.rotation || 0,
      conditions: data.conditions || [],
      metadata: data.metadata || {},
      type,
      disposition,
      hp: data.hp || null,
      showHpBar: data.showHpBar !== undefined ? data.showHpBar : false,
      notes: typeof data.notes === 'string' ? data.notes : '',
      initiative: data.initiative !== undefined ? data.initiative : null,
      displayMode,
      statBlock: data.statBlock || null,
      creatureTemplateId: data.creatureTemplateId || null,
    };
    const updatedMap = await this.repository.updateTokens(map.id, map.revision, [...map.tokens, token]);
    return { token, map: updatedMap };
  }
}

export class UpdateMapToken extends MapTokenCommandBase implements CommandHandler<UpdateMapTokenCommand, MapTokenMutationResult> {
  constructor(repository: MapTokenRepository, private readonly assetUrls: MapTokenAssetUrlNormalizer) {
    super(repository);
  }

  async execute(command: UpdateMapTokenCommand): Promise<MapTokenMutationResult> {
    const map = await this.findMapInCampaign(command.campaignId, command.mapId);
    const membershipRole = await this.repository.findMembershipRole(command.userId, command.campaignId);
    if (!membershipRole) throw new MapTokenError(403, 'Forbidden', 'You are not a member of this campaign');

    const tokenIndex = map.tokens.findIndex((token) => token.id === command.tokenId);
    if (tokenIndex === -1) throw new MapTokenError(404, 'Not Found', 'Token not found on this map');
    const existingToken = map.tokens[tokenIndex];
    const isDM = membershipRole === 'DM';
    if (!isDM && existingToken.controlledBy !== command.userId) {
      throw new MapTokenError(403, 'Forbidden', 'You can only update tokens you control');
    }

    const updates = command.updates as any;
    if (updates.position) {
      if (typeof updates.position.x !== 'number' || typeof updates.position.y !== 'number') {
        throw new MapTokenError(400, 'Validation Error', 'Position must have numeric x and y values');
      }
      if (updates.position.x < 0 || updates.position.x >= map.width || updates.position.y < 0 || updates.position.y >= map.height) {
        throw new MapTokenError(400, 'Validation Error', `Position must be within map bounds (0-${map.width - 1}, 0-${map.height - 1})`);
      }
    }
    if (updates.layer !== undefined) {
      if (!isDM) throw new MapTokenError(403, 'Forbidden', 'Only DM can change token layer');
      if (updates.layer !== 'token' && updates.layer !== 'spirit') {
        throw new MapTokenError(400, 'Validation Error', 'Layer must be "token" or "spirit"');
      }
    }
    if (updates.type !== undefined && !VALID_TOKEN_TYPES.includes(updates.type)) {
      throw new MapTokenError(400, 'Validation Error', 'Invalid token type');
    }
    if (updates.disposition !== undefined && updates.disposition !== null && !VALID_TOKEN_DISPOSITIONS.includes(updates.disposition)) {
      throw new MapTokenError(400, 'Validation Error', 'Invalid token disposition');
    }
    if (updates.displayMode !== undefined && !VALID_DISPLAY_MODES.includes(updates.displayMode)) {
      throw new MapTokenError(400, 'Validation Error', 'Invalid display mode');
    }
    if (!isDM) {
      const restrictedFields = ['hp', 'notes', 'showHpBar', 'type', 'disposition', 'initiative', 'visible', 'name', 'imageUrl', 'layer', 'controlledBy', 'displayMode', 'statBlock', 'creatureTemplateId'];
      for (const field of restrictedFields) {
        if (updates[field] !== undefined) {
          throw new MapTokenError(403, 'Forbidden', `Only DM can update token field: ${field}`);
        }
      }
    }

    const token: MapToken = {
      ...existingToken,
      ...(updates.name && { name: updates.name }),
      ...(updates.imageUrl !== undefined && { imageUrl: updates.imageUrl ? (this.assetUrls.normalizeTokenImageUrl(updates.imageUrl) || existingToken.imageUrl) : '' }),
      ...(updates.position && { position: updates.position }),
      ...(updates.size && { size: updates.size }),
      ...(updates.layer && { layer: updates.layer }),
      ...(updates.visible !== undefined && { visible: updates.visible }),
      ...(updates.controlledBy !== undefined && { controlledBy: updates.controlledBy }),
      ...(updates.rotation !== undefined && { rotation: updates.rotation }),
      ...(updates.conditions && { conditions: updates.conditions }),
      ...(updates.metadata && { metadata: { ...existingToken.metadata, ...updates.metadata } }),
      ...(updates.type !== undefined && { type: updates.type }),
      ...(updates.disposition !== undefined && { disposition: updates.disposition }),
      ...(updates.hp !== undefined && { hp: updates.hp }),
      ...(updates.showHpBar !== undefined && { showHpBar: updates.showHpBar }),
      ...(updates.notes !== undefined && { notes: updates.notes }),
      ...(updates.initiative !== undefined && { initiative: updates.initiative }),
      ...(updates.displayMode !== undefined && { displayMode: updates.displayMode }),
      ...(updates.statBlock !== undefined && { statBlock: updates.statBlock }),
      ...(updates.creatureTemplateId !== undefined && { creatureTemplateId: updates.creatureTemplateId }),
    } as MapToken;
    const tokens = [...map.tokens];
    tokens[tokenIndex] = token;
    const updatedMap = await this.repository.updateTokens(map.id, map.revision, tokens);
    return { token, map: updatedMap };
  }
}

export class DeleteMapToken extends MapTokenCommandBase implements CommandHandler<DeleteMapTokenCommand, void> {
  async execute(command: DeleteMapTokenCommand): Promise<void> {
    const map = await this.findMapInCampaign(command.campaignId, command.mapId);
    if (!map.tokens.some((token) => token.id === command.tokenId)) {
      throw new MapTokenError(404, 'Not Found', 'Token not found on this map');
    }
    await this.repository.updateTokens(map.id, map.revision, map.tokens.filter((token) => token.id !== command.tokenId));
  }
}
