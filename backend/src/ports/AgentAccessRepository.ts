export interface AgentCredentialRecord {
  id: string;
  delegatedUserId: string;
  campaignId: string;
  label: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface AgentAccessRepository {
  createCredential(input: {
    credentialHash: string;
    delegatedUserId: string;
    campaignId: string;
    label: string;
    createdById: string;
    expiresAt: Date | null;
  }): Promise<AgentCredentialRecord>;
  listCredentials(delegatedUserId: string): Promise<AgentCredentialRecord[]>;
  revokeCredential(
    id: string,
    delegatedUserId: string,
    now: Date,
  ): Promise<boolean>;
  findCredentialByHash(
    hash: string,
    now: Date,
  ): Promise<AgentCredentialRecord | null>;
  markCredentialUsed(id: string, now: Date): Promise<void>;
  campaignMembershipExists(
    userId: string,
    campaignId: string,
  ): Promise<boolean>;
  createConfirmation(input: {
    credentialId: string;
    delegatedUserId: string;
    campaignId: string;
    extensionId: string;
    commandId: string;
    inputDigest: string;
    expiresAt: Date;
  }): Promise<{ id: string; expiresAt: Date }>;
  approveConfirmation(input: {
    confirmationId: string;
    delegatedUserId: string;
    receiptHash: string;
    now: Date;
  }): Promise<boolean>;
  consumeApprovedConfirmation(input: {
    receiptHash: string;
    credentialId: string;
    delegatedUserId: string;
    campaignId: string;
    extensionId: string;
    commandId: string;
    inputDigest: string;
    now: Date;
  }): Promise<boolean>;
  listPendingConfirmations(
    delegatedUserId: string,
    now: Date,
  ): Promise<
    Array<{
      id: string;
      campaignId: string;
      extensionId: string;
      commandId: string;
      inputDigest: string;
      expiresAt: Date;
      createdAt: Date;
    }>
  >;
  denyConfirmation(input: {
    confirmationId: string;
    delegatedUserId: string;
    now: Date;
  }): Promise<boolean>;
}
