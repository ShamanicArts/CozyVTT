export type ExtensionGrantPrincipal = "USER" | "PLUGIN" | "SYSTEM";
export type ExtensionGrantPermission = "READ" | "WRITE" | "EXECUTE" | "ADMIN";

export interface ExtensionGrantRecord {
  id: string;
  principalType: ExtensionGrantPrincipal;
  principalId: string;
  scopeCampaignId: string;
  extensionId: string;
  permission: ExtensionGrantPermission;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface ExtensionAdministrationRepository {
  listGrants(campaignId?: string): Promise<ExtensionGrantRecord[]>;
  grant(
    input: Omit<ExtensionGrantRecord, "id" | "revokedAt" | "createdAt"> & {
      grantedById: string;
    },
  ): Promise<ExtensionGrantRecord>;
  revokeGrant(grantId: string, now: Date): Promise<boolean>;
}
