/**
 * Transport- and persistence-neutral model for the token data embedded in a
 * map. Map tokens are currently stored as a JSON array, so this model is
 * deliberately separate from Prisma's generated types.
 */
export interface TokenPosition {
  x: number;
  y: number;
}

export interface MapToken {
  id: string;
  characterId?: string | null;
  name: string;
  imageUrl: string;
  position: TokenPosition;
  size: { width: number; height: number };
  layer: 'token' | 'spirit';
  visible: boolean;
  controlledBy?: string | null;
  rotation: number;
  conditions: string[];
  metadata: Record<string, unknown>;
  type?: 'player' | 'npc' | 'object';
  disposition?: 'friendly' | 'neutral' | 'hostile' | null;
  hp?: { current: number; max: number; temp: number } | null;
  showHpBar?: boolean;
  notes?: string;
  initiative?: number | null;
  sightRadius?: number;
  displayMode?: 'pog' | 'top-down' | 'full-art';
  statBlock?: Record<string, unknown> | null;
  creatureTemplateId?: string | null;
}

/** The persisted map fields required by token movement and its fan-out. */
export interface TokenMovementMap {
  id: string;
  revision: number;
  campaignId: string;
  width: number;
  height: number;
  gridSize: number;
  tokens: MapToken[];
  lightingEnabled: boolean;
  wallSegments: unknown;
  lights: unknown;
}

export type TokenMovementRole = 'DM' | 'PLAYER' | 'SPECTATOR';

export interface TokenMovementActor {
  campaignId: string;
  userId: string;
  role: TokenMovementRole;
}

/**
 * Stable, adapter-mappable failures. Message text intentionally matches the
 * existing Socket.IO contract while the code gives future adapters a safe
 * machine-readable result.
 */
export class TokenMovementError extends Error {
  constructor(
    public readonly code:
      | 'MAP_NOT_FOUND'
      | 'TOKEN_NOT_FOUND'
      | 'POSITION_OUT_OF_BOUNDS'
      | 'NOT_ALLOWED'
      | 'SPECTATOR_NOT_ALLOWED'
      | 'SPIRIT_LAYER_NOT_ALLOWED',
    message: string
  ) {
    super(message);
    this.name = 'TokenMovementError';
  }
}

export function assertPositionWithinMap(map: Pick<TokenMovementMap, 'width' | 'height'>, position: TokenPosition): void {
  if (position.x < 0 || position.x >= map.width || position.y < 0 || position.y >= map.height) {
    throw new TokenMovementError('POSITION_OUT_OF_BOUNDS', 'Token position out of bounds');
  }
}
