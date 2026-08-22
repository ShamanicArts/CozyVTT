import type { Command } from "../../application/commands/CommandBus";
import type {
  CapabilityPrincipal,
  CampaignScope,
} from "../../application/policy/ExtensionPolicy";
import type { CapabilityRisk, ExtensionPermission, JsonSchema } from "../contracts";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface PublishedCapabilityInvocationContext {
  principal: CapabilityPrincipal;
  scope: CampaignScope;
}

export interface ApprovalReceipt {
  /** An adapter may only set this after an explicit, attributable approval. */
  confirmed: boolean;
  approvedByPrincipalId: string;
}

export interface PublishedCapabilityInvocation extends PublishedCapabilityInvocationContext {
  capabilityId: string;
  input: unknown;
  approval?: ApprovalReceipt;
}

/** A pre-registered factory is the only way a descriptor can reach the bus. */
export interface CommandBinding {
  commandId: string;
  createCommand(
    input: Record<string, unknown>,
    context: PublishedCapabilityInvocationContext,
  ): Command;
}

export interface PublishedCapabilityCatalogEntry {
  id: string;
  extensionId: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  requiredPermissions: ExtensionPermission[];
  risk: CapabilityRisk;
  approvalRequired: boolean;
}

export type PublishedCapabilityAuditOutcome =
  "listed" | "succeeded" | "denied" | "rejected" | "failed";

/** Audit events intentionally omit input values and command results. */
export interface PublishedCapabilityAuditEvent {
  occurredAt: string;
  outcome: PublishedCapabilityAuditOutcome;
  principalId: string;
  principalKind: CapabilityPrincipal["kind"];
  campaignId: string;
  extensionId?: string;
  capabilityId?: string;
  commandId?: string;
  reason?: string;
  inputKeys?: string[];
  inputDigest?: string;
}

export interface PublishedCapabilityAuditPort {
  record(event: PublishedCapabilityAuditEvent): Promise<void>;
}

export class NoopPublishedCapabilityAudit implements PublishedCapabilityAuditPort {
  async record(_event: PublishedCapabilityAuditEvent): Promise<void> {
    // Intentional no-op for applications that have not provisioned durable audit storage.
  }
}

export class InMemoryPublishedCapabilityAudit implements PublishedCapabilityAuditPort {
  readonly events: PublishedCapabilityAuditEvent[] = [];

  async record(event: PublishedCapabilityAuditEvent): Promise<void> {
    this.events.push({
      ...event,
      inputKeys: event.inputKeys ? [...event.inputKeys] : undefined,
    });
  }
}

/** JSON-safe output after recursive key-based secret redaction. */
export interface RedactedPublishedCapabilityResult {
  readonly kind: "redacted-capability-capability-result";
  readonly data: JsonValue;
  readonly redactedFields: number;
}

export interface PublishedCapabilityInvocationResult {
  capabilityId: string;
  commandId: string;
  extensionId: string;
  result: RedactedPublishedCapabilityResult;
}
