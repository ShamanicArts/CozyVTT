import type { PluginAccessRepository } from "../../ports/PluginAccessRepository";
import { digestCanonical } from "../../composition/ApplicationHost";
import {
  CORE_PUBLIC_CAPABILITIES,
  PUBLIC_CAPABILITY_EXTENSION_ID,
  findCoreCapabilityCommand,
} from "../../application/capabilities/CoreCapabilityCatalog";
import type { ApplicationHost } from "../../composition/ApplicationHost";
import type { QueryHost } from "../../application/queries/QueryHost";
import { validateJsonSchema } from "../bridge/JsonSchemaValidator";
import type {
  CoreExtensionGateway,
  ExtensionCommandExecutionContext,
  ExtensionPermission,
  JsonSchema,
} from "../contracts";

/** Campaign-scoped access to the same typed actions exposed by plugin and HTTP. */
export class CoreApplicationGatewayFactory {
  constructor(
    private readonly applicationHost: ApplicationHost,
    private readonly queryHost: QueryHost,
    private readonly access: PluginAccessRepository,
  ) {}

  create(
    extensionId: string,
    invocation: Pick<ExtensionCommandExecutionContext, "principal" | "scope">,
    permissions: readonly ExtensionPermission[],
  ): CoreExtensionGateway {
    const campaignId = invocation.scope.campaignId;
    const grantedPermissions = new Set(permissions);
    const identity = async () => {
      if (invocation.principal.kind !== "plugin") {
        return { delegatedUserId: invocation.principal.id };
      }
      const credential = await this.access.findCredentialById(
        invocation.principal.id,
        new Date(),
      );
      if (!credential || credential.campaignId !== campaignId) {
        throw new Error("The extension invocation is not campaign-authorized");
      }
      return credential;
    };

    return {
      listCommands: () =>
        CORE_PUBLIC_CAPABILITIES.filter((command) =>
          hasPermissions(grantedPermissions, commandPermissions(command.id)),
        ).map(
          ({ id, title, description, inputSchema, outputSchema, risk, requiresApproval, write, openWorld, operatingRoles }) => ({
            id,
            version: "1",
            title,
            description,
            inputSchema: withoutCampaignId(inputSchema),
            outputSchema,
            requiredPermissions: commandPermissions(id),
            risk,
            approvalRequired: requiresApproval,
            idempotencyRequired: write,
            openWorld: openWorld === true,
            operatingRoles,
          }),
        ),
      dispatch: async (commandId, input, options) => {
        const command = findCoreCapabilityCommand(commandId);
        if (!command) throw new Error("Core command is not extension-callable");
        const requiredPermissions = commandPermissions(command.id);
        if (!hasPermissions(grantedPermissions, requiredPermissions)) {
          throw new Error("Plugin permission does not allow this core command");
        }
        const delegated = await identity();
        const scoped = scopeInput(input, campaignId);
        validateJsonSchema(command.inputSchema, scoped);
        if (
          command.write &&
          (!options?.idempotencyKey ||
            options.idempotencyKey.length < 8 ||
            options.idempotencyKey.length > 200)
        ) {
          throw new Error("A valid idempotency key is required for write capabilities");
        }
        if (command.requiresApproval) {
          const inputDigest = digestCanonical(scoped);
          const approved = options?.approvalId
            ? await this.access.consumeApprovedApprovalById({
                approvalId: options.approvalId,
                credentialId: invocation.principal.id,
                delegatedUserId: delegated.delegatedUserId,
                campaignId,
                extensionId: PUBLIC_CAPABILITY_EXTENSION_ID,
                commandId: command.id,
                inputDigest,
                now: new Date(),
              })
            : false;
          if (!approved) {
            const pending = await this.access.createApproval({
              credentialId: invocation.principal.id,
              delegatedUserId: delegated.delegatedUserId,
              campaignId,
              extensionId: PUBLIC_CAPABILITY_EXTENSION_ID,
              commandId: command.id,
              inputDigest,
              displayMetadata: {
                capabilityTitle: command.title,
                capabilityVersion: "1",
                campaignLabel: campaignId,
                integrationLabel: extensionId,
                riskExplanation: `This ${command.risk}-risk capability changes campaign state.`,
                summary: approvalSummary(input),
              },
              expiresAt: new Date(Date.now() + 5 * 60_000),
            });
            throw new CapabilityApprovalRequiredError(
              pending.id,
              pending.expiresAt,
            );
          }
        }
        const output = await this.applicationHost.dispatch({
          id: command.id,
          input: scoped,
          context: {
            principalType:
              invocation.principal.kind === "plugin"
                ? "PLUGIN"
                : invocation.principal.kind === "user"
                  ? "USER"
                  : "SYSTEM",
            principalId: invocation.principal.id,
            delegatedIdentity: delegated.delegatedUserId,
            campaignId,
            extensionId: PUBLIC_CAPABILITY_EXTENSION_ID,
            idempotencyKey: options?.idempotencyKey,
            origin:
              invocation.principal.kind === "plugin" ? "PLUGIN" : "EXTENSION",
            correlationId: `extension:${extensionId}`,
          },
        });
        validateJsonSchema(command.outputSchema, output);
        return output;
      },
      listQueries: () =>
        grantedPermissions.has("campaign.read")
          ? this.queryHost.list().map(({ id, inputSchema, outputSchema }) => ({
              id,
              version: "1",
              title: titleFromId(id),
              description: `Read ${id} from the authorized campaign.`,
              inputSchema: inputSchema as JsonSchema,
              outputSchema: outputSchema as JsonSchema,
              requiredPermissions: ["campaign.read"] as const,
            }))
          : [],
      query: async (queryId, input) => {
        if (!grantedPermissions.has("campaign.read")) {
          throw new Error("Plugin permission does not allow core queries");
        }
        const metadata = this.queryHost
          .list()
          .find((query) => query.id === queryId);
        if (!metadata) throw new Error("Core query is not available");
        const delegated = await identity();
        validateJsonSchema(metadata.inputSchema as JsonSchema, input);
        const output = await this.queryHost.dispatch(queryId, input, {
          principalId: delegated.delegatedUserId,
          campaignId,
        });
        validateJsonSchema(metadata.outputSchema as JsonSchema, output);
        return output;
      },
    };
  }
}

