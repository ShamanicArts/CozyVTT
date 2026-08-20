import { Router } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { prisma } from "../config/database";
import { PrismaAgentAccessRepository } from "../adapters/persistence/PrismaAgentAccessRepository";
import {
  PrismaAgentAuditPort,
  PrismaExtensionGrantPort,
  PrismaIdempotencyPort,
} from "../adapters/persistence/PrismaDurableFoundations";
import { AgentPrincipalAuthenticator } from "../application/agents/AgentPrincipalAuthenticator";
import { productionApplicationHost } from "../composition/productionApplicationHost";
import { productionQueryHost } from "../composition/productionQueryHost";
import { productionExtensionRuntime } from "../composition/productionExtensionRuntime";
import { createCozyVttMcpServer } from "../mcp/CozyVttMcpServer";

const router = Router();
const access = new PrismaAgentAccessRepository(prisma);
const authenticator = new AgentPrincipalAuthenticator(access);

router.all("/campaigns/:campaignId", async (req, res) => {
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
    ? await authenticator.authenticate(token, req.params.campaignId)
    : null;
  if (!identity) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "A valid campaign-scoped agent credential is required",
    });
  }

  const server = createCozyVttMcpServer(identity, {
    access,
    grants: new PrismaExtensionGrantPort(prisma),
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
});

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
