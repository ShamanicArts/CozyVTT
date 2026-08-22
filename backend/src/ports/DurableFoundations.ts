export type DurablePrincipalType = "USER" | "PLUGIN" | "SYSTEM";
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
export interface DelegatedCapabilityAccessPort {
  activeCredentialDelegates(input: {
    credentialId: string;
    delegatedUserId: string;
    campaignId: string;
    now: Date;
  }): Promise<boolean>;
}
export interface CapabilityAuditPort {
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
    requestDigest: string;
    capabilityVersion: string;
    result: unknown;
    resultDigest: string;
    expiresAt: Date;
  }): Promise<void>;
  fail(input: {
    principalType: DurablePrincipalType;
    principalId: string;
    campaignId?: string;
    commandType: string;
    idempotencyKey: string;
    requestDigest: string;
    capabilityVersion: string;
    errorCode: string;
    errorMessage: string;
    expiresAt: Date;
  }): Promise<void>;
  getOutcome(input: {
    principalType: DurablePrincipalType;
    principalId: string;
    campaignId?: string;
    commandType: string;
    idempotencyKey: string;
    requestDigest?: string;
  }): Promise<
    | { status: "COMPLETED"; result: unknown }
    | { status: "FAILED"; errorCode: string; errorMessage: string }
    | { status: "CONFLICT" }
    | null
  >;
  cleanupExpired(now: Date): Promise<number>;
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
