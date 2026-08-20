import { getSpiritVisibility } from '../../utils/spirit-layer';
import { SpiritVisibilityPolicy } from '../../ports/SpiritVisibilityPolicy';

/** Existing campaign/spirit visibility logic exposed behind an application port. */
export class PrismaSpiritVisibilityPolicy implements SpiritVisibilityPolicy {
  canSeeSpiritLayer(campaignId: string, userId: string): Promise<boolean> {
    return getSpiritVisibility(campaignId, userId);
  }
}
