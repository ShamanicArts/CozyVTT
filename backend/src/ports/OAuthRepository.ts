export interface OAuthClientRecord {
  clientId: string;
  metadata: Record<string, unknown>;
}

export interface OAuthAuthorizationRecord {
  id: string;
  clientId: string;
  clientState: string | null;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  pluginId: string;
  resourceId: string;
  scopes: string[];
  delegatedUserId: string | null;
  campaignId: string | null;
  expiresAt: Date;
  approvedAt: Date | null;
  consumedAt: Date | null;
}

export interface OAuthTokenIdentity {
  credentialId: string;
  delegatedUserId: string;
  campaignId: string;
  resource: string;
  pluginId: string;
  resourceId: string;
  scopes: string[];
  expiresAt: Date | null;
}

export interface OAuthRepository {
  getClient(clientId: string): Promise<OAuthClientRecord | null>;
  saveClient(client: OAuthClientRecord): Promise<OAuthClientRecord>;
  createAuthorization(input: {
    clientId: string;
    clientState: string | null;
    redirectUri: string;
    codeChallenge: string;
    resource: string;
    pluginId: string;
    resourceId: string;
    scopes: string[];
    expiresAt: Date;
  }): Promise<string>;
  getAuthorization(id: string, now: Date): Promise<OAuthAuthorizationRecord | null>;
  approveAuthorization(input: {
    id: string;
    delegatedUserId: string;
    campaignId: string;
    authorizationCodeHash: string;
    now: Date;
  }): Promise<boolean>;
  denyAuthorization(id: string, now: Date): Promise<boolean>;
  redeemAuthorization(input: {
    authorizationCodeHash: string;
    clientId: string;
    codeChallenge: string;
    redirectUri: string;
    resource: string;
    accessCredentialHash: string;
    refreshTokenHash: string;
    accessExpiresAt: Date;
    refreshExpiresAt: Date;
    now: Date;
    label: string;
  }): Promise<OAuthTokenIdentity | null>;
  rotateRefreshToken(input: {
    refreshTokenHash: string;
    clientId: string;
    resource: string;
    requestedScopes?: string[];
    accessCredentialHash: string;
    nextRefreshTokenHash: string;
    accessExpiresAt: Date;
    refreshExpiresAt: Date;
    now: Date;
    label: string;
  }): Promise<OAuthTokenIdentity | null>;
  verifyAccessToken(tokenHash: string, now: Date): Promise<OAuthTokenIdentity | null>;
  revokeToken(tokenHash: string, now: Date): Promise<void>;
  listCampaignsForUser(userId: string): Promise<Array<{ id: string; name: string; role: string }>>;
}
