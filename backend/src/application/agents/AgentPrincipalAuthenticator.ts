import { createHash } from "crypto";
import type { AgentAccessRepository } from "../../ports/AgentAccessRepository";

export interface AgentIdentity {
  credentialId: string;
  delegatedUserId: string;
  campaignId: string;
}

/** Shared credential boundary for HTTP and MCP agent transports. */
export class AgentPrincipalAuthenticator {
  public constructor(
    private readonly access: AgentAccessRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async authenticate(
    bearerToken: string,
    campaignId: string,
  ): Promise<AgentIdentity | null> {
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
    };
  }
}

export function sha256Digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
