import type { CommandBus } from '../../application/commands/CommandBus';
import type { ExtensionPolicyPort } from '../../application/policy/ExtensionPolicy';
import type { AgentToolDescriptor, ApplicationCommandDescriptor } from '../contracts';
import type { ExtensionRegistry } from '../registry';
import { JsonSchemaValidationError, validateJsonSchema } from './JsonSchemaValidator';
import type {
  AgentToolAuditEvent,
  AgentToolAuditPort,
  AgentToolCatalogEntry,
  AgentToolInvocation,
  AgentToolInvocationContext,
  AgentToolInvocationResult,
  CommandBinding,
  JsonValue,
  RedactedAgentToolResult,
} from './contracts';

export type AgentToolBridgeErrorCode =
  | 'UNKNOWN_TOOL'
  | 'UNBOUND_COMMAND'
  | 'PERMISSION_DENIED'
  | 'CONFIRMATION_REQUIRED'
  | 'INVALID_INPUT'
  | 'INVALID_OUTPUT'
  | 'COMMAND_FAILED';

export class AgentToolBridgeError extends Error {
  constructor(
    message: string,
    public readonly code: AgentToolBridgeErrorCode,
    public readonly details?: { missingPermissions?: string[]; issues?: string[] }
  ) {
    super(message);
    this.name = 'AgentToolBridgeError';
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
    private readonly audit: AgentToolAuditPort,
    bindings: readonly CommandBinding[]
  ) {
    for (const binding of bindings) {
      if (this.bindings.has(binding.commandId)) {
        throw new Error(`Duplicate extension command binding for "${binding.commandId}"`);
      }
      this.bindings.set(binding.commandId, binding);
    }
  }

  async listCatalog(context: AgentToolInvocationContext): Promise<AgentToolCatalogEntry[]> {
    const entries: AgentToolCatalogEntry[] = [];
    for (const tool of this.registry.listAgentTools()) {
      const command = this.registry.getCommand(tool.commandId);
      if (!command || !this.bindings.has(command.id)) continue;

      const decision = await this.policy.check({
        principal: context.principal,
        scope: context.scope,
        extensionId: tool.extensionId,
        permissions: requiredPermissions(tool, command),
      });
      if (!decision.allowed) continue;

      entries.push({
        id: tool.id,
        extensionId: tool.extensionId,
        title: tool.title,
        description: tool.description,
        inputSchema: command.inputSchema,
        requiredPermissions: requiredPermissions(tool, command),
        risk: tool.risk,
        confirmationRequired: requiresConfirmation(tool),
      });
    }

    await this.audit.record(eventFor('listed', context));
    return entries;
  }

  async invoke(invocation: AgentToolInvocation): Promise<AgentToolInvocationResult> {
    let tool: (AgentToolDescriptor & { extensionId: string }) | undefined;
    let command: ApplicationCommandDescriptor | undefined;
    try {
      tool = this.registry.listAgentTools().find((candidate) => candidate.id === invocation.toolId);
      if (!tool) throw new AgentToolBridgeError(`Unknown active agent tool "${invocation.toolId}"`, 'UNKNOWN_TOOL');

      command = this.registry.getCommand(tool.commandId);
      const binding = command ? this.bindings.get(command.id) : undefined;
      if (!command || !binding) {
        throw new AgentToolBridgeError(`No allowlisted command binding for "${tool.commandId}"`, 'UNBOUND_COMMAND');
      }

      try {
        validateJsonSchema(command.inputSchema, invocation.input);
        if (!isPlainObject(invocation.input)) {
          throw new JsonSchemaValidationError(['$: command input must be a JSON object']);
        }
      } catch (error) {
        if (error instanceof JsonSchemaValidationError) {
          throw new AgentToolBridgeError('Tool input did not satisfy its schema', 'INVALID_INPUT', { issues: error.issues });
        }
        throw error;
      }

      const decision = await this.policy.check({
        principal: invocation.principal,
        scope: invocation.scope,
        extensionId: tool.extensionId,
        permissions: requiredPermissions(tool, command),
      });
      if (!decision.allowed) {
        throw new AgentToolBridgeError('The principal lacks an explicit extension permission grant', 'PERMISSION_DENIED', {
          missingPermissions: decision.missing,
        });
      }

      if (requiresConfirmation(tool) && !hasValidConfirmation(invocation)) {
        throw new AgentToolBridgeError('This tool requires explicit confirmation before execution', 'CONFIRMATION_REQUIRED');
      }

      const input = bindScope(invocation.input, invocation.scope.campaignId);
      let output: unknown;
      try {
        output = await this.commandBus.dispatch(binding.createCommand(input, invocation));
      } catch (error) {
        throw new AgentToolBridgeError('The command handler failed', 'COMMAND_FAILED');
      }

      try {
        validateJsonSchema(command.outputSchema, output);
      } catch (error) {
        if (error instanceof JsonSchemaValidationError) {
          throw new AgentToolBridgeError('The command handler returned data outside its declared schema', 'INVALID_OUTPUT', {
            issues: error.issues,
          });
        }
        throw error;
      }

      const result: AgentToolInvocationResult = {
        toolId: tool.id,
        commandId: command.id,
        extensionId: tool.extensionId,
        result: redactResult(output),
      };
      await this.audit.record(eventFor('succeeded', invocation, tool, command));
      return result;
    } catch (error) {
      const bridgeError = toBridgeError(error);
      await this.audit.record(eventFor(outcomeFor(bridgeError), invocation, tool, command, bridgeError.code));
      throw bridgeError;
    }
  }
}

