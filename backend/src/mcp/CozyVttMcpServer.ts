import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { AgentAccessRepository } from "../ports/AgentAccessRepository";
import type {
  AgentAuditPort,
  ExtensionGrantPort,
  IdempotencyPort,
} from "../ports/DurableFoundations";
import type { ApplicationHost } from "../composition/ApplicationHost";
import { digestCanonical } from "../composition/ApplicationHost";
import type { QueryHost } from "../application/queries/QueryHost";
import type { AgentIdentity } from "../application/agents/AgentPrincipalAuthenticator";
import { sha256Digest } from "../application/agents/AgentPrincipalAuthenticator";
import {
  CORE_AGENT_COMMANDS,
  CORE_AGENT_EXTENSION_ID,
} from "../application/agents/CoreAgentCatalog";
import type { ProductionExtensionRuntime } from "../composition/productionExtensionRuntime";
import {
  JsonSchemaValidationError,
  validateJsonSchema,
} from "../extensions/bridge/JsonSchemaValidator";
import type { JsonSchema } from "../extensions/contracts";

const CONFIRMATION_TTL_MS = 5 * 60_000;

export interface CozyVttMcpDependencies {
  access: AgentAccessRepository;
  grants: ExtensionGrantPort;
  audit: AgentAuditPort;
  idempotency: IdempotencyPort;
  applicationHost: ApplicationHost;
  queryHost: QueryHost;
  extensionRuntime: () => ProductionExtensionRuntime;
  now?: () => Date;
}

interface ToolBinding {
  tool: Tool;
  call(argumentsValue: Record<string, unknown>): Promise<CallToolResult>;
}

/** MCP is a transport adapter over the same guarded command/query boundaries. */
export function createCozyVttMcpServer(
  identity: AgentIdentity,
  dependencies: CozyVttMcpDependencies,
): Server {
  const server = new Server(
    { name: "cozyvtt", version: "1.1.1" },
    {
      capabilities: { tools: { listChanged: false } },
      instructions:
        "Read tools execute immediately. Write tools may return a pending confirmation; a human must approve it in CozyVTT before retrying with the one-time receipt.",
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (await buildBindings(identity, dependencies)).map(
      ({ tool }) => tool,
    ),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const binding = (await buildBindings(identity, dependencies)).find(
      ({ tool }) => tool.name === request.params.name,
    );
    if (!binding)
      return toolError("Tool is not available for this credential.");
    try {
      return await binding.call(request.params.arguments ?? {});
    } catch (error) {
      return toolError(publicError(error));
    }
  });
  return server;
}

