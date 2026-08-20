/** Keeps storage-path conventions out of map-token application commands. */
export interface MapTokenAssetUrlNormalizer {
  normalizeTokenImageUrl(url: string): string | null;
}
