export type DurablePrincipalType = "USER" | "AGENT" | "SYSTEM";
export type DurablePermission = "READ" | "WRITE" | "EXECUTE" | "ADMIN";
export interface ExtensionGrantPort {
  hasGrant(input: {
    principalType: DurablePrincipalType;
    principalId: string;
    campaignId?: string;
    extensionId: string;
    permission: DurablePermission;
    now?: Date;
  }): Promise<boolean>;
}
export interface DelegatedAgentAccessPort {
  activeCredentialDelegates(input: {
    credentialId: string;
    delegatedUserId: string;
    campaignId: string;
    now: Date;
  }): Promise<boolean>;
}
export interface AgentAuditPort {
  append(input: {
    principalType: DurablePrincipalType;
    principalId: string;
    delegatedIdentity?: string;
    campaignId?: string;
    extensionId?: string;
    commandType: string;
    inputDigest: string;
    decision: "ALLOWED" | "DENIED" | "EXECUTED" | "FAILED";
    reasonCode?: string;
    correlationId?: string;
  }): Promise<void>;
}
export interface IdempotencyPort {
  register(input: {
    principalType: DurablePrincipalType;
    principalId: string;
    campaignId?: string;
    commandType: string;
    idempotencyKey: string;
    requestDigest: string;
    expiresAt: Date;
    now?: Date;
  }): Promise<"CREATED" | "REPLAY" | "CONFLICT" | "RECLAIMED">;
  complete(input: {
    principalType: DurablePrincipalType;
    principalId: string;
    campaignId?: string;
    commandType: string;
    idempotencyKey: string;
    resultDigest: string;
  }): Promise<void>;
}
export interface OutboxPort {
  enqueue(input: {
    topic: string;
    aggregateType: string;
    aggregateId: string;
    campaignId?: string;
    payload: unknown;
    availableAt?: Date;
  }): Promise<string>;
  claim(
    workerId: string,
    limit: number,
    leaseUntil: Date,
    now?: Date,
  ): Promise<
    Array<{
      id: string;
      topic: string;
      payload: unknown;
      claimToken: string;
      attempts: number;
    }>
  >;
  markDelivered(id: string, claimToken: string): Promise<boolean>;
  retry(
    id: string,
    claimToken: string,
    error: string,
    availableAt: Date,
    deadLetter?: boolean,
  ): Promise<boolean>;
}
