import { Request, Response, Router } from "express";
import {
  CORE_AGENT_COMMANDS,
  CORE_AGENT_EXTENSION_ID,
  findCoreAgentCommand,
  type CoreAgentCommand,
} from "../application/agents/CoreAgentCatalog";
import {
  AgentPrincipalAuthenticator,
  sha256Digest,
  type AgentIdentity,
} from "../application/agents/AgentPrincipalAuthenticator";
import { productionApplicationHost } from "../composition/productionApplicationHost";
import {
  digestCanonical,
  HostCommandError,
  IdempotencyReplayError,
} from "../composition/ApplicationHost";
import {
  PrismaAgentAuditPort,
  PrismaIdempotencyPort,
} from "../adapters/persistence/PrismaDurableFoundations";
import { PrismaAgentAccessRepository } from "../adapters/persistence/PrismaAgentAccessRepository";
import {
  AgentCredentialError,
  AgentCredentialService,
} from "../application/agents/AgentCredentialService";
import { prisma } from "../config/database";
import { requireAuth } from "../middleware/auth";
import {
  validateJsonSchema,
  JsonSchemaValidationError,
} from "../extensions/bridge/JsonSchemaValidator";
import type { JsonSchema } from "../extensions/contracts";
import { productionExtensionRuntime } from "../composition/productionExtensionRuntime";
import { productionQueryHost } from "../composition/productionQueryHost";
import { mcpPublicUrl } from "../composition/productionMcpOAuth";

const router = Router();
const CONFIRMATION_TTL_MS = 5 * 60_000;
const agentAudit = new PrismaAgentAuditPort(prisma);
const idempotency = new PrismaIdempotencyPort(prisma);
const access = new PrismaAgentAccessRepository(prisma);
const credentials = new AgentCredentialService(access, sha256Digest);
const principalAuthenticator = new AgentPrincipalAuthenticator(access);

router.get("/mcp-setup", requireAuth, (_req, res) =>
  res.json({ url: mcpPublicUrl().href }),
);

router.post("/credentials", requireAuth, async (req, res) => {
  const campaignId =
    typeof req.body?.campaignId === "string" ? req.body.campaignId : null;
  const label =
    typeof req.body?.label === "string" ? req.body.label.trim() : "";
  const expiresAt = parseExpiresAt(req.body?.expiresAt);
  if (!campaignId || !label || label.length > 120 || expiresAt === undefined)
    return res.status(400).json({
      error: "Validation Error",
      message: "campaignId, label, and optional future expiresAt are required",
    });
  try {
    const issued = await credentials.issue({
      userId: req.session.userId!,
      campaignId,
      label,
      expiresAt,
    });
    return res
      .status(201)
      .json({ credential: issued.credential, token: issued.token });
  } catch (error) {
    if (error instanceof AgentCredentialError)
      return res
        .status(404)
        .json({ error: "Not Found", message: "Campaign not found" });
    return res.status(500).json({
      error: "Internal Server Error",
      message: "Credential issuance failed",
    });
  }
});
router.get("/credentials", requireAuth, async (req, res) =>
  res.json({ credentials: await credentials.list(req.session.userId!) }),
);
router.delete("/credentials/:credentialId", requireAuth, async (req, res) =>
  (await credentials.revoke(req.params.credentialId, req.session.userId!))
    ? res.status(204).send()
    : res
        .status(404)
        .json({ error: "Not Found", message: "Credential not found" }),
);
router.get("/confirmations/pending", requireAuth, async (req, res) =>
  res.json({
    confirmations: await access.listPendingConfirmations(
      req.session.userId!,
      new Date(),
    ),
  }),
);
router.post(
  "/confirmations/:confirmationId/deny",
  requireAuth,
  async (req, res) =>
    (await access.denyConfirmation({
      confirmationId: req.params.confirmationId,
      delegatedUserId: req.session.userId!,
      now: new Date(),
    }))
      ? res.status(204).send()
      : res.status(404).json({
          error: "Not Found",
          message: "Pending confirmation not found",
        }),
);

