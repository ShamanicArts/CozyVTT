import { createHash, randomBytes } from "crypto";
import type { OAuthResourceDescriptor } from "../../extensions/contracts";
import type {
  HttpTransportAuthorizationService,
  TrustedHttpTransportRegistry,
} from "../../ports/OAuthHttpTransport";
import type { OAuthRepository, OAuthTokenIdentity } from "../../ports/OAuthRepository";

const AUTHORIZATION_TTL_MS = 10 * 60_000;
const ACCESS_TOKEN_TTL_MS = 12 * 60 * 60_000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;

export interface OAuthClientMetadata {
  client_id: string;
  redirect_uris: string[];
  client_name?: string;
  token_endpoint_auth_method: "none";
  grant_types: ("authorization_code" | "refresh_token")[];
  response_types: ["code"];
}

export interface OAuthConsentRequest {
  requestId: string;
  clientName: string;
  resource: { pluginId: string; resourceId: string; scopes: string[] };
  campaigns: Array<{ id: string; name: string; role: string }>;
  expiresAt: string;
}

export interface OAuthResourceRegistration {
  pluginId: string;
  resourceId: string;
  resource: string;
  scopes: string[];
}

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
}

export class OAuthError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export class OAuthService implements HttpTransportAuthorizationService {
  public constructor(
    private readonly repository: OAuthRepository,
    private readonly registry: TrustedHttpTransportRegistry,
    private readonly transportBaseUrl: URL,
    private readonly approvalPageUrl: URL,
    private readonly now: () => Date = () => new Date(),
  ) {}

  listResources(): OAuthResourceRegistration[] {
    return this.registry.listOAuthResources().map(({ extensionId, descriptor }) => ({
      pluginId: extensionId,
      resourceId: descriptor.id,
      resource: this.resourceUrl(extensionId, descriptor),
      scopes: [...descriptor.scopes],
    }));
  }

  findResource(resource: string): OAuthResourceRegistration | null {
    const canonical = canonicalUrl(resource);
    return this.listResources().find((candidate) => candidate.resource === canonical) ?? null;
  }

  async getClient(clientId: string): Promise<OAuthClientMetadata | null> {
    const found = await this.repository.getClient(clientId);
    return found ? (found.metadata as unknown as OAuthClientMetadata) : null;
  }

  async registerClient(metadata: OAuthClientMetadata): Promise<OAuthClientMetadata> {
    const saved = await this.repository.saveClient({
      clientId: metadata.client_id,
      metadata: JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>,
    });
    return saved.metadata as unknown as OAuthClientMetadata;
  }

  async beginAuthorization(input: {
    client: OAuthClientMetadata;
    redirectUri: string;
    codeChallenge: string;
    state?: string;
    resource: string;
    scopes: string[];
  }): Promise<string> {
    if (!input.client.redirect_uris.includes(input.redirectUri)) {
      throw new OAuthError("invalid_request", "redirect_uri is not registered");
    }
    const resource = this.findResource(input.resource);
    if (!resource) throw new OAuthError("invalid_target", "OAuth resource is not active");
    const scopes = unique(input.scopes);
    if (scopes.some((scope) => !resource.scopes.includes(scope))) {
      throw new OAuthError("invalid_scope", "Requested scope is not supported by this resource");
    }
    const requestId = await this.repository.createAuthorization({
      clientId: input.client.client_id,
      clientState: input.state ?? null,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      resource: resource.resource,
      pluginId: resource.pluginId,
      resourceId: resource.resourceId,
      scopes,
      expiresAt: new Date(this.now().getTime() + AUTHORIZATION_TTL_MS),
    });
    const approval = new URL(this.approvalPageUrl);
    approval.searchParams.set("request", requestId);
    return approval.href;
  }

