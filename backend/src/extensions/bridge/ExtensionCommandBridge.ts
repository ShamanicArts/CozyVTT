import { createHash } from "crypto";
import type { CommandBus } from "../../application/commands/CommandBus";
import type { ExtensionPolicyPort } from "../../application/policy/ExtensionPolicy";
import type {
  PublishedCapabilityDescriptor,
  ApplicationCommandDescriptor,
} from "../contracts";
import type { ExtensionRegistry } from "../registry";
import {
  JsonSchemaValidationError,
  validateJsonSchema,
} from "./JsonSchemaValidator";
import type {
  PublishedCapabilityAuditEvent,
  PublishedCapabilityAuditPort,
  PublishedCapabilityCatalogEntry,
  PublishedCapabilityInvocation,
  PublishedCapabilityInvocationContext,
  PublishedCapabilityInvocationResult,
  CommandBinding,
  JsonValue,
  RedactedPublishedCapabilityResult,
} from "./contracts";

export type PublishedCapabilityBridgeErrorCode =
  | "UNKNOWN_TOOL"
  | "UNBOUND_COMMAND"
  | "PERMISSION_DENIED"
  | "CONFIRMATION_REQUIRED"
  | "INVALID_INPUT"
  | "INVALID_OUTPUT"
  | "COMMAND_FAILED";

export class PublishedCapabilityBridgeError extends Error {
  constructor(
    message: string,
    public readonly code: PublishedCapabilityBridgeErrorCode,
    public readonly details?: {
      missingPermissions?: string[];
      issues?: string[];
    },
  ) {
    super(message);
    this.name = "PublishedCapabilityBridgeError";
  }
}

/**
 * The guarded descriptor-to-command-bus boundary. There is deliberately no
 * Express, Socket.IO, Prisma, or extension-supplied handler access here.
 */
export class ExtensionCommandBridge {
  private readonly bindings = new Map<string, CommandBinding>();

  constructor(
    private readonly registry: ExtensionRegistry,
    private readonly commandBus: CommandBus,
    private readonly policy: ExtensionPolicyPort,
    private readonly audit: PublishedCapabilityAuditPort,
    bindings: readonly CommandBinding[],
  ) {
    for (const binding of bindings) {
      if (this.bindings.has(binding.commandId)) {
        throw new Error(
          `Duplicate extension command binding for "${binding.commandId}"`,
        );
      }
      this.bindings.set(binding.commandId, binding);
    }
  }

  async listCatalog(
    context: PublishedCapabilityInvocationContext,
  ): Promise<PublishedCapabilityCatalogEntry[]> {
    const entries: PublishedCapabilityCatalogEntry[] = [];
    for (const capability of this.registry.listPublishedCapabilities()) {
      const command = this.registry.getCommand(capability.commandId);
      if (!command || !this.bindings.has(command.id)) continue;

      const decision = await this.policy.check({
        principal: context.principal,
        scope: context.scope,
        extensionId: capability.extensionId,
        permissions: requiredPermissions(capability, command),
      });
      if (!decision.allowed) continue;

      entries.push({
        id: capability.id,
        extensionId: capability.extensionId,
        title: capability.title,
        description: capability.description,
        inputSchema: command.inputSchema,
        requiredPermissions: requiredPermissions(capability, command),
        risk: capability.risk,
        approvalRequired: requiresApproval(capability),
      });
    }

    await this.audit.record(eventFor("listed", context));
    return entries;
  }

  async invoke(
    invocation: PublishedCapabilityInvocation,
  ): Promise<PublishedCapabilityInvocationResult> {
    let capability: (PublishedCapabilityDescriptor & { extensionId: string }) | undefined;
    let command: ApplicationCommandDescriptor | undefined;
    try {
      capability = this.registry
        .listPublishedCapabilities()
        .find((candidate) => candidate.id === invocation.capabilityId);
      if (!capability)
        throw new PublishedCapabilityBridgeError(
          `Unknown active capability "${invocation.capabilityId}"`,
          "UNKNOWN_TOOL",
        );

      command = this.registry.getCommand(capability.commandId);
      const binding = command ? this.bindings.get(command.id) : undefined;
      if (!command || !binding) {
        throw new PublishedCapabilityBridgeError(
          `No allowlisted command binding for "${capability.commandId}"`,
          "UNBOUND_COMMAND",
        );
      }

      try {
        validateJsonSchema(command.inputSchema, invocation.input);
        if (!isPlainObject(invocation.input)) {
          throw new JsonSchemaValidationError([
            "$: command input must be a JSON object",
          ]);
        }
      } catch (error) {
        if (error instanceof JsonSchemaValidationError) {
          throw new PublishedCapabilityBridgeError(
            "Capability input did not satisfy its schema",
            "INVALID_INPUT",
            { issues: error.issues },
          );
        }
        throw error;
      }

      const decision = await this.policy.check({
        principal: invocation.principal,
        scope: invocation.scope,
        extensionId: capability.extensionId,
        permissions: requiredPermissions(capability, command),
      });
      if (!decision.allowed) {
        throw new PublishedCapabilityBridgeError(
          "The principal lacks an explicit extension permission grant",
          "PERMISSION_DENIED",
          {
            missingPermissions: decision.missing,
          },
        );
      }

      if (requiresApproval(capability) && !hasValidApproval(invocation)) {
        throw new PublishedCapabilityBridgeError(
          "This capability requires explicit approval before execution",
          "CONFIRMATION_REQUIRED",
        );
      }

      const input = bindScope(invocation.input, invocation.scope.campaignId);
      let output: unknown;
      try {
        output = await this.commandBus.dispatch(
          binding.createCommand(input, invocation),
        );
      } catch (error) {
        throw new PublishedCapabilityBridgeError(
          "The command handler failed",
          "COMMAND_FAILED",
        );
      }

      try {
        validateJsonSchema(command.outputSchema, output);
      } catch (error) {
        if (error instanceof JsonSchemaValidationError) {
          throw new PublishedCapabilityBridgeError(
            "The command handler returned data outside its declared schema",
            "INVALID_OUTPUT",
            {
              issues: error.issues,
            },
          );
        }
        throw error;
      }

      const result: PublishedCapabilityInvocationResult = {
        capabilityId: capability.id,
        commandId: command.id,
        extensionId: capability.extensionId,
        result: redactResult(output),
      };
      await this.audit.record(eventFor("succeeded", invocation, capability, command));
      return result;
    } catch (error) {
      const bridgeError = toBridgeError(error);
      await this.audit.record(
        eventFor(
          outcomeFor(bridgeError),
          invocation,
          capability,
          command,
          bridgeError.code,
        ),
      );
      throw bridgeError;
    }
  }

