import { randomBytes } from "crypto";
import type {
  AgentAccessRepository,
  AgentCredentialRecord,
} from "../../ports/AgentAccessRepository";

export class AgentCredentialService {
  public constructor(
    private readonly repository: AgentAccessRepository,
    private readonly hash: (value: string) => string,
  ) {}
  async issue(input: {
    userId: string;
    campaignId: string;
    label: string;
    expiresAt: Date | null;
  }): Promise<{ credential: AgentCredentialRecord; token: string }> {
    if (
      !(await this.repository.campaignMembershipExists(
        input.userId,
        input.campaignId,
      ))
    )
      throw new AgentCredentialError();
    const token = randomBytes(32).toString("base64url");
    return {
      credential: await this.repository.createCredential({
        credentialHash: this.hash(token),
        delegatedUserId: input.userId,
        campaignId: input.campaignId,
        label: input.label,
        createdById: input.userId,
        expiresAt: input.expiresAt,
      }),
      token,
    };
  }
  list(userId: string): Promise<AgentCredentialRecord[]> {
    return this.repository.listCredentials(userId);
  }
  revoke(credentialId: string, userId: string): Promise<boolean> {
    return this.repository.revokeCredential(credentialId, userId, new Date());
  }
}
export class AgentCredentialError extends Error {
  constructor() {
    super("Campaign access is required");
  }
}
