import type { Command } from '../../application/commands/CommandBus';
import type { AgentPrincipal, CampaignScope } from '../../application/policy/ExtensionPolicy';
import type { AgentRisk, ExtensionPermission, JsonSchema } from '../contracts';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface AgentToolInvocationContext {
  principal: AgentPrincipal;
  scope: CampaignScope;
}

export interface ConfirmationReceipt {
  /** An adapter may only set this after an explicit, attributable approval. */
  confirmed: boolean;
  approvedByPrincipalId: string;
}

export interface AgentToolInvocation extends AgentToolInvocationContext {
  toolId: string;
  input: unknown;
  confirmation?: ConfirmationReceipt;
}

/** A pre-registered factory is the only way a descriptor can reach the bus. */
export interface CommandBinding {
  commandId: string;
  createCommand(input: Record<string, unknown>, context: AgentToolInvocationContext): Command;
}

export interface AgentToolCatalogEntry {
  id: string;
  extensionId: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  requiredPermissions: ExtensionPermission[];
  risk: AgentRisk;
  confirmationRequired: boolean;
}

export type AgentToolAuditOutcome = 'listed' | 'succeeded' | 'denied' | 'rejected' | 'failed';

/** Audit events intentionally omit input values and command results. */
export interface AgentToolAuditEvent {
  occurredAt: string;
  outcome: AgentToolAuditOutcome;
  principalId: string;
  principalKind: AgentPrincipal['kind'];
  campaignId: string;
  extensionId?: string;
  toolId?: string;
  commandId?: string;
  reason?: string;
  inputKeys?: string[];
}

export interface AgentToolAuditPort {
  record(event: AgentToolAuditEvent): Promise<void>;
}

export class NoopAgentToolAudit implements AgentToolAuditPort {
  async record(_event: AgentToolAuditEvent): Promise<void> {
    // Intentional no-op for applications that have not provisioned durable audit storage.
  }
}

export class InMemoryAgentToolAudit implements AgentToolAuditPort {
  readonly events: AgentToolAuditEvent[] = [];

  async record(event: AgentToolAuditEvent): Promise<void> {
    this.events.push({ ...event, inputKeys: event.inputKeys ? [...event.inputKeys] : undefined });
  }
}

/** JSON-safe output after recursive key-based secret redaction. */
export interface RedactedAgentToolResult {
  readonly kind: 'redacted-agent-tool-result';
  readonly data: JsonValue;
  readonly redactedFields: number;
}

export interface AgentToolInvocationResult {
  toolId: string;
  commandId: string;
  extensionId: string;
  result: RedactedAgentToolResult;
}
