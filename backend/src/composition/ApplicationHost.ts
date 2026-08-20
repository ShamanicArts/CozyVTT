import { createHash } from "crypto";
import {
  DurablePermission,
  DurablePrincipalType,
  AgentAuditPort,
  DelegatedAgentAccessPort,
  ExtensionGrantPort,
  IdempotencyPort,
  OutboxPort,
} from "../ports/DurableFoundations";
import { UnitOfWorkPort } from "../ports/UnitOfWork";

export interface CommandMetadata {
  id: string;
  version: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  permissions: DurablePermission[];
  inputSchema?: unknown;
  outputSchema?: unknown;
  idempotency?: boolean;
  outbox?: {
    topic: string;
    aggregateType: string;
    aggregateId: (
      input: unknown,
      output: unknown,
      context?: TrustedExecutionContext,
    ) => string;
  };
}
export interface TrustedExecutionContext {
  principalType: DurablePrincipalType;
  principalId: string;
  campaignId?: string;
  extensionId?: string;
  delegatedIdentity?: string;
  correlationId?: string;
  idempotencyKey?: string;
  origin?: "TRANSPORT" | "AGENT" | "EXTENSION";
}
export interface HostCommand<I = unknown, O = unknown> {
  metadata: CommandMetadata;
  execute(input: I, context?: TrustedExecutionContext): Promise<O>;
}
export interface HostDispatch<I = unknown> {
  id: string;
  input: I;
  context?: TrustedExecutionContext;
}
export type HostMiddleware = (
  dispatch: HostDispatch,
  metadata: CommandMetadata,
  next: () => Promise<unknown>,
) => Promise<unknown>;
export class HostCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostCommandError";
  }
}
export class IdempotencyReplayError extends HostCommandError {
  constructor() {
    super("Idempotent command already completed or is in progress");
    this.name = "IdempotencyReplayError";
  }
}

export class ApplicationHost {
  private readonly commands = new Map<string, HostCommand>();
  private readonly middleware: HostMiddleware[] = [];
  register<I, O>(command: HostCommand<I, O>): void {
    if (this.commands.has(command.metadata.id))
      throw new HostCommandError(
        `Command "${command.metadata.id}" already registered`,
      );
    this.commands.set(command.metadata.id, command as HostCommand);
  }
  use(middleware: HostMiddleware): void {
    this.middleware.push(middleware);
  }
  list(): CommandMetadata[] {
    return [...this.commands.values()].map((command) => command.metadata);
  }
  get(id: string): CommandMetadata | undefined {
    return this.commands.get(id)?.metadata;
  }
  async dispatch<I, O>(dispatch: HostDispatch<I>): Promise<O> {
    const command = this.commands.get(dispatch.id);
    if (!command)
      throw new HostCommandError(`Unknown host command "${dispatch.id}"`);
    let index = -1;
    const invoke = async (): Promise<unknown> =>
      command.execute(dispatch.input, dispatch.context);
    const run = async (): Promise<unknown> => {
      index += 1;
      return index === this.middleware.length
        ? invoke()
        : this.middleware[index](dispatch, command.metadata, run);
    };
    return run() as Promise<O>;
  }
}

export interface DurableExecutionPorts {
  grants: ExtensionGrantPort;
  audit: AgentAuditPort;
  idempotency: IdempotencyPort;
  outbox: OutboxPort;
  delegatedAgentAccess?: DelegatedAgentAccessPort;
  /** Used for agent/extension command persistence, completion, and outbox. */
  unitOfWork?: UnitOfWorkPort;
  now?: () => Date;
}
export function durableExecutionMiddleware(
  ports: DurableExecutionPorts,
): HostMiddleware {
  const now = ports.now ?? (() => new Date());
  return async (dispatch, metadata, next) => {
    const context = dispatch.context;
    if (!context) return next();
    const digest = digestCanonical(dispatch.input);
    const audit = async (
      decision: "ALLOWED" | "DENIED" | "EXECUTED" | "FAILED",
      reasonCode?: string,
    ) =>
      ports.audit.append({
        principalType: context.principalType,
        principalId: context.principalId,
        delegatedIdentity: context.delegatedIdentity,
        campaignId: context.campaignId,
        extensionId: context.extensionId,
        commandType: metadata.id,
        inputDigest: digest,
        decision,
        reasonCode,
        correlationId: context.correlationId,
      });
    const protectedOrigin =
      context.origin === "AGENT" || context.origin === "EXTENSION";
    const selfDelegatedAgent =
      context.origin === "AGENT" &&
      context.principalType === "AGENT" &&
      Boolean(context.delegatedIdentity) &&
      Boolean(context.campaignId) &&
      Boolean(
        ports.delegatedAgentAccess &&
          (await ports.delegatedAgentAccess.activeCredentialDelegates({
            credentialId: context.principalId,
            delegatedUserId: context.delegatedIdentity!,
            campaignId: context.campaignId!,
            now: now(),
          })),
      );
    if (protectedOrigin && !selfDelegatedAgent) {
      if (!context.extensionId) {
        await audit("DENIED", "MISSING_EXTENSION_ID");
        throw new HostCommandError("Extension identity is required");
      }
      for (const permission of metadata.permissions)
        if (
          !(await ports.grants.hasGrant({
            principalType: context.principalType,
            principalId: context.principalId,
            campaignId: context.campaignId,
            extensionId: context.extensionId,
            permission,
          }))
        ) {
          await audit("DENIED", "GRANT_DENIED");
          throw new HostCommandError("Extension permission denied");
        }
    }
    await audit("ALLOWED");
    try {
      const persist = async (): Promise<unknown> => {
        if (metadata.idempotency && context.idempotencyKey) {
          const state = await ports.idempotency.register({
            principalType: context.principalType,
            principalId: context.principalId,
            campaignId: context.campaignId,
            commandType: metadata.id,
            idempotencyKey: context.idempotencyKey,
            requestDigest: digest,
            expiresAt: new Date(now().getTime() + 86_400_000),
            now: now(),
          });
          if (state === "CONFLICT") {
            await audit("DENIED", "IDEMPOTENCY_CONFLICT");
            throw new HostCommandError(
              "Idempotency key conflicts with a different request",
            );
          }
          if (state === "REPLAY") throw new IdempotencyReplayError();
        }
        const output = await next();
        if (metadata.idempotency && context.idempotencyKey)
          await ports.idempotency.complete({
            principalType: context.principalType,
            principalId: context.principalId,
            campaignId: context.campaignId,
            commandType: metadata.id,
            idempotencyKey: context.idempotencyKey,
            resultDigest: digestCanonical(output),
          });
        if (metadata.outbox)
          await ports.outbox.enqueue({
            topic: metadata.outbox.topic,
            aggregateType: metadata.outbox.aggregateType,
            aggregateId: metadata.outbox.aggregateId(
              dispatch.input,
              output,
              context,
            ),
            campaignId: context.campaignId,
            payload: {
              commandId: metadata.id,
              commandVersion: metadata.version,
            },
          });
        return output;
      };
      const output =
        protectedOrigin && ports.unitOfWork
          ? await ports.unitOfWork.execute(persist)
          : await persist();
      await audit("EXECUTED");
      return output;
    } catch (error) {
      await audit("FAILED", error instanceof Error ? error.name : "UNKNOWN");
      throw error;
    }
  };
}
export function digestCanonical(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex")}`;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
