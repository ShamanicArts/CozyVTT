import { createHash } from "crypto";
import type { PluginAccessRepository } from "../../ports/PluginAccessRepository";

export interface DelegatedPluginIdentity {
  credentialId: string;
  delegatedUserId: string;
  campaignId: string;
  expiresAt: Date | null;
}

/** Shared credential boundary for HTTP and plugin capability transports. */
export class PluginCredentialAuthenticator {
  public constructor(
    private readonly access: PluginAccessRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async authenticate(
    bearerToken: string,
    campaignId: string,
  ): Promise<DelegatedPluginIdentity | null> {
    const credential = await this.access.findCredentialByHash(
      sha256Digest(bearerToken),
      this.now(),
    );
    if (
      !credential ||
      credential.campaignId !== campaignId ||
      !(await this.access.campaignMembershipExists(
        credential.delegatedUserId,
        campaignId,
      ))
    ) {
      return null;
    }
    await this.access.markCredentialUsed(credential.id, this.now());
    return {
      credentialId: credential.id,
      delegatedUserId: credential.delegatedUserId,
      campaignId,
      expiresAt: credential.expiresAt,
    };
  }

  public async authenticateAny(
    bearerToken: string,
  ): Promise<DelegatedPluginIdentity | null> {
    const credential = await this.access.findCredentialByHash(
      sha256Digest(bearerToken),
      this.now(),
    );
    if (
      !credential ||
      !(await this.access.campaignMembershipExists(
        credential.delegatedUserId,
        credential.campaignId,
      ))
    )
      return null;
    await this.access.markCredentialUsed(credential.id, this.now());
    return {
      credentialId: credential.id,
      delegatedUserId: credential.delegatedUserId,
      campaignId: credential.campaignId,
      expiresAt: credential.expiresAt,
    };
  }
}

export function sha256Digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
