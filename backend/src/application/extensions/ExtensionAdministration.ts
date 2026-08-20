import type {
  ExtensionAdministrationRepository,
  ExtensionGrantRecord,
  ExtensionGrantPermission,
  ExtensionGrantPrincipal,
} from "../../ports/ExtensionAdministrationRepository";

export class ExtensionAdministrationService {
  public constructor(
    private readonly repository: ExtensionAdministrationRepository,
  ) {}

  public listGrants(campaignId?: string): Promise<ExtensionGrantRecord[]> {
    return this.repository.listGrants(campaignId);
  }

  public grant(input: {
    principalType: ExtensionGrantPrincipal;
    principalId: string;
    scopeCampaignId: string;
    extensionId: string;
    permission: ExtensionGrantPermission;
    expiresAt: Date | null;
    grantedById: string;
  }): Promise<ExtensionGrantRecord> {
    return this.repository.grant(input);
  }

  public revokeGrant(grantId: string): Promise<boolean> {
    return this.repository.revokeGrant(grantId, new Date());
  }
}
