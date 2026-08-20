/** Keeps character token image path conventions outside the application layer. */
export interface CharacterAssetUrlNormalizer {
  normalizeTokenImageUrl(url: string): string | null;
}
