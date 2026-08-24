/**
 * Asset URL Utilities
 * Ensures all asset URLs use the full path format: /api/assets/{type}/{uuid}
 */

/**
 * Check if a string is a valid UUID
 */
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Normalize an asset URL to the full path format
 * If the input is already a full path, return it as-is
 * If the input is just a UUID, prepend the appropriate path
 *
 * @param url - The asset URL (either UUID or full path)
 * @param assetType - The type of asset ('maps', 'tokens', 'avatars', 'audio')
 * @returns The normalized full path URL
 *
 * @example
 * normalizeAssetUrl('bc5f19c0-158b-4330-a5cc-6133666a4fec', 'maps')
 * // => '/api/assets/maps/bc5f19c0-158b-4330-a5cc-6133666a4fec'
 *
 * normalizeAssetUrl('/api/assets/maps/bc5f19c0-158b-4330-a5cc-6133666a4fec', 'maps')
 * // => '/api/assets/maps/bc5f19c0-158b-4330-a5cc-6133666a4fec'
 */
export function normalizeAssetUrl(url: string | null | undefined, assetType: 'maps' | 'tokens' | 'avatars' | 'audio'): string | null {
  // Handle null/undefined
  if (url === null || url === undefined) {
    return null;
  }

  // If already a full path, return as-is
  if (url.startsWith('/api/assets/')) {
    return url;
  }

  // If it's a UUID, prepend the path
  if (isUUID(url)) {
    return `/api/assets/${assetType}/${url}`;
  }

  // If it's neither, assume it's a UUID and prepend anyway
  // (this handles cases where the UUID check might fail but it's still valid)
  return `/api/assets/${assetType}/${url}`;
}

/**
 * Normalize a map's asset URLs
 */
export function normalizeMapUrls<T extends object>(mapData: T): T & {
  imageUrl?: string | null;
  baseLayerUrl?: string | null;
  spiritLayerUrl?: string | null;
};
export function normalizeMapUrls(mapData: unknown): unknown;
export function normalizeMapUrls(mapData: unknown): unknown {
  if (!isRecord(mapData)) return mapData;
  const normalized = { ...mapData };

  if (typeof normalized.imageUrl === 'string') {
    normalized.imageUrl = normalizeAssetUrl(normalized.imageUrl, 'maps');
  }

  if (typeof normalized.baseLayerUrl === 'string') {
    normalized.baseLayerUrl = normalizeAssetUrl(normalized.baseLayerUrl, 'maps');
  }

  if (typeof normalized.spiritLayerUrl === 'string') {
    normalized.spiritLayerUrl = normalizeAssetUrl(normalized.spiritLayerUrl, 'maps');
  }

  return normalized;
}

/**
 * Normalize a token's asset URLs
 */
export function normalizeTokenUrls<T extends object>(tokenData: T): T & {
  imageUrl?: string | null;
};
export function normalizeTokenUrls(tokenData: unknown): unknown;
export function normalizeTokenUrls(tokenData: unknown): unknown {
  if (!isRecord(tokenData)) return tokenData;
  const normalized = { ...tokenData };

  if (typeof normalized.imageUrl === 'string') {
    normalized.imageUrl = normalizeAssetUrl(normalized.imageUrl, 'tokens');
  }

  return normalized;
}

/**
 * Normalize a character's asset URLs
 */
export function normalizeCharacterUrls<T extends object>(characterData: T): T & {
  tokenImageUrl?: string | null;
};
export function normalizeCharacterUrls(characterData: unknown): unknown;
export function normalizeCharacterUrls(characterData: unknown): unknown {
  if (!isRecord(characterData)) return characterData;
  const normalized = { ...characterData };

  if (typeof normalized.tokenImageUrl === 'string') {
    normalized.tokenImageUrl = normalizeAssetUrl(normalized.tokenImageUrl, 'tokens');
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