export class CapabilityApprovalRequiredError extends Error {
  public constructor(
    public readonly approvalId: string,
    public readonly expiresAt: Date,
  ) {
    super(
      `Capability approval required. Ask the delegated user to approve request ${approvalId}, then retry with that approval ID.`,
    );
    this.name = "CapabilityApprovalRequiredError";
  }
}

function titleFromId(id: string): string {
  return id
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function scopeInput(
  input: Readonly<Record<string, unknown>>,
  campaignId: string,
): Record<string, unknown> {
  if ("campaignId" in input && input.campaignId !== campaignId) {
    throw new Error("Core input cannot escape the extension campaign scope");
  }
  return { ...input, campaignId };
}

function withoutCampaignId(schema: JsonSchema): JsonSchema {
  const properties = schema.properties;
  if (!isRecord(properties)) return schema;
  const { campaignId: _campaignId, ...scopedProperties } = properties;
  return {
    ...schema,
    properties: scopedProperties,
    required: Array.isArray(schema.required)
      ? schema.required.filter((key) => key !== "campaignId")
      : schema.required,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function approvalSummary(
  input: Readonly<Record<string, unknown>>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) =>
        ["string", "number", "boolean"].includes(typeof value),
      )
      .slice(0, 12) as Array<[string, string | number | boolean]>,
  );
}

function hasPermissions(
  granted: ReadonlySet<ExtensionPermission>,
  required: readonly ExtensionPermission[],
): boolean {
  return required.every((permission) => granted.has(permission));
}

function commandPermissions(commandId: string): readonly ExtensionPermission[] {
  if (commandId === "map.import-remote") {
    return ["maps.write", "assets.write", "network.fetch"];
  }
  if (commandId === "vtt.actor.speak") return ["chat.write"];
  if (commandId === "vtt.actor.roll") return ["dice.roll"];
  if (commandId.startsWith("vtt.actor.") || commandId.startsWith("vtt.combat.")) {
    return ["tokens.write"];
  }
  if (commandId.startsWith("vtt.character.")) return ["characters.write"];
  if (commandId.startsWith("vtt.map.") || commandId.startsWith("vtt.scene.")) {
    return ["maps.write"];
  }
  if (
    commandId.startsWith("vtt.campaign.") ||
    commandId.startsWith("vtt.session.") ||
    commandId.startsWith("vtt.atmosphere.")
  ) {
    return ["campaign.write"];
  }
  throw new Error(`Core command ${commandId} has no plugin permission mapping`);
}
