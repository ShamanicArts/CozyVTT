import type { PluginAccessRepository } from "../../ports/PluginAccessRepository";
import { digestCanonical } from "../../composition/ApplicationHost";
import {
  listPublicCoreCommandDescriptors,
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
        listPublicCoreCommandDescriptors()
          .filter((command) =>
            hasPermissions(grantedPermissions, command.requiredPermissions),
          )
          .map(
            ({
              id,
              version,
              title,
              description,
              inputSchema,
              outputSchema,
              risk,
              approvalRequired,
              idempotencyRequired,
              requiredPermissions,
              openWorld,
            }) => ({
              id,
              version,
              title,
              description,
              inputSchema: withoutCampaignId(inputSchema),
              outputSchema,
              requiredPermissions,
              risk,
              approvalRequired,
              idempotencyRequired,
              openWorld: openWorld === true,
            }),
          ),
      dispatch: async (commandId, input, options) => {
        const command = findCoreCapabilityCommand(commandId);
        if (!command) throw new Error("Core command is not extension-callable");
        const descriptor = command;
        const requiredPermissions = descriptor.requiredPermissions;
        if (!hasPermissions(grantedPermissions, requiredPermissions)) {
          throw new Error("Plugin permission does not allow this core command");
        }
        const delegated = await identity();
        const scoped = scopeInput(input, campaignId);
        validateJsonSchema(descriptor.inputSchema, scoped);
        if (
          descriptor.idempotencyRequired &&
          (!options?.idempotencyKey ||
            options.idempotencyKey.length < 8 ||
            options.idempotencyKey.length > 200)
        ) {
          throw new Error(
            "A valid idempotency key is required for write capabilities",
          );
        }
        if (descriptor.approvalRequired) {
          const inputDigest = digestCanonical(scoped);
          const approved = options?.approvalId
            ? await this.access.consumeApprovedApprovalById({
                approvalId: options.approvalId,
                credentialId: invocation.principal.id,
                delegatedUserId: delegated.delegatedUserId,
                campaignId,
                extensionId: PUBLIC_CAPABILITY_EXTENSION_ID,
                commandId: descriptor.id,
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
                capabilityTitle: descriptor.title,
                capabilityVersion: descriptor.version,
                campaignLabel: campaignId,
                integrationLabel: extensionId,
                riskExplanation: `This ${descriptor.risk}-risk capability changes campaign state.`,
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
          id: descriptor.id,
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
        validateJsonSchema(descriptor.outputSchema, output);
        return output;
      },
      listQueries: () =>
        grantedPermissions.has("campaign.read")
          ? this.queryHost
              .list()
              .map(
                ({
                  id,
                  version,
                  title,
                  description,
                  inputSchema,
                  outputSchema,
                  extensionPermissions,
                }) => ({
                  id,
                  version,
                  title,
                  description,
                  inputSchema: inputSchema as JsonSchema,
                  outputSchema: outputSchema as JsonSchema,
                  requiredPermissions: extensionPermissions,
                }),
              )
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
