import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { PrismaAgentAccessRepository } from "../adapters/persistence/PrismaAgentAccessRepository";
import { PrismaMcpOAuthRepository } from "../adapters/persistence/PrismaMcpOAuthRepository";
import { prisma } from "../config/database";
import { McpOAuthProvider } from "../mcp/McpOAuthProvider";

let provider: McpOAuthProvider | undefined;

export function mcpPublicUrl(): URL {
  return new URL(
    process.env.MCP_PUBLIC_URL ??
      `http://localhost:${process.env.PORT ?? "4000"}/api/mcp`,
  );
}

export function productionMcpOAuthProvider(): McpOAuthProvider {
  if (provider) return provider;
  const frontendOrigin = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")[0]
    .trim();
  provider = new McpOAuthProvider(
    new PrismaMcpOAuthRepository(prisma),
    new PrismaAgentAccessRepository(prisma),
    mcpPublicUrl(),
    new URL("/mcp/authorize", frontendOrigin),
  );
  return provider;
}

export function productionMcpOAuthRouter() {
  const resource = mcpPublicUrl();
  const issuer = new URL(resource.origin);
  return mcpAuthRouter({
    provider: productionMcpOAuthProvider(),
    issuerUrl: issuer,
    baseUrl: issuer,
    resourceServerUrl: resource,
    scopesSupported: ["mcp"],
    resourceName: "CozyVTT",
    serviceDocumentationUrl: new URL("/docs/MCP_AGENT_ACCESS.md", issuer),
  });
}
