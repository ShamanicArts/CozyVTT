export interface PluginCredentialRecord {
  id: string;
  delegatedUserId: string;
  campaignId: string;
  label: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface ApprovalDisplayMetadata {
  capabilityTitle: string;
  capabilityVersion: string;
  campaignLabel: string;
  integrationLabel: string;
  riskExplanation: string;
  summary: Record<string, string | number | boolean>;
}

export interface PluginAccessRepository {
  createCredential(input: {
    credentialHash: string;
    delegatedUserId: string;
    campaignId: string;
    label: string;
    createdById: string;
    expiresAt: Date | null;
  }): Promise<PluginCredentialRecord>;
  listCredentials(delegatedUserId: string): Promise<PluginCredentialRecord[]>;
  revokeCredential(
    id: string,
    delegatedUserId: string,
    now: Date,
  ): Promise<boolean>;
  findCredentialByHash(
    hash: string,
    now: Date,
  ): Promise<PluginCredentialRecord | null>;
  findCredentialById(
    id: string,
    now: Date,
  ): Promise<PluginCredentialRecord | null>;
  markCredentialUsed(id: string, now: Date): Promise<void>;
  campaignMembershipExists(
    userId: string,
    campaignId: string,
  ): Promise<boolean>;
  activeCredentialDelegates(input: {
    credentialId: string;
    delegatedUserId: string;
    campaignId: string;
    now: Date;
  }): Promise<boolean>;
  createApproval(input: {
    credentialId: string;
    delegatedUserId: string;
    campaignId: string;
    extensionId: string;
    commandId: string;
    inputDigest: string;
    displayMetadata: ApprovalDisplayMetadata;
    expiresAt: Date;
  }): Promise<{ id: string; expiresAt: Date }>;
  approveApproval(input: {
    approvalId: string;
    delegatedUserId: string;
    now: Date;
  }): Promise<boolean>;
  consumeApprovedApprovalById(input: {
    approvalId: string;
    credentialId: string;
    delegatedUserId: string;
    campaignId: string;
    extensionId: string;
    commandId: string;
    inputDigest: string;
    now: Date;
  }): Promise<boolean>;
  listPendingApprovals(
    delegatedUserId: string,
    now: Date,
  ): Promise<
    Array<{
      id: string;
      campaignId: string;
      extensionId: string;
        commandId: string;
        state: "PENDING";
        displayMetadata: ApprovalDisplayMetadata;
        expiresAt: Date;
      createdAt: Date;
    }>
  >;
  denyApproval(input: {
    approvalId: string;
    delegatedUserId: string;
    now: Date;
  }): Promise<boolean>;
}