function requiredPermissions(tool: AgentToolDescriptor, command: ApplicationCommandDescriptor): AgentToolDescriptor['requiredPermissions'] {
  return [...new Set([...tool.requiredPermissions, ...command.requiredPermissions])];
}

function requiresConfirmation(tool: AgentToolDescriptor): boolean {
  return tool.confirmation === 'always' || tool.risk === 'high' || (tool.confirmation === 'when-risky' && tool.risk !== 'read');
}

function hasValidConfirmation(invocation: AgentToolInvocation): boolean {
  return invocation.confirmation?.confirmed === true && invocation.confirmation.approvedByPrincipalId === invocation.principal.id;
}

/** Scope is authoritative, and a contradictory input scope is rejected. */
function bindScope(input: Record<string, unknown>, campaignId: string): Record<string, unknown> {
  if ('campaignId' in input && input.campaignId !== campaignId) {
    throw new AgentToolBridgeError('Input campaignId does not match the authorized campaign scope', 'INVALID_INPUT');
  }
  return { ...input };
}

function redactResult(value: unknown): RedactedAgentToolResult {
  const state = { count: 0 };
  return { kind: 'redacted-agent-tool-result', data: redact(value, state), redactedFields: state.count };
}

function redact(value: unknown, state: { count: number }): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => redact(item, state));
  if (isPlainObject(value)) {
    const result: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      if (/(?:password|secret|token|authorization|cookie|api[_-]?key|private[_-]?key)/i.test(key)) {
        result[key] = '[REDACTED]';
        state.count += 1;
      } else {
        result[key] = redact(child, state);
      }
    }
    return result;
  }
  return '[UNSERIALIZABLE]';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function eventFor(
  outcome: AgentToolAuditEvent['outcome'],
  context: AgentToolInvocationContext,
  tool?: (AgentToolDescriptor & { extensionId: string }),
  command?: ApplicationCommandDescriptor,
  reason?: string
): AgentToolAuditEvent {
  const invocation = context as Partial<AgentToolInvocation>;
  return {
    occurredAt: new Date().toISOString(),
    outcome,
    principalId: context.principal.id,
    principalKind: context.principal.kind,
    campaignId: context.scope.campaignId,
    extensionId: tool?.extensionId,
    toolId: tool?.id,
    commandId: command?.id,
    reason,
    inputKeys: isPlainObject(invocation.input) ? Object.keys(invocation.input).sort() : undefined,
  };
}

function toBridgeError(error: unknown): AgentToolBridgeError {
  if (error instanceof AgentToolBridgeError) return error;
  return new AgentToolBridgeError('The agent tool invocation failed', 'COMMAND_FAILED');
}

function outcomeFor(error: AgentToolBridgeError): AgentToolAuditEvent['outcome'] {
  if (error.code === 'PERMISSION_DENIED' || error.code === 'CONFIRMATION_REQUIRED') return 'denied';
  if (error.code === 'INVALID_INPUT' || error.code === 'UNKNOWN_TOOL' || error.code === 'UNBOUND_COMMAND') return 'rejected';
  return 'failed';
}
