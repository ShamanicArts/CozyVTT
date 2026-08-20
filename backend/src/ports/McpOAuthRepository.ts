export interface McpOAuthClientRecord {
  clientId: string;
  metadata: Record<string, unknown>;
}

export interface McpOAuthAuthorizationRecord {
  id: string;
  clientId: string;
  clientState: string | null;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  scopes: string[];
  delegatedUserId: string | null;
  campaignId: string | null;
  expiresAt: Date;
  approvedAt: Date | null;
  consumedAt: Date | null;
}

export interface McpOAuthTokenIdentity {
  credentialId: string;
  delegatedUserId: string;
  campaignId: string;
  resource: string;
  scopes: string[];
}

export interface McpOAuthRepository {
  getClient(clientId: string): Promise<McpOAuthClientRecord | null>;
  saveClient(client: McpOAuthClientRecord): Promise<McpOAuthClientRecord>;
  createAuthorization(input: {
    clientId: string;
    clientState: string | null;
    redirectUri: string;
    codeChallenge: string;
    resource: string;
    scopes: string[];
    expiresAt: Date;
  }): Promise<string>;
  getAuthorization(
    id: string,
    now: Date,
  ): Promise<McpOAuthAuthorizationRecord | null>;
  approveAuthorization(input: {
    id: string;
    delegatedUserId: string;
    campaignId: string;
    authorizationCodeHash: string;
    now: Date;
  }): Promise<boolean>;
  denyAuthorization(id: string, now: Date): Promise<boolean>;
  challengeForCode(input: {
    authorizationCodeHash: string;
    clientId: string;
    now: Date;
  }): Promise<string | null>;
  redeemAuthorization(input: {
    authorizationCodeHash: string;
    clientId: string;
    redirectUri?: string;
    resource?: string;
    accessCredentialHash: string;
    refreshTokenHash: string;
    accessExpiresAt: Date;
    refreshExpiresAt: Date;
    now: Date;
    label: string;
  }): Promise<McpOAuthTokenIdentity | null>;
  rotateRefreshToken(input: {
    refreshTokenHash: string;
    clientId: string;
    resource?: string;
    requestedScopes?: string[];
    accessCredentialHash: string;
    nextRefreshTokenHash: string;
    accessExpiresAt: Date;
    refreshExpiresAt: Date;
    now: Date;
    label: string;
  }): Promise<McpOAuthTokenIdentity | null>;
  revokeToken(tokenHash: string, now: Date): Promise<void>;
  listCampaignsForUser(
    userId: string,
  ): Promise<Array<{ id: string; name: string; role: string }>>;
}