async function buildBindings(
  identity: AgentIdentity,
  dependencies: CozyVttMcpDependencies,
): Promise<ToolBinding[]> {
  const bindings: ToolBinding[] = [];
  if (await hasGrant(dependencies, identity, CORE_AGENT_EXTENSION_ID, "READ")) {
    for (const query of dependencies.queryHost.list()) {
      const name = toolName("query", query.id);
      bindings.push({
        tool: {
          name,
          title: titleFromId(query.id),
          description: `Read ${query.id} from the credential's campaign.`,
          inputSchema: objectSchema(query.inputSchema),
          outputSchema: objectSchema(query.outputSchema),
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        call: async (input) => {
          validateJsonSchema(query.inputSchema as JsonSchema, input);
          try {
            const result = await dependencies.queryHost.dispatch(
              query.id,
              input,
              {
                principalId: identity.delegatedUserId,
                campaignId: identity.campaignId,
              },
            );
            validateJsonSchema(query.outputSchema as JsonSchema, result);
            await dependencies.audit.append({
              principalType: "AGENT",
              principalId: identity.credentialId,
              delegatedIdentity: identity.delegatedUserId,
              campaignId: identity.campaignId,
              extensionId: CORE_AGENT_EXTENSION_ID,
              commandType: query.id,
              inputDigest: digestCanonical(input),
              decision: "EXECUTED",
            });
            return toolSuccess(result);
          } catch (error) {
            await dependencies.audit.append({
              principalType: "AGENT",
              principalId: identity.credentialId,
              delegatedIdentity: identity.delegatedUserId,
              campaignId: identity.campaignId,
              extensionId: CORE_AGENT_EXTENSION_ID,
              commandType: query.id,
              inputDigest: digestCanonical(input),
              decision: "FAILED",
              reasonCode: error instanceof Error ? error.name : "UNKNOWN",
            });
            throw error;
          }
        },
      });
    }
  }

  if (
    await hasGrant(dependencies, identity, CORE_AGENT_EXTENSION_ID, "EXECUTE")
  ) {
    for (const command of CORE_AGENT_COMMANDS) {
      bindings.push({
        tool: commandTool(
          toolName("command", command.id),
          command.title,
          command.description,
          command.inputSchema,
          command.risk === "high",
        ),
        call: async (argumentsValue) => {
          const execution = readCommandArguments(argumentsValue);
          const input = scopedInput(execution.input, identity.campaignId);
          validateJsonSchema(command.inputSchema, input);
          const confirmation = await confirmOrPend({
            dependencies,
            identity,
            extensionId: CORE_AGENT_EXTENSION_ID,
            commandId: command.id,
            input,
            required: command.requiresConfirmation,
            receipt: execution.confirmationReceipt,
          });
          if (confirmation) return toolSuccess(confirmation);
          if (command.write && !validIdempotencyKey(execution.idempotencyKey)) {
            throw new Error(
              "A valid idempotency key is required for write tools.",
            );
          }
          const result = await dependencies.applicationHost.dispatch({
            id: command.id,
            input,
            context: {
              principalType: "AGENT",
              principalId: identity.credentialId,
              delegatedIdentity: identity.delegatedUserId,
              campaignId: identity.campaignId,
              extensionId: CORE_AGENT_EXTENSION_ID,
              idempotencyKey: execution.idempotencyKey,
              origin: "AGENT",
            },
          });
          validateJsonSchema(command.outputSchema, result);
          return toolSuccess(result);
        },
      });
    }
  }

  try {
    const runtime = dependencies.extensionRuntime();
    const catalog = await runtime.bridge.listCatalog({
      principal: { id: identity.credentialId, kind: "agent" },
      scope: { campaignId: identity.campaignId },
    });
    for (const entry of catalog) {
      const command = runtime.registry.getCommand(
        runtime.registry.listAgentTools().find((tool) => tool.id === entry.id)
          ?.commandId ?? "",
      );
      if (!command) continue;
      bindings.push({
        tool: commandTool(
          toolName("extension", entry.id),
          entry.title,
          entry.description,
          entry.inputSchema,
          entry.risk === "high",
        ),
        call: async (argumentsValue) => {
          const execution = readCommandArguments(argumentsValue);
          const input = scopedInput(execution.input, identity.campaignId);
          validateJsonSchema(command.inputSchema, input);
          const confirmation = await confirmOrPend({
            dependencies,
            identity,
            extensionId: entry.extensionId,
            commandId: command.id,
            input,
            required: entry.confirmationRequired,
            receipt: execution.confirmationReceipt,
          });
          if (confirmation) return toolSuccess(confirmation);
          if (!validIdempotencyKey(execution.idempotencyKey)) {
            throw new Error(
              "A valid idempotency key is required for extension tools.",
            );
          }
          const state = await dependencies.idempotency.register({
            principalType: "AGENT",
            principalId: identity.credentialId,
            campaignId: identity.campaignId,
            commandType: command.id,
            idempotencyKey: execution.idempotencyKey,
            requestDigest: digestCanonical(input),
            expiresAt: new Date(now(dependencies).getTime() + 86_400_000),
          });
          if (state === "CONFLICT") {
            throw new Error(
              "The idempotency key belongs to a different request.",
            );
          }
          if (state === "REPLAY") {
            throw new Error("This extension command was already processed.");
          }
          const result = await runtime.bridge.invoke({
            toolId: entry.id,
            input,
            principal: { id: identity.credentialId, kind: "agent" },
            scope: { campaignId: identity.campaignId },
            confirmation: {
              confirmed: true,
              approvedByPrincipalId: identity.delegatedUserId,
            },
          });
          await dependencies.idempotency.complete({
            principalType: "AGENT",
            principalId: identity.credentialId,
            campaignId: identity.campaignId,
            commandType: command.id,
            idempotencyKey: execution.idempotencyKey,
            resultDigest: digestCanonical(result),
          });
          return toolSuccess(result);
        },
      });
    }
  } catch {
    // Extension runtime is optional; core MCP tools remain available.
  }
  return bindings;
}

function commandTool(
  name: string,
  title: string,
  description: string,
  inputSchema: JsonSchema,
  destructive: boolean,
): Tool {
  return {
    name,
    title,
    description,
    inputSchema: {
      type: "object",
      properties: {
        input: objectSchema(inputSchema),
        idempotencyKey: { type: "string", minLength: 8, maxLength: 200 },
        confirmationReceipt: { type: "string", minLength: 1 },
      },
      required: ["input", "idempotencyKey"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: destructive,
      idempotentHint: true,
      openWorldHint: false,
    },
  };
}

async function confirmOrPend(input: {
  dependencies: CozyVttMcpDependencies;
  identity: AgentIdentity;
  extensionId: string;
  commandId: string;
  input: Record<string, unknown>;
  required: boolean;
  receipt?: string;
}): Promise<Record<string, unknown> | null> {
  if (!input.required) return null;
  if (!input.receipt) {
    const pending = await input.dependencies.access.createConfirmation({
      credentialId: input.identity.credentialId,
      delegatedUserId: input.identity.delegatedUserId,
      campaignId: input.identity.campaignId,
      extensionId: input.extensionId,
      commandId: input.commandId,
      inputDigest: digestCanonical(input.input),
      expiresAt: new Date(
        now(input.dependencies).getTime() + CONFIRMATION_TTL_MS,
      ),
    });
    return {
      confirmationRequired: true,
      confirmationId: pending.id,
      expiresAt: pending.expiresAt.toISOString(),
      next: "Ask the delegated user to approve this request in CozyVTT, then retry with the one-time confirmationReceipt.",
    };
  }
  const consumed = await input.dependencies.access.consumeApprovedConfirmation({
    receiptHash: sha256Digest(input.receipt),
    credentialId: input.identity.credentialId,
    delegatedUserId: input.identity.delegatedUserId,
    campaignId: input.identity.campaignId,
    extensionId: input.extensionId,
    commandId: input.commandId,
    inputDigest: digestCanonical(input.input),
    now: now(input.dependencies),
  });
  if (!consumed)
    throw new Error(
      "A current human-approved confirmation receipt is required.",
    );
  return null;
}

function readCommandArguments(value: Record<string, unknown>): {
  input: Record<string, unknown>;
  idempotencyKey?: string;
  confirmationReceipt?: string;
} {
  if (!isPlainObject(value.input))
    throw new Error("input must be a JSON object.");
  return {
    input: value.input,
    idempotencyKey:
      typeof value.idempotencyKey === "string"
        ? value.idempotencyKey
        : undefined,
    confirmationReceipt:
      typeof value.confirmationReceipt === "string"
        ? value.confirmationReceipt
        : undefined,
  };
}

function scopedInput(
  input: Record<string, unknown>,
  campaignId: string,
): Record<string, unknown> {
  if ("campaignId" in input && input.campaignId !== campaignId) {
    throw new Error("input campaignId must match the credential campaign.");
  }
  return { ...input, campaignId };
}

function validIdempotencyKey(value: string | undefined): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 200;
}

function objectSchema(value: unknown): Tool["inputSchema"] {
  return isPlainObject(value) && value.type === "object"
    ? (value as Tool["inputSchema"])
    : { type: "object", additionalProperties: true };
}

function toolName(kind: "query" | "command" | "extension", id: string): string {
  return `${kind}_${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

function titleFromId(id: string): string {
  return id
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function hasGrant(
  dependencies: CozyVttMcpDependencies,
  identity: AgentIdentity,
  extensionId: string,
  permission: "READ" | "EXECUTE",
): Promise<boolean> {
  return dependencies.grants.hasGrant({
    principalType: "AGENT",
    principalId: identity.credentialId,
    campaignId: identity.campaignId,
    extensionId,
    permission,
  });
}

function toolSuccess(value: unknown): CallToolResult {
  const structuredContent = isPlainObject(value) ? value : { result: value };
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

function toolError(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function publicError(error: unknown): string {
  if (error instanceof JsonSchemaValidationError)
    return "Tool input is invalid.";
  if (
    error instanceof Error &&
    /confirmation|idempotency|campaignId|input must/.test(error.message)
  ) {
    return error.message;
  }
  return "The CozyVTT operation could not be completed.";
}

function now(dependencies: CozyVttMcpDependencies): Date {
  return dependencies.now?.() ?? new Date();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
