/** Asset URL normalization boundary used by map commands. */
export interface MapAssetUrlNormalizer {
  normalizeMapAssetUrl(url: string): string | null;
}
