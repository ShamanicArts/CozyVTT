import { MapToken, MapTokenMap } from '../domain/mapTokens/MapToken';

/** Persistence boundary for REST mutations of map-embedded tokens. */
export interface MapTokenRepository {
  findMap(mapId: string): Promise<MapTokenMap | null>;
  findMembershipRole(userId: string, campaignId: string): Promise<string | null>;
  /** Returns the adapter's normal map representation for the unchanged HTTP response. */
  updateTokens(mapId: string, expectedRevision: number, tokens: MapToken[]): Promise<unknown>;
}