router.get("/campaigns/:campaignId/catalog", async (req, res) => {
  const identity = await agentIdentity(req, res);
  if (!identity) return;
  let sandboxTools: unknown[] = [];
  try {
    sandboxTools = await productionExtensionRuntime().bridge.listCatalog({
      principal: { id: identity.credentialId, kind: "agent" },
      scope: { campaignId: identity.campaignId },
    });
  } catch {
    sandboxTools = [];
  }
  return res.json({
    commands: [
      ...CORE_AGENT_COMMANDS.map((command) => ({
        id: command.id,
        extensionId: CORE_AGENT_EXTENSION_ID,
        title: command.title,
        description: command.description,
        inputSchema: command.inputSchema,
        risk: command.risk,
        confirmationRequired: command.requiresConfirmation,
        idempotencyRequired: command.write,
        operatingRoles: command.operatingRoles,
      })),
      ...sandboxTools,
    ],
    queries: productionQueryHost.list().map((query) => ({
      ...query,
      extensionId: CORE_AGENT_EXTENSION_ID,
      title: queryTitle(query.id),
      confirmationRequired: false,
      idempotencyRequired: false,
    })),
  });
});

router.post("/campaigns/:campaignId/queries/:queryId", async (req, res) => {
  const identity = await agentIdentity(req, res);
  if (!identity) return;
  const metadata = productionQueryHost
    .list()
    .find((query) => query.id === req.params.queryId);
  if (!metadata)
    return res
      .status(404)
      .json({ error: "Not Found", message: "Agent query is not available" });
  const input = req.body?.input ?? {};
  if (!isPlainObject(input))
    return res.status(400).json({
      error: "Validation Error",
      message: "input must be a JSON object",
    });
  try {
    validateJsonSchema(metadata.inputSchema as JsonSchema, input);
    const result = await productionQueryHost.dispatch(metadata.id, input, {
      principalId: identity.delegatedUserId,
      campaignId: identity.campaignId,
    });
    validateJsonSchema(metadata.outputSchema as JsonSchema, result);
    await agentAudit.append({
      principalType: "AGENT",
      principalId: identity.credentialId,
      delegatedIdentity: identity.delegatedUserId,
      campaignId: identity.campaignId,
      extensionId: CORE_AGENT_EXTENSION_ID,
      commandType: metadata.id,
      inputDigest: digestCanonical(input),
      decision: "EXECUTED",
    });
    return res.json({ queryId: metadata.id, result });
  } catch (error) {
    if (error instanceof JsonSchemaValidationError)
      return res.status(400).json({
        error: "Validation Error",
        message: "Agent query payload is invalid",
      });
    await agentAudit.append({
      principalType: "AGENT",
      principalId: identity.credentialId,
      delegatedIdentity: identity.delegatedUserId,
      campaignId: identity.campaignId,
      extensionId: CORE_AGENT_EXTENSION_ID,
      commandType: metadata.id,
      inputDigest: digestCanonical(input),
      decision: "FAILED",
      reasonCode: error instanceof Error ? error.name : "UNKNOWN",
    });
    return res.status(500).json({
      error: "Query Failed",
      message: "The agent query could not be completed",
    });
  }
});

// An agent may request review, but cannot approve its own request.
router.post("/campaigns/:campaignId/confirmations", async (req, res) => {
  const identity = await agentIdentity(req, res);
  if (!identity) return;
  const dynamicTool = findDynamicTool(req.body?.toolId);
  if (dynamicTool) {
    const input = scopedInput(req.body?.input, identity.campaignId, res);
    if (!input || !validateInput(dynamicTool.command.inputSchema, input, res))
      return;
    const pending = await access.createConfirmation({
      credentialId: identity.credentialId,
      delegatedUserId: identity.delegatedUserId,
      campaignId: identity.campaignId,
      extensionId: dynamicTool.extensionId,
      commandId: dynamicTool.command.id,
      inputDigest: digestCanonical(input),
      expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS),
    });
    return res.status(202).json({
      confirmationId: pending.id,
      expiresAt: pending.expiresAt.toISOString(),
    });
  }
  const command = findCommand(req.body?.commandId);
  if (!command || !command.requiresConfirmation)
    return res.status(404).json({
      error: "Not Found",
      message: "Agent command is not available",
    });
  const input = scopedInput(req.body?.input, identity.campaignId, res);
  if (!input || !validateInput(command.inputSchema, input, res)) return;
  const pending = await access.createConfirmation({
    credentialId: identity.credentialId,
    delegatedUserId: identity.delegatedUserId,
    campaignId: identity.campaignId,
    extensionId: CORE_AGENT_EXTENSION_ID,
    commandId: command.id,
    inputDigest: digestCanonical(input),
    expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS),
  });
  return res.status(202).json({
    confirmationId: pending.id,
    expiresAt: pending.expiresAt.toISOString(),
  });
});

