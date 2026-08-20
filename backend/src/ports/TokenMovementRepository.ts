import { MapToken, TokenMovementMap } from '../domain/tokens/TokenMovement';

/** Persistence boundary for map-embedded token movement. */
export interface TokenMovementRepository {
  findMap(mapId: string): Promise<TokenMovementMap | null>;
  updateTokens(mapId: string, tokens: MapToken[]): Promise<void>;
}