  /** Registers a host-created binding and returns an ownership-safe disposer. */
  registerBinding(binding: CommandBinding): () => void {
    if (this.bindings.has(binding.commandId))
      throw new Error(
        `Duplicate extension command binding for "${binding.commandId}"`,
      );
    this.bindings.set(binding.commandId, binding);
    return () => {
      if (this.bindings.get(binding.commandId) === binding)
        this.bindings.delete(binding.commandId);
    };
  }
}

function requiredPermissions(
  capability: PublishedCapabilityDescriptor,
  command: ApplicationCommandDescriptor,
): PublishedCapabilityDescriptor["requiredPermissions"] {
  return [
    ...new Set([...capability.requiredPermissions, ...command.requiredPermissions]),
  ];
}

function requiresApproval(capability: PublishedCapabilityDescriptor): boolean {
  return (
    capability.approval === "always" ||
    capability.risk === "high" ||
    (capability.approval === "when-risky" && capability.risk !== "read")
  );
}

function hasValidApproval(invocation: PublishedCapabilityInvocation): boolean {
  return (
    invocation.approval?.confirmed === true &&
    invocation.approval.approvedByPrincipalId === invocation.principal.id
  );
}

/** Scope is authoritative, and a contradictory input scope is rejected. */
function bindScope(
  input: Record<string, unknown>,
  campaignId: string,
): Record<string, unknown> {
  if ("campaignId" in input && input.campaignId !== campaignId) {
    throw new PublishedCapabilityBridgeError(
      "Input campaignId does not match the authorized campaign scope",
      "INVALID_INPUT",
    );
  }
  return { ...input };
}

function redactResult(value: unknown): RedactedPublishedCapabilityResult {
  const state = { count: 0 };
  return {
    kind: "redacted-capability-capability-result",
    data: redact(value, state),
    redactedFields: state.count,
  };
}

function redact(value: unknown, state: { count: number }): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => redact(item, state));
  if (isPlainObject(value)) {
    const result: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      if (
        /(?:password|secret|token|authorization|cookie|api[_-]?key|private[_-]?key)/i.test(
          key,
        )
      ) {
        result[key] = "[REDACTED]";
        state.count += 1;
      } else {
        result[key] = redact(child, state);
      }
    }
    return result;
  }
  return "[UNSERIALIZABLE]";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function eventFor(
  outcome: PublishedCapabilityAuditEvent["outcome"],
  context: PublishedCapabilityInvocationContext,
  capability?: PublishedCapabilityDescriptor & { extensionId: string },
  command?: ApplicationCommandDescriptor,
  reason?: string,
): PublishedCapabilityAuditEvent {
  const invocation = context as Partial<PublishedCapabilityInvocation>;
  return {
    occurredAt: new Date().toISOString(),
    outcome,
    principalId: context.principal.id,
    principalKind: context.principal.kind,
    campaignId: context.scope.campaignId,
    extensionId: capability?.extensionId,
    capabilityId: capability?.id,
    commandId: command?.id,
    reason,
    inputKeys: isPlainObject(invocation.input)
      ? Object.keys(invocation.input).sort()
      : undefined,
    inputDigest:
      invocation.input === undefined
        ? undefined
        : digestInput(invocation.input),
  };
}

function digestInput(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")}`;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isPlainObject(value))
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  return value;
}

function toBridgeError(error: unknown): PublishedCapabilityBridgeError {
  if (error instanceof PublishedCapabilityBridgeError) return error;
  return new PublishedCapabilityBridgeError(
    "The capability invocation failed",
    "COMMAND_FAILED",
  );
}

function outcomeFor(
  error: PublishedCapabilityBridgeError,
): PublishedCapabilityAuditEvent["outcome"] {
  if (
    error.code === "PERMISSION_DENIED" ||
    error.code === "CONFIRMATION_REQUIRED"
  )
    return "denied";
  if (
    error.code === "INVALID_INPUT" ||
    error.code === "UNKNOWN_TOOL" ||
    error.code === "UNBOUND_COMMAND"
  )
    return "rejected";
  return "failed";
}
