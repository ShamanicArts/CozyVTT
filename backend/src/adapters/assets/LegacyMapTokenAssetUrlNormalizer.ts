import { normalizeAssetUrl } from '../../utils/asset-urls';
import { MapTokenAssetUrlNormalizer } from '../../ports/MapTokenAssetUrlNormalizer';

/** Existing CozyVTT token-asset URL convention exposed behind a port. */
export class LegacyMapTokenAssetUrlNormalizer implements MapTokenAssetUrlNormalizer {
  normalizeTokenImageUrl(url: string): string | null {
    return normalizeAssetUrl(url, 'tokens');
  }
}