router.post("/campaigns/:campaignId/tools/:toolId", async (req, res) => {
  const identity = await agentIdentity(req, res);
  if (!identity) return;
  const dynamicTool = findDynamicTool(req.params.toolId);
  if (!dynamicTool)
    return res.status(404).json({
      error: "Not Found",
      message: "Agent tool is not available",
    });
  const input = scopedInput(req.body?.input, identity.campaignId, res);
  if (!input || !validateInput(dynamicTool.command.inputSchema, input, res))
    return;
  const idempotencyKey = readHeader(req, "idempotency-key");
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 200
  )
    return res.status(400).json({
      error: "Validation Error",
      message: "A valid Idempotency-Key header is required",
    });
  const confirmationId = readHeader(req, "x-agent-confirmation");
  if (
    !confirmationId ||
    !(await access.consumeApprovedConfirmationById({
      confirmationId,
      credentialId: identity.credentialId,
      delegatedUserId: identity.delegatedUserId,
      campaignId: identity.campaignId,
      extensionId: dynamicTool.extensionId,
      commandId: dynamicTool.command.id,
      inputDigest: digestCanonical(input),
      now: new Date(),
    }))
  )
    return res.status(409).json({
      error: "Confirmation Required",
      message: "An approved confirmation ID is required",
    });
  const idempotencyState = await idempotency.register({
    principalType: "AGENT",
    principalId: identity.credentialId,
    campaignId: identity.campaignId,
    commandType: dynamicTool.command.id,
    idempotencyKey,
    requestDigest: digestCanonical(input),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  if (idempotencyState === "CONFLICT")
    return res.status(409).json({
      error: "Idempotency Conflict",
      message: "This idempotency key belongs to a different request",
    });
  if (idempotencyState === "REPLAY")
    return res.status(409).json({
      error: "Idempotency Replay",
      message: "This command was already processed or is in progress",
    });
  try {
    const result = await productionExtensionRuntime().bridge.invoke({
      toolId: dynamicTool.tool.id,
      input,
      principal: { id: identity.credentialId, kind: "agent" },
      scope: { campaignId: identity.campaignId },
      confirmation: {
        confirmed: true,
        approvedByPrincipalId: identity.credentialId,
      },
    });
    await idempotency.complete({
      principalType: "AGENT",
      principalId: identity.credentialId,
      campaignId: identity.campaignId,
      commandType: dynamicTool.command.id,
      idempotencyKey,
      resultDigest: digestCanonical(result),
    });
    return res.json(result);
  } catch {
    return res.status(500).json({
      error: "Command Failed",
      message: "The sandbox tool could not be completed",
    });
  }
});

// Only the human user named by the credential delegation can approve.
router.post(
  "/confirmations/:confirmationId/approve",
  requireAuth,
  async (req, res) => {
    const approved = await access.approveConfirmation({
      confirmationId: req.params.confirmationId,
      delegatedUserId: req.session.userId!,
      now: new Date(),
    });
    if (!approved)
      return res.status(404).json({
        error: "Not Found",
        message: "Pending confirmation not found",
      });
    return res.json({ approved: true });
  },
);

router.post("/campaigns/:campaignId/commands/:commandId", async (req, res) => {
  const identity = await agentIdentity(req, res);
  if (!identity) return;
  const command = findCommand(req.params.commandId);
  if (!command)
    return res.status(404).json({
      error: "Not Found",
      message: "Agent command is not available",
    });
  const input = scopedInput(req.body?.input, identity.campaignId, res);
  if (!input || !validateInput(command.inputSchema, input, res)) return;
  const inputDigest = digestCanonical(input);
  if (command.requiresConfirmation) {
    const confirmationId = readHeader(req, "x-agent-confirmation");
    if (
      !confirmationId ||
      !(await access.consumeApprovedConfirmationById({
        confirmationId,
        credentialId: identity.credentialId,
        delegatedUserId: identity.delegatedUserId,
        campaignId: identity.campaignId,
        extensionId: CORE_AGENT_EXTENSION_ID,
        commandId: command.id,
        inputDigest,
        now: new Date(),
      }))
    )
      return res.status(409).json({
        error: "Confirmation Required",
        message: "An approved confirmation ID is required for this command",
      });
  }
  const idempotencyKey = readHeader(req, "idempotency-key");
  if (
    command.write &&
    (!idempotencyKey ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 200)
  )
    return res.status(400).json({
      error: "Validation Error",
      message: "A valid Idempotency-Key header is required for write commands",
    });
  try {
    const output = await productionApplicationHost.dispatch({
      id: command.id,
      input,
      context: {
        principalType: "AGENT",
        principalId: identity.credentialId,
        delegatedIdentity: identity.delegatedUserId,
        campaignId: identity.campaignId,
        extensionId: CORE_AGENT_EXTENSION_ID,
        idempotencyKey,
        origin: "AGENT",
      },
    });
    validateJsonSchema(command.outputSchema, output);
    return res.json({ commandId: command.id, result: output });
  } catch (error) {
    return sendCommandError(res, error);
  }
});

async function agentIdentity(
  req: Request,
  res: Response,
): Promise<AgentIdentity | null> {
  const campaignId = req.params.campaignId;
  const token = bearerToken(req);
  if (!campaignId || !token) {
    res.status(401).json({
      error: "Unauthorized",
      message: "A valid agent bearer credential is required",
    });
    return null;
  }
  const identity = await principalAuthenticator.authenticate(token, campaignId);
  if (!identity) {
    res.status(401).json({
      error: "Unauthorized",
      message: "A valid agent bearer credential is required",
    });
    return null;
  }
  return identity;
}
function findCommand(commandId: unknown): CoreAgentCommand | undefined {
  return findCoreAgentCommand(commandId);
}
function findDynamicTool(toolId: unknown):
  | {
      tool: { id: string; extensionId: string };
      extensionId: string;
      command: { id: string; inputSchema: JsonSchema };
    }
  | undefined {
  if (typeof toolId !== "string") return undefined;
  try {
    const runtime = productionExtensionRuntime();
    const tool = runtime.registry
      .listAgentTools()
      .find((item) => item.id === toolId);
    const command = tool
      ? runtime.registry.getCommand(tool.commandId)
      : undefined;
    return tool && command
      ? { tool, extensionId: tool.extensionId, command }
      : undefined;
  } catch {
    return undefined;
  }
}
function scopedInput(
  value: unknown,
  campaignId: string,
  res: Response,
): Record<string, unknown> | null {
  if (!isPlainObject(value)) {
    res.status(400).json({
      error: "Validation Error",
      message: "input must be a JSON object",
    });
    return null;
  }
  if ("campaignId" in value && value.campaignId !== campaignId) {
    res.status(400).json({
      error: "Validation Error",
      message: "input campaignId must match the credential campaign",
    });
    return null;
  }
  return { ...value, campaignId };
}
function validateInput(
  schema: JsonSchema,
  input: Record<string, unknown>,
  res: Response,
): boolean {
  try {
    validateJsonSchema(schema, input);
    return true;
  } catch (error) {
    if (error instanceof JsonSchemaValidationError) {
      res.status(400).json({
        error: "Validation Error",
        message: "Agent command input is invalid",
        issues: error.issues,
      });
      return false;
    }
    throw error;
  }
}
function queryTitle(id: string): string {
  return id
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
function parseExpiresAt(value: unknown): Date | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    return undefined;
  const expiresAt = new Date(value);
  return expiresAt > new Date() ? expiresAt : undefined;
}
function bearerToken(req: Request): string | undefined {
  const value = readHeader(req, "authorization");
  return value?.startsWith("Bearer ") && value.length > 12
    ? value.slice(7)
    : undefined;
}
function readHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === "string" ? value : undefined;
}
function sendCommandError(res: Response, error: unknown): Response {
  if (error instanceof IdempotencyReplayError)
    return res.status(409).json({
      error: "Idempotency Replay",
      message: "This command was already processed or is in progress",
    });
  if (error instanceof HostCommandError)
    return res
      .status(403)
      .json({ error: "Forbidden", message: "Agent command is not authorized" });
  if (error instanceof JsonSchemaValidationError)
    return res.status(500).json({
      error: "Command Contract Error",
      message: "The command returned an invalid result",
    });
  return res.status(500).json({
    error: "Command Failed",
    message: "The agent command could not be completed",
  });
}
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}
export default router;
