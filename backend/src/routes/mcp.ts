import { Request, Response, Router } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { prisma } from "../config/database";
import { PrismaAgentAccessRepository } from "../adapters/persistence/PrismaAgentAccessRepository";
import {
  PrismaAgentAuditPort,
  PrismaIdempotencyPort,
} from "../adapters/persistence/PrismaDurableFoundations";
import { AgentPrincipalAuthenticator } from "../application/agents/AgentPrincipalAuthenticator";
import { productionApplicationHost } from "../composition/productionApplicationHost";
import { productionQueryHost } from "../composition/productionQueryHost";
import { productionExtensionRuntime } from "../composition/productionExtensionRuntime";
import { createCozyVttMcpServer } from "../mcp/CozyVttMcpServer";
import { requireAuth } from "../middleware/auth";
import {
  mcpPublicUrl,
  productionMcpOAuthProvider,
} from "../composition/productionMcpOAuth";

const router = Router();
const access = new PrismaAgentAccessRepository(prisma);
const authenticator = new AgentPrincipalAuthenticator(access);

router.get("/oauth/requests/:requestId", requireAuth, async (req, res) => {
  const view = await productionMcpOAuthProvider().describeAuthorization(
    req.params.requestId,
    req.session.userId!,
  );
  return view
    ? res.json(view)
    : res.status(404).json({
        error: "Not Found",
        message: "This MCP connection request is unavailable or expired",
      });
});

router.post(
  "/oauth/requests/:requestId/approve",
  requireAuth,
  async (req, res) => {
    const campaignId =
      typeof req.body?.campaignId === "string" ? req.body.campaignId : "";
    if (!campaignId)
      return res.status(400).json({
        error: "Validation Error",
        message: "Choose a campaign for this MCP connection",
      });
    try {
      return res.json({
        redirectUrl: await productionMcpOAuthProvider().approveAuthorization(
          req.params.requestId,
          req.session.userId!,
          campaignId,
        ),
      });
    } catch {
      return res.status(404).json({
        error: "Not Found",
        message: "This MCP connection request is unavailable or expired",
      });
    }
  },
);

router.post(
  "/oauth/requests/:requestId/deny",
  requireAuth,
  async (req, res) => {
    try {
      return res.json({
        redirectUrl: await productionMcpOAuthProvider().denyAuthorization(
          req.params.requestId,
        ),
      });
    } catch {
      return res.status(404).json({
        error: "Not Found",
        message: "This MCP connection request is unavailable or expired",
      });
    }
  },
);

router.all("/", async (req, res) => handleMcp(req, res));
router.all("/campaigns/:campaignId", async (req, res) => handleMcp(req, res));

async function handleMcp(
  req: Request,
  res: Response,
): Promise<Response | undefined> {
  if (
    !requestOriginAllowed(req.headers.origin) ||
    !requestHostAllowed(req.headers.host)
  ) {
    return res
      .status(403)
      .json({ error: "Forbidden", message: "MCP origin is not allowed" });
  }
  const authorization = req.headers.authorization;
  const token =
    typeof authorization === "string" && authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;
  const identity = token
    ? req.params.campaignId
      ? await authenticator.authenticate(token, req.params.campaignId)
      : await authenticator.authenticateAny(token)
    : null;
  if (!identity) {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="${protectedResourceMetadataUrl()}", scope="mcp"`,
    );
    return res.status(401).json({
      error: "invalid_token",
      error_description: "Connect this MCP client through CozyVTT",
    });
  }

  const server = createCozyVttMcpServer(identity, {
    access,
    audit: new PrismaAgentAuditPort(prisma),
    idempotency: new PrismaIdempotencyPort(prisma),
    applicationHost: productionApplicationHost,
    queryHost: productionQueryHost,
    extensionRuntime: productionExtensionRuntime,
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) {
      return res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal MCP error" },
        id: null,
      });
    }
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
  return undefined;
}

function protectedResourceMetadataUrl(): string {
  const resource = mcpPublicUrl();
  return new URL(
    `/.well-known/oauth-protected-resource${resource.pathname}`,
    resource,
  ).href;
}

function requestOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  const configured = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.includes(origin);
}

function requestHostAllowed(host: string | undefined): boolean {
  const configured = (process.env.MCP_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return (
    configured.length === 0 ||
    (host !== undefined && configured.includes(host.toLowerCase()))
  );
}

export default router;
