import { CharacterAssetUrlNormalizer } from '../../ports/CharacterAssetUrlNormalizer';
import { normalizeAssetUrl } from '../../utils/asset-urls';

/** Existing CozyVTT token asset URL convention behind an application port. */
export class LegacyCharacterAssetUrlNormalizer implements CharacterAssetUrlNormalizer {
  normalizeTokenImageUrl(url: string): string | null {
    return normalizeAssetUrl(url, 'tokens');
  }
}
