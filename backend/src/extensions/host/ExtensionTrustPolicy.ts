import { ExtensionHostError } from "./contracts";
import type { DiscoveredExtensionPackage } from "./contracts";
import type {
  ExtensionSignatureVerifier,
  ExtensionTrustAllowlist,
  ExtensionTrustPolicy,
} from "./ports";

/**
 * Default-deny trust gate. An allowlist entry alone is insufficient when a
 * package declares a signature: its configured verifier must also accept the
 * exact manifest identity and checksum.
 */
export class ReviewedExtensionTrustPolicy implements ExtensionTrustPolicy {
  public constructor(
    private readonly allowlist: ExtensionTrustAllowlist,
    private readonly signatureVerifier: ExtensionSignatureVerifier,
  ) {}

  public async assertTrusted(
    discovered: DiscoveredExtensionPackage,
  ): Promise<void> {
    const { manifest, checksum, signature } = discovered.packageManifest;
    if (checksum !== discovered.computedChecksum) {
      throw new ExtensionHostError(
        `Checksum mismatch for ${manifest.id}`,
        "CHECKSUM_MISMATCH",
      );
    }
    if (
      !(await this.allowlist.allows(manifest.id, manifest.version, checksum))
    ) {
      throw new ExtensionHostError(
        `Extension ${manifest.id}@${manifest.version} is not allowlisted`,
        "UNTRUSTED_PACKAGE",
      );
    }
    if (!signature) {
      throw new ExtensionHostError(
        `Extension ${manifest.id} is allowlisted but unsigned`,
        "UNTRUSTED_PACKAGE",
      );
    }
    const verified = await this.signatureVerifier.verify({
      extensionId: manifest.id,
      version: manifest.version,
      checksum,
      signature,
    });
    if (!verified) {
      throw new ExtensionHostError(
        `Signature verification failed for ${manifest.id}`,
        "UNTRUSTED_PACKAGE",
      );
    }
  }
}
