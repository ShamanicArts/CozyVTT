import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";
import { PrismaOAuthRepository } from "../adapters/persistence/PrismaOAuthRepository";
import { OAuthError, OAuthService, canonicalUrl, type OAuthClientMetadata } from "../application/oauth/OAuthService";
import { prisma } from "../config/database";
import { productionHttpTransportRegistry } from "./productionExtensionRuntime";

let service: OAuthService | undefined;

export function oauthIssuerUrl(): URL {
  return new URL(process.env.OAUTH_ISSUER_URL ?? "http://localhost:4000");
}

export function productionOAuthService(): OAuthService {
  if (service) return service;
  const issuer = oauthIssuerUrl();
  const frontendOrigin = (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",")[0].trim();
  service = new OAuthService(
    new PrismaOAuthRepository(prisma),
    productionHttpTransportRegistry,
    new URL("/api/plugin-transports/", issuer),
    new URL("/oauth/authorize", frontendOrigin),
  );
  productionHttpTransportRegistry.setAuthorizationService(service);
  return service;
}

export function productionOAuthRouter(): Router {
  const router = Router();
  const oauth = productionOAuthService();
  const issuer = oauthIssuerUrl();

  router.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
      issuer: canonicalUrl(issuer),
      authorization_endpoint: new URL("/authorize", issuer).href,
      token_endpoint: new URL("/token", issuer).href,
      registration_endpoint: new URL("/register", issuer).href,
      revocation_endpoint: new URL("/revoke", issuer).href,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: [...new Set(oauth.listResources().flatMap((resource) => resource.scopes))],
    });
  });

  router.get(/^\/\.well-known\/oauth-protected-resource(?:\/(.*))?$/, (req, res) => {
    const suffix = (req.params as Record<string, string | undefined>)[0];
    const requested = suffix ? canonicalUrl(new URL(`/${suffix}`, issuer)) : stringValue(req.query.resource);
    const resource = requested ? oauth.findResource(requested) : null;
    if (!resource) return res.status(404).json({ error: "invalid_target" });
    return res.json({
      resource: resource.resource,
      authorization_servers: [canonicalUrl(issuer)],
      scopes_supported: resource.scopes,
      bearer_methods_supported: ["header"],
    });
  });

  router.post("/register", async (req, res) => {
    try {
      const metadata = registration(req.body);
      return res.status(201).json(await oauth.registerClient(metadata));
    } catch (error) {
      return oauthError(res, error, 400);
    }
  });

  router.get("/authorize", async (req, res) => {
    try {
      if (stringValue(req.query.response_type) !== "code") throw new OAuthError("unsupported_response_type", "Only the code response type is supported");
      if (stringValue(req.query.code_challenge_method) !== "S256") throw new OAuthError("invalid_request", "PKCE S256 is required");
      if (!/^[A-Za-z0-9_-]{43}$/.test(requiredQuery(req, "code_challenge"))) throw new OAuthError("invalid_request", "PKCE code_challenge is invalid");
      const clientId = requiredQuery(req, "client_id");
      const client = await oauth.getClient(clientId);
      if (!client) throw new OAuthError("invalid_request", "Unknown client_id");
      const redirect = await oauth.beginAuthorization({
        client,
        redirectUri: requiredQuery(req, "redirect_uri"),
        codeChallenge: requiredQuery(req, "code_challenge"),
        state: stringValue(req.query.state),
        resource: requiredQuery(req, "resource"),
        scopes: scopeValues(stringValue(req.query.scope)),
      });
      return res.redirect(302, redirect);
    } catch (error) {
      return oauthError(res, error, 400);
    }
  });

  router.post("/token", async (req, res) => {
    try {
      const client = await publicClient(oauth, req.body?.client_id);
      const grantType = req.body?.grant_type;
      if (grantType === "authorization_code") {
        return res.json(await oauth.exchangeAuthorizationCode({
          client,
          code: requiredBody(req, "code"),
          codeVerifier: requiredBody(req, "code_verifier"),
          redirectUri: requiredBody(req, "redirect_uri"),
          resource: requiredBody(req, "resource"),
        }));
      }
      if (grantType === "refresh_token") {
        return res.json(await oauth.exchangeRefreshToken({
          client,
          refreshToken: requiredBody(req, "refresh_token"),
          resource: requiredBody(req, "resource"),
          scopes: req.body?.scope === undefined ? undefined : scopeValues(req.body.scope),
        }));
      }
      throw new OAuthError("unsupported_grant_type", "Unsupported grant_type");
    } catch (error) {
      return oauthError(res, error, 400);
    }
  });

  router.post("/revoke", async (req, res) => {
    try {
      await publicClient(oauth, req.body?.client_id);
      await oauth.revoke(requiredBody(req, "token"));
      return res.status(200).send();
    } catch (error) {
      return oauthError(res, error, 400);
    }
  });

  return router;
}

function registration(value: unknown): OAuthClientMetadata {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((uri): uri is string => typeof uri === "string") : [];
  if (redirectUris.length === 0 || redirectUris.some((uri) => !validRedirectUri(uri))) {
    throw new OAuthError("invalid_redirect_uri", "At least one secure redirect URI is required");
  }
  if (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== "none") {
    throw new OAuthError("invalid_client_metadata", "Only public clients are supported");
  }
  const grants = body.grant_types === undefined ? ["authorization_code"] : body.grant_types;
  if (!Array.isArray(grants) || grants.some((grant) => grant !== "authorization_code" && grant !== "refresh_token")) {
    throw new OAuthError("invalid_client_metadata", "Unsupported grant type");
  }
  const responses = body.response_types === undefined ? ["code"] : body.response_types;
  if (!Array.isArray(responses) || responses.length !== 1 || responses[0] !== "code") {
    throw new OAuthError("invalid_client_metadata", "Only code responses are supported");
  }
  return {
    client_id: randomUUID(),
    redirect_uris: redirectUris,
    client_name: typeof body.client_name === "string" ? body.client_name : undefined,
    token_endpoint_auth_method: "none",
    grant_types: grants as OAuthClientMetadata["grant_types"],
    response_types: ["code"],
  };
}

function validRedirectUri(value: string): boolean {
  try {
    const uri = new URL(value);
    return uri.protocol === "https:" || (uri.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(uri.hostname));
  } catch {
    return false;
  }
}

async function publicClient(oauth: OAuthService, value: unknown): Promise<OAuthClientMetadata> {
  if (typeof value !== "string") throw new OAuthError("invalid_client", "client_id is required");
  const client = await oauth.getClient(value);
  if (!client) throw new OAuthError("invalid_client", "Unknown client_id");
  return client;
}

function requiredQuery(req: Request, name: string): string {
  const value = stringValue(req.query[name]);
  if (!value) throw new OAuthError("invalid_request", `${name} is required`);
  return value;
}

function requiredBody(req: Request, name: string): string {
  const value = req.body?.[name];
  if (typeof value !== "string" || !value) throw new OAuthError("invalid_request", `${name} is required`);
  return value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function scopeValues(value: unknown): string[] {
  return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
}

function oauthError(res: Response, error: unknown, status: number) {
  const known = error instanceof OAuthError ? error : new OAuthError("server_error", "OAuth request failed");
  return res.status(known.code === "server_error" ? 500 : status).json({ error: known.code, error_description: known.message });
}
