import { computeVisibility, isPointVisible } from './serverRaycasting';
import type { WallSegment, LightSource } from '../types/walls';
import logger from './logger';

/**
 * Spirit Layer Utility Functions
 * Spirit Layer Implementation
 *
 * All spirit layer filtering happens server-side.
 * Spirit layer tokens and data are never sent to players — only DMs see them.
 */

// Token interface
interface Token {
  id: string;
  characterId?: string | null;
  name: string;
  imageUrl: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  layer: 'token' | 'spirit';
  visible: boolean;
  controlledBy?: string | null;
  rotation: number;
  conditions: string[];
  metadata: Record<string, unknown>;
  type?: string;
  disposition?: string | null;
  hp?: { current: number; max: number; temp: number } | null;
  showHpBar?: boolean;
  notes?: string;
  initiative?: number | null;
  sightRadius?: number;
  displayMode?: 'pog' | 'top-down' | 'full-art';
  statBlock?: Record<string, unknown> | null;
  creatureTemplateId?: string | null;
}

// Map data as returned from Prisma
export interface MapData {
  id: string;
  campaignId: string;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  gridSize: number;
  feetPerSquare: number;
  diagonalRule: string;
  baseLayerUrl: string;
  spiritLayerUrl: string | null;
  tokens: unknown;
  annotations: unknown;
  wallSegments: unknown;
  fogData: unknown;
  lightingEnabled: boolean;
  lights: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Filter tokens based on user role and spirit layer visibility.
 *
 * 
 * - DM always sees all tokens on both layers
 * - Players/spectators only see spirit layer tokens when spirit visibility is enabled
 * - Hidden tokens (visible: false) are only visible to the DM
 *
 * @param tokens - Raw token array from the map
 * @param userRole - The user's campaign role (DM, PLAYER, SPECTATOR)
 * @param spiritVisible - Whether the spirit layer is visible to this user
 * @returns Filtered token array
 */
export function filterTokensByRole(
  tokens: unknown,
  userRole: string,
  spiritVisible: boolean
): Token[] {
  const tokensArray = (Array.isArray(tokens) ? tokens : []) as Token[];

  // DM sees everything (including notes)
  if (userRole === 'DM') {
    return tokensArray;
  }

  const visibleTokens = tokensArray.filter((token) => {
    // Players only see tokens on their currently active layer:
    // - Spirit layer visible (player is in spirit realm): only spirit tokens
    // - Spirit layer hidden (player is on material plane): only material tokens
    if (spiritVisible && token.layer !== 'spirit') return false;
    if (!spiritVisible && token.layer !== 'token') return false;

    // Filter out hidden tokens (only DM can see invisible tokens)
    if (!token.visible) {
      return false;
    }

    return true;
  });

  // Strip DM-only notes field from non-DM clients
  return visibleTokens.map((token) => {
    const { notes: _notes, ...rest } = token;
    return rest as Token;
  });
}

/**
 * Filter tokens by dynamic lighting visibility for a non-DM player.
 *
 * When lightingEnabled is true on a map, players should only
 * receive tokens that are within their character's line of sight.
 *
 * @param tokens         Tokens already filtered by role/spirit rules
 * @param playerUserId   The player's user ID
 * @param walls          Map wall segments (for raycasting)
 * @param mapWidth       Map pixel width
 * @param mapHeight      Map pixel height
 * @param gridSize       Map grid size in pixels (to convert position to map-space)
 * @param lightingEnabled Whether dynamic lighting is active
 * @returns Tokens visible to this player
 */
export function filterTokensByLighting(
  tokens: Token[],
  playerUserId: string,
  walls: unknown,
  mapWidth: number,
  mapHeight: number,
  gridSize: number,
  lightingEnabled: boolean,
  lights?: unknown
): Token[] {
  if (!lightingEnabled) return tokens;

  const wallSegs = (Array.isArray(walls) ? walls : []) as unknown as WallSegment[];
  const lightSources = (Array.isArray(lights) ? lights : []) as unknown as LightSource[];
  const enabledLights = lightSources.filter((l) => l.enabled);

  // Find all tokens controlled by this player
  const myTokens = tokens.filter((t) => t.controlledBy === playerUserId);

  if (myTokens.length === 0 && enabledLights.length === 0) {
    // No controlled tokens and no lights — only return tokens explicitly marked visible
    return tokens.filter((t) => t.visible);
  }

  const startMs = Date.now();
  const mapWidthPx = mapWidth * gridSize;
  const mapHeightPx = mapHeight * gridSize;

  // Compute combined visibility polygons from all controlled tokens.
  // Token grid coords use Y=0 at bottom (VTT standard); wall pixel coords use Y=0 at top.
  // Apply the Y-flip so both are in the same canvas pixel coordinate space.
  const visPolygons = myTokens.map((t) => {
    const cx = (t.position.x + (t.size?.width ?? 1) / 2) * gridSize;
    const cy = (mapHeight - 1 - t.position.y + (t.size?.height ?? 1) / 2) * gridSize;
    const radiusPx = (t.sightRadius ?? 0) * gridSize;
    return computeVisibility({ x: cx, y: cy }, wallSegs, mapWidthPx, mapHeightPx, radiusPx);
  });

  // Additive visibility: also compute visibility polygons from each enabled light source.
  // Uses dimRadius (outer edge) — anything within dim range is "visible" for token filtering.
  // Light positions are already in map-space pixels (Y=0 at top), no flip needed.
  for (const light of enabledLights) {
    const dimRadiusPx = (light.dimRadius ?? light.brightRadius ?? 3) * gridSize;
    visPolygons.push(
      computeVisibility({ x: light.x, y: light.y }, wallSegs, mapWidthPx, mapHeightPx, dimRadiusPx)
    );
  }

  const elapsed = Date.now() - startMs;
  if (elapsed > 50) {
    logger.warn(`[lighting] filterTokensByLighting took ${elapsed}ms for userId=${playerUserId} (${myTokens.length} tokens, ${enabledLights.length} lights)`);
  }

  // Keep tokens that are inside any of the visibility polygons (token or light)
  return tokens.filter((t) => {
    // Always include the player's own tokens
    if (t.controlledBy === playerUserId) return true;

    const cx = (t.position.x + (t.size?.width ?? 1) / 2) * gridSize;
    const cy = (mapHeight - 1 - t.position.y + (t.size?.height ?? 1) / 2) * gridSize;
    return visPolygons.some((poly) => isPointVisible({ x: cx, y: cy }, poly));
  });
}

/**
 * Filter entire map data based on user role and spirit layer visibility.
 *
 * This filters:
 * - Tokens (via filterTokensByRole)
 * - Spirit layer URL (hidden from non-DMs when spirit layer is not visible)
 *
 * 
 * - CRITICAL: Never send spirit layer data to non-privileged users
 *
 * @param mapData - Raw map data from Prisma
 * @param userRole - The user's campaign role
 * @param spiritVisible - Whether the spirit layer is visible to this user
 * @returns Filtered map data safe to send to the client
 */
export function filterMapData(
  mapData: MapData,
  userRole: string,
  spiritVisible: boolean,
  userId?: string
): MapData & { tokens: Token[] } {
  let filteredTokens = filterTokensByRole(mapData.tokens, userRole, spiritVisible);

  // Apply dynamic lighting filter for non-DM players when lighting is enabled
  if (userRole !== 'DM' && mapData.lightingEnabled && userId) {
    filteredTokens = filterTokensByLighting(
      filteredTokens,
      userId,
      mapData.wallSegments,
      mapData.width,
      mapData.height,
      mapData.gridSize,
      true,
      mapData.lights
    );
  }

  return {
    ...mapData,
    tokens: filteredTokens,
    // Remove spirit layer URL if user shouldn't see it
    spiritLayerUrl: (userRole === 'DM' || spiritVisible) ? mapData.spiritLayerUrl : null,
    // Wall segments are sent to all roles (players need them for visibility rendering)
    wallSegments: mapData.wallSegments ?? [],
    // Light sources are sent to all roles (players need them for visibility rendering)
    lights: mapData.lights ?? [],
    // Fog data is DM-only (full state); players receive derived revealed-cells via WebSocket
    fogData: userRole === 'DM' ? mapData.fogData : null,
    lightingEnabled: mapData.lightingEnabled,
  };
}
