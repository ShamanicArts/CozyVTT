import { randomBytes } from "crypto";
import type { Response } from "express";
import {
  OAuthClientInformationFullSchema,
  type OAuthClientInformationFull,
  type OAuthTokenRevocationRequest,
  type OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import {
  AccessDeniedError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { AgentAccessRepository } from "../ports/AgentAccessRepository";
import type { McpOAuthRepository } from "../ports/McpOAuthRepository";
import {
  AgentPrincipalAuthenticator,
  sha256Digest,
} from "../application/agents/AgentPrincipalAuthenticator";

const AUTHORIZATION_TTL_MS = 10 * 60_000;
const ACCESS_TOKEN_TTL_MS = 12 * 60 * 60_000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;
const MCP_SCOPE = "mcp";

export interface McpAuthorizationView {
  requestId: string;
  clientName: string;
  campaigns: Array<{ id: string; name: string; role: string }>;
  expiresAt: string;
}

/** OAuth handoff backed by CozyVTT's existing login and campaign membership. */
export class McpOAuthProvider implements OAuthServerProvider {
  public readonly clientsStore: OAuthRegisteredClientsStore;
  private readonly authenticator: AgentPrincipalAuthenticator;

  public constructor(
    private readonly repository: McpOAuthRepository,
    access: AgentAccessRepository,
    private readonly resourceUrl: URL,
    private readonly approvalPageUrl: URL,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.authenticator = new AgentPrincipalAuthenticator(access, now);
    this.clientsStore = {
      getClient: async (clientId) => {
        const found = await this.repository.getClient(clientId);
        return found
          ? OAuthClientInformationFullSchema.parse(found.metadata)
          : undefined;
      },
      registerClient: async (client) => {
        const publicClient = OAuthClientInformationFullSchema.parse({
          ...client,
          client_secret: undefined,
          client_secret_expires_at: undefined,
          token_endpoint_auth_method: "none",
        });
        const saved = await this.repository.saveClient({
          clientId: publicClient.client_id,
          metadata: jsonRecord(publicClient),
        });
        return OAuthClientInformationFullSchema.parse(saved.metadata);
      },
    };
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    if (
      params.resource &&
      canonicalUrl(params.resource) !== canonicalUrl(this.resourceUrl)
    )
      throw new InvalidTargetError(
        "This authorization is for a different MCP resource",
      );
    if (params.scopes?.some((scope) => scope !== MCP_SCOPE))
      throw new InvalidScopeError("CozyVTT MCP supports only the mcp scope");
    const requestId = await this.repository.createAuthorization({
      clientId: client.client_id,
      clientState: params.state ?? null,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      resource: canonicalUrl(this.resourceUrl),
      scopes: normalizeScopes(params.scopes),
      expiresAt: new Date(this.now().getTime() + AUTHORIZATION_TTL_MS),
    });
    const approval = new URL(this.approvalPageUrl);
    approval.searchParams.set("request", requestId);
    res.redirect(302, approval.href);
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const challenge = await this.repository.challengeForCode({
      authorizationCodeHash: sha256Digest(authorizationCode),
      clientId: client.client_id,
      now: this.now(),
    });
    if (!challenge)
      throw new InvalidGrantError("Authorization code is invalid or expired");
    return challenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const accessToken = token();
    const refreshToken = token();
    const now = this.now();
    const identity = await this.repository.redeemAuthorization({
      authorizationCodeHash: sha256Digest(authorizationCode),
      clientId: client.client_id,
      redirectUri,
      resource: resource ? canonicalUrl(resource) : undefined,
      accessCredentialHash: sha256Digest(accessToken),
      refreshTokenHash: sha256Digest(refreshToken),
      accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      now,
      label: clientLabel(client),
    });
    if (!identity)
      throw new InvalidGrantError("Authorization code is invalid or expired");
    return tokens(accessToken, refreshToken, identity.scopes);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const accessToken = token();
    const nextRefreshToken = token();
    const now = this.now();
    const identity = await this.repository.rotateRefreshToken({
      refreshTokenHash: sha256Digest(refreshToken),
      clientId: client.client_id,
      resource: resource ? canonicalUrl(resource) : undefined,
      requestedScopes: scopes,
      accessCredentialHash: sha256Digest(accessToken),
      nextRefreshTokenHash: sha256Digest(nextRefreshToken),
      accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      now,
      label: clientLabel(client),
    });
    if (!identity)
      throw new InvalidGrantError("Refresh token is invalid or expired");
    return tokens(accessToken, nextRefreshToken, identity.scopes);
  }

  async verifyAccessToken(accessToken: string): Promise<AuthInfo> {
    const identity = await this.authenticator.authenticateAny(accessToken);
    if (!identity)
      throw new InvalidTokenError("Access token is invalid or expired");
    return {
      token: accessToken,
      clientId: identity.credentialId,
      scopes: [MCP_SCOPE],
      expiresAt: identity.expiresAt
        ? Math.floor(identity.expiresAt.getTime() / 1_000)
        : undefined,
      resource: this.resourceUrl,
      extra: {
        delegatedUserId: identity.delegatedUserId,
        campaignId: identity.campaignId,
      },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    await this.repository.revokeToken(sha256Digest(request.token), this.now());
  }

  async describeAuthorization(
    requestId: string,
    userId: string,
  ): Promise<McpAuthorizationView | null> {
    const request = await this.repository.getAuthorization(
      requestId,
      this.now(),
    );
    if (!request || request.approvedAt) return null;
    const client = await this.clientsStore.getClient(request.clientId);
    if (!client) return null;
    return {
      requestId,
      clientName: client.client_name?.trim() || "MCP client",
      campaigns: await this.repository.listCampaignsForUser(userId),
      expiresAt: request.expiresAt.toISOString(),
    };
  }

  async approveAuthorization(
    requestId: string,
    userId: string,
    campaignId: string,
  ): Promise<string> {
    const request = await this.repository.getAuthorization(
      requestId,
      this.now(),
    );
    if (!request)
      throw new AccessDeniedError("Authorization request is unavailable");
    const authorizationCode = token();
    const approved = await this.repository.approveAuthorization({
      id: requestId,
      delegatedUserId: userId,
      campaignId,
      authorizationCodeHash: sha256Digest(authorizationCode),
      now: this.now(),
    });
    if (!approved)
      throw new AccessDeniedError("Campaign membership is required");
    const redirect = new URL(request.redirectUri);
    redirect.searchParams.set("code", authorizationCode);
    if (request.clientState)
      redirect.searchParams.set("state", request.clientState);
    return redirect.href;
  }

  async denyAuthorization(requestId: string): Promise<string> {
    const request = await this.repository.getAuthorization(
      requestId,
      this.now(),
    );
    if (
      !request ||
      !(await this.repository.denyAuthorization(requestId, this.now()))
    )
      throw new AccessDeniedError("Authorization request is unavailable");
    const redirect = new URL(request.redirectUri);
    redirect.searchParams.set("error", "access_denied");
    redirect.searchParams.set(
      "error_description",
      "The CozyVTT user denied access",
    );
    if (request.clientState)
      redirect.searchParams.set("state", request.clientState);
    return redirect.href;
  }
}

function tokens(
  accessToken: string,
  refreshToken: string,
  scopes: string[],
): OAuthTokens {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_MS / 1_000,
    scope: scopes.join(" "),
  };
}

function token(): string {
  return randomBytes(32).toString("base64url");
}

function normalizeScopes(_scopes?: string[]): string[] {
  return [MCP_SCOPE];
}

function canonicalUrl(value: URL): string {
  const normalized = new URL(value);
  normalized.hash = "";
  return normalized.href.replace(/\/$/, "");
}

function clientLabel(client: OAuthClientInformationFull): string {
  return `${client.client_name?.trim() || "MCP client"} (connected)`;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
