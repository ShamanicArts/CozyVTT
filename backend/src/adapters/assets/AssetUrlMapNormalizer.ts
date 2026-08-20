import { normalizeAssetUrl } from '../../utils/asset-urls';
import { MapAssetUrlNormalizer } from '../../ports/MapAssetUrlNormalizer';

/** Adapts the established asset path rules for map lifecycle commands. */
export class AssetUrlMapNormalizer implements MapAssetUrlNormalizer {
  normalizeMapAssetUrl(url: string): string | null {
    return normalizeAssetUrl(url, 'maps');
  }
}
