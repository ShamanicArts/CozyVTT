import { timingSafeEqual } from "crypto";
import type {
  ExtensionSignatureVerifier,
  ExtensionTrustAllowlist,
} from "../ports";

interface AllowlistEntry {
  readonly extensionId: string;
  readonly version: string;
  readonly checksum: string;
}

/**
 * Deployment configuration supplies exact immutable package identities. Empty
 * or malformed configuration intentionally yields an empty, deny-all list.
 */
export class EnvironmentExtensionTrustAllowlist implements ExtensionTrustAllowlist {
  private readonly entries: readonly AllowlistEntry[];

  public constructor(raw = process.env.TRUSTED_EXTENSION_ALLOWLIST ?? "[]") {
    this.entries = parseAllowlist(raw);
  }

  public async allows(
    extensionId: string,
    version: string,
    checksum: string,
  ): Promise<boolean> {
    return this.entries.some(
      (entry) =>
        entry.extensionId === extensionId &&
        entry.version === version &&
        entry.checksum === checksum,
    );
  }
}

/**
 * A small HMAC verifier for deployments that choose a shared review key. A
 * future asymmetric verifier can satisfy the same port without changing the
 * host. An absent key always rejects the signature.
 */
export class HmacExtensionSignatureVerifier implements ExtensionSignatureVerifier {
  public constructor(
    private readonly reviewKey = process.env.TRUSTED_EXTENSION_REVIEW_KEY,
  ) {}

  public async verify(input: {
    extensionId: string;
    version: string;
    checksum: string;
    signature: string;
  }): Promise<boolean> {
    if (!this.reviewKey || !input.signature.startsWith("hmac-sha256:"))
      return false;
    const { createHmac } = await import("crypto");
    const expected = createHmac("sha256", this.reviewKey)
      .update(`${input.extensionId}\n${input.version}\n${input.checksum}`)
      .digest("hex");
    const supplied = input.signature.slice("hmac-sha256:".length);
    if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(supplied, "hex"),
    );
  }
}

function parseAllowlist(raw: string): readonly AllowlistEntry[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): AllowlistEntry[] => {
      if (!isRecord(entry)) return [];
      const { extensionId, version, checksum } = entry;
      if (
        typeof extensionId !== "string" ||
        typeof version !== "string" ||
        typeof checksum !== "string"
      )
        return [];
      return [{ extensionId, version, checksum }];
    });
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