  async exchangeAuthorizationCode(input: {
    client: OAuthClientMetadata;
    code: string;
    codeVerifier: string;
    redirectUri: string;
    resource: string;
  }): Promise<OAuthTokens> {
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier)) {
      throw new OAuthError("invalid_grant", "PKCE code_verifier is invalid");
    }
    if (!this.findResource(input.resource)) {
      throw new OAuthError("invalid_target", "OAuth resource is not active");
    }
    const accessToken = token();
    const refreshToken = token();
    const now = this.now();
    const identity = await this.repository.redeemAuthorization({
      authorizationCodeHash: sha256Digest(input.code),
      clientId: input.client.client_id,
      codeChallenge: createHash("sha256").update(input.codeVerifier).digest("base64url"),
      redirectUri: input.redirectUri,
      resource: canonicalUrl(input.resource),
      accessCredentialHash: sha256Digest(accessToken),
      refreshTokenHash: sha256Digest(refreshToken),
      accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      now,
      label: clientLabel(input.client),
    });
    if (!identity) throw new OAuthError("invalid_grant", "Authorization code is invalid or expired");
    return tokens(accessToken, refreshToken, identity.scopes);
  }

  async exchangeRefreshToken(input: {
    client: OAuthClientMetadata;
    refreshToken: string;
    resource: string;
    scopes?: string[];
  }): Promise<OAuthTokens> {
    if (!this.findResource(input.resource)) {
      throw new OAuthError("invalid_target", "OAuth resource is not active");
    }
    const accessToken = token();
    const refreshToken = token();
    const now = this.now();
    const identity = await this.repository.rotateRefreshToken({
      refreshTokenHash: sha256Digest(input.refreshToken),
      clientId: input.client.client_id,
      resource: canonicalUrl(input.resource),
      requestedScopes: input.scopes ? unique(input.scopes) : undefined,
      accessCredentialHash: sha256Digest(accessToken),
      nextRefreshTokenHash: sha256Digest(refreshToken),
      accessExpiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      now,
      label: clientLabel(input.client),
    });
    if (!identity) throw new OAuthError("invalid_grant", "Refresh token is invalid or expired");
    return tokens(accessToken, refreshToken, identity.scopes);
  }

  async revoke(tokenValue: string): Promise<void> {
    await this.repository.revokeToken(sha256Digest(tokenValue), this.now());
  }

  async authorize(input: {
    request: Request;
    extensionId: string;
    resource: OAuthResourceDescriptor;
    requiredScopes: readonly string[];
  }) {
    const bearer = input.request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) return null;
    const identity = await this.repository.verifyAccessToken(sha256Digest(bearer), this.now());
    const expectedResource = this.resourceUrl(input.extensionId, input.resource);
    if (
      !identity ||
      identity.pluginId !== input.extensionId ||
      identity.resourceId !== input.resource.id ||
      identity.resource !== expectedResource ||
      input.requiredScopes.some((scope) => !identity.scopes.includes(scope))
    ) return null;
    return authorizationContext(identity);
  }

  challenge(input: {
    extensionId: string;
    resource: OAuthResourceDescriptor;
    requiredScopes: readonly string[];
  }): string {
    const resource = new URL(this.resourceUrl(input.extensionId, input.resource));
    const metadata = new URL(
      `/.well-known/oauth-protected-resource${resource.pathname}`,
      resource,
    );
    const scope = input.requiredScopes.join(" ");
    return `Bearer resource_metadata="${metadata.href}"${scope ? `, scope="${scope}"` : ""}`;
  }

  async describeAuthorization(requestId: string, userId: string): Promise<OAuthConsentRequest | null> {
    const request = await this.repository.getAuthorization(requestId, this.now());
    if (!request || request.approvedAt || !this.findResource(request.resource)) return null;
    const client = await this.getClient(request.clientId);
    if (!client) return null;
    return {
      requestId,
      clientName: client.client_name?.trim() || "OAuth client",
      resource: { pluginId: request.pluginId, resourceId: request.resourceId, scopes: request.scopes },
      campaigns: await this.repository.listCampaignsForUser(userId),
      expiresAt: request.expiresAt.toISOString(),
    };
  }

  async approveAuthorization(requestId: string, userId: string, campaignId: string): Promise<string> {
    const request = await this.repository.getAuthorization(requestId, this.now());
    if (!request || !this.findResource(request.resource)) throw new OAuthError("access_denied", "Authorization request is unavailable");
    const authorizationCode = token();
    if (!(await this.repository.approveAuthorization({
      id: requestId,
      delegatedUserId: userId,
      campaignId,
      authorizationCodeHash: sha256Digest(authorizationCode),
      now: this.now(),
    }))) throw new OAuthError("access_denied", "Campaign membership is required");
    return authorizationRedirect(request.redirectUri, request.clientState, { code: authorizationCode });
  }

  async denyAuthorization(requestId: string): Promise<string> {
    const request = await this.repository.getAuthorization(requestId, this.now());
    if (!request || !(await this.repository.denyAuthorization(requestId, this.now()))) {
      throw new OAuthError("access_denied", "Authorization request is unavailable");
    }
    return authorizationRedirect(request.redirectUri, request.clientState, {
      error: "access_denied",
      error_description: "The user denied access",
    });
  }

  private resourceUrl(pluginId: string, resource: OAuthResourceDescriptor): string {
    const base = this.transportBaseUrl.href.replace(/\/$/, "");
    return canonicalUrl(`${base}/${encodeURIComponent(pluginId)}${resource.path}`);
  }
}

function authorizationContext(identity: OAuthTokenIdentity) {
  return {
    credentialId: identity.credentialId,
    delegatedUserId: identity.delegatedUserId,
    campaignId: identity.campaignId,
    resourceId: identity.resourceId,
    scopes: identity.scopes,
  };
}

function authorizationRedirect(uri: string, state: string | null, values: Record<string, string>): string {
  const redirect = new URL(uri);
  for (const [name, value] of Object.entries(values)) redirect.searchParams.set(name, value);
  if (state) redirect.searchParams.set("state", state);
  return redirect.href;
}

function tokens(accessToken: string, refreshToken: string, scopes: string[]): OAuthTokens {
  return { access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_MS / 1_000, scope: scopes.join(" ") };
}

function token(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Digest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function canonicalUrl(value: string | URL): string {
  const normalized = new URL(value);
  normalized.hash = "";
  return normalized.href.replace(/\/$/, "");
}

function clientLabel(client: OAuthClientMetadata): string {
  return `${client.client_name?.trim() || "OAuth client"} (connected)`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
