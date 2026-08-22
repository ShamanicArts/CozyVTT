import { randomBytes } from "crypto";
import type {
  PluginAccessRepository,
  PluginCredentialRecord,
} from "../../ports/PluginAccessRepository";

export class PluginCredentialService {
  public constructor(
    private readonly repository: PluginAccessRepository,
    private readonly hash: (value: string) => string,
  ) {}
  async issue(input: {
    userId: string;
    campaignId: string;
    label: string;
    expiresAt: Date | null;
  }): Promise<{ credential: PluginCredentialRecord; token: string }> {
    if (
      !(await this.repository.campaignMembershipExists(
        input.userId,
        input.campaignId,
      ))
    )
      throw new PluginCredentialError();
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
  list(userId: string): Promise<PluginCredentialRecord[]> {
    return this.repository.listCredentials(userId);
  }
  revoke(credentialId: string, userId: string): Promise<boolean> {
    return this.repository.revokeCredential(credentialId, userId, new Date());
  }
}
export class PluginCredentialError extends Error {
  constructor() {
    super("Campaign access is required");
  }
}
