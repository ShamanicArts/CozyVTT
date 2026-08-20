import {
  assertPositionWithinMap,
  MapToken,
  TokenMovementActor,
  TokenMovementError,
  TokenMovementMap,
  TokenPosition,
} from '../../domain/tokens/TokenMovement';
import { SpiritVisibilityPolicy } from '../../ports/SpiritVisibilityPolicy';
import { TokenMovementRepository } from '../../ports/TokenMovementRepository';
import { Command, CommandHandler } from '../commands/CommandBus';

export const START_TOKEN_MOVE = 'token.move.start' as const;
export const PREVIEW_TOKEN_MOVE = 'token.move.preview' as const;
export const FINALIZE_TOKEN_MOVE = 'token.move.finalize' as const;

export interface StartTokenMoveCommand extends Command<StartTokenMoveResult> {
  readonly type: typeof START_TOKEN_MOVE;
  readonly actor: TokenMovementActor;
  readonly tokenId: string;
  readonly mapId: string;
}

export interface PreviewTokenMoveCommand extends Command<PreviewTokenMoveResult | null> {
  readonly type: typeof PREVIEW_TOKEN_MOVE;
  readonly campaignId: string;
  readonly tokenId: string;
  readonly mapId: string;
  readonly position: TokenPosition;
}

export interface FinalizeTokenMoveCommand extends Command<FinalizeTokenMoveResult> {
  readonly type: typeof FINALIZE_TOKEN_MOVE;
  readonly actor: TokenMovementActor;
  readonly tokenId: string;
  readonly mapId: string;
  readonly position: TokenPosition;
}

export interface StartTokenMoveResult {
  map: TokenMovementMap;
  token: MapToken;
}

/**
 * A transient drag frame. It intentionally does not authorize the sender or
 * require the token to exist because the legacy `token.move` event had those
 * exact semantics; the final command remains the authoritative write.
 */
export interface PreviewTokenMoveResult {
  map: TokenMovementMap;
  token: MapToken | undefined;
}

export interface FinalizeTokenMoveResult {
  map: TokenMovementMap;
  token: MapToken;
  tokens: MapToken[];
}

abstract class TokenMoveCommandBase {
  constructor(
    protected readonly repository: TokenMovementRepository,
    private readonly spiritVisibility: SpiritVisibilityPolicy
  ) {}

  protected async loadMap(actor: TokenMovementActor, mapId: string): Promise<TokenMovementMap> {
    const map = await this.repository.findMap(mapId);
    if (!map || map.campaignId !== actor.campaignId) {
      throw new TokenMovementError('MAP_NOT_FOUND', 'Map not found');
    }

    return map;
  }

  protected async authorizeToken(
    actor: TokenMovementActor,
    map: TokenMovementMap,
    tokenId: string,
    enforceSpectatorRestriction: boolean
  ): Promise<MapToken> {
    const token = map.tokens.find((candidate) => candidate.id === tokenId);
    if (!token) {
      throw new TokenMovementError('TOKEN_NOT_FOUND', 'Token not found');
    }

    // Preserve the original precedence: a spectator controlling a token gets
    // the explicit spectator error, otherwise the usual permission denial.
    if (actor.role !== 'DM' && token.controlledBy !== actor.userId) {
      throw new TokenMovementError('NOT_ALLOWED', 'You do not have permission to move this token');
    }
    if (enforceSpectatorRestriction && actor.role === 'SPECTATOR') {
      throw new TokenMovementError('SPECTATOR_NOT_ALLOWED', 'Spectators cannot move tokens');
    }

    if (token.layer === 'spirit' && actor.role !== 'DM') {
      const visible = await this.spiritVisibility.canSeeSpiritLayer(actor.campaignId, actor.userId);
      if (!visible) {
        throw new TokenMovementError('SPIRIT_LAYER_NOT_ALLOWED', 'You cannot interact with spirit layer tokens');
      }
    }

    return token;
  }
}

/** Authorizes a drag start and supplies the token needed by the Socket.IO fan-out adapter. */
export class StartTokenMove extends TokenMoveCommandBase implements CommandHandler<StartTokenMoveCommand, StartTokenMoveResult> {
  async execute(command: StartTokenMoveCommand): Promise<StartTokenMoveResult> {
    const map = await this.loadMap(command.actor, command.mapId);
    const token = await this.authorizeToken(command.actor, map, command.tokenId, true);
    return { map, token };
  }
}

/** Validates a high-frequency drag frame without writing it to persistence. */
export class PreviewTokenMove implements CommandHandler<PreviewTokenMoveCommand, PreviewTokenMoveResult | null> {
  constructor(private readonly repository: TokenMovementRepository) {}

  async execute(command: PreviewTokenMoveCommand): Promise<PreviewTokenMoveResult | null> {
    const map = await this.repository.findMap(command.mapId);
    // The original Socket.IO transport silently discards a wrong-map frame.
    if (!map || map.campaignId !== command.campaignId) return null;

    assertPositionWithinMap(map, command.position);
    return {
      map,
      token: map.tokens.find((candidate) => candidate.id === command.tokenId),
    };
  }
}

/**
 * The authoritative token write. All adapters use its validation,
 * authorization and persistence result before announcing movement.
 */
export class FinalizeTokenMove extends TokenMoveCommandBase implements CommandHandler<FinalizeTokenMoveCommand, FinalizeTokenMoveResult> {
  async execute(command: FinalizeTokenMoveCommand): Promise<FinalizeTokenMoveResult> {
    const map = await this.loadMap(command.actor, command.mapId);
    // The legacy final event performs bounds validation before token lookup or
    // authorization. Keep that observable error ordering unchanged.
    assertPositionWithinMap(map, command.position);
    // The original finalization handler did not have the drag-start's extra
    // spectator guard. Retain that wire-contract behaviour for this migration.
    const token = await this.authorizeToken(command.actor, map, command.tokenId, false);

    const movedToken: MapToken = { ...token, position: { ...command.position } };
    const tokens = map.tokens.map((candidate) => candidate.id === command.tokenId ? movedToken : candidate);

    await this.repository.updateTokens(command.mapId, map.revision, tokens);
    return { map, token: movedToken, tokens };
  }
}
