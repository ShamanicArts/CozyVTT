/**
 * Campaign policy boundary used when an actor attempts to manipulate a
 * spirit-layer token. Recipient visibility remains a Socket.IO concern.
 */
export interface SpiritVisibilityPolicy {
  canSeeSpiritLayer(campaignId: string, userId: string): Promise<boolean>;
}
