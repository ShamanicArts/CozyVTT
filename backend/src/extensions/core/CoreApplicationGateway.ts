import type { AgentAccessRepository } from "../../ports/AgentAccessRepository";
import {
  CORE_AGENT_COMMANDS,
  CORE_AGENT_EXTENSION_ID,
  findCoreAgentCommand,
} from "../../application/agents/CoreAgentCatalog";
import type { ApplicationHost } from "../../composition/ApplicationHost";
import type { QueryHost } from "../../application/queries/QueryHost";
import { validateJsonSchema } from "../bridge/JsonSchemaValidator";
import type {
  CoreExtensionGateway,
  ExtensionCommandExecutionContext,
  JsonSchema,
} from "../contracts";

/** Campaign-scoped access to the same typed actions exposed by MCP and HTTP. */
export class CoreApplicationGatewayFactory {
  constructor(
    private readonly applicationHost: ApplicationHost,
    private readonly queryHost: QueryHost,
    private readonly access: AgentAccessRepository,
  ) {}

  create(
    extensionId: string,
    invocation: Pick<ExtensionCommandExecutionContext, "principal" | "scope">,
  ): CoreExtensionGateway {
    const campaignId = invocation.scope.campaignId;
    const identity = async () => {
      if (invocation.principal.kind !== "agent") {
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
        CORE_AGENT_COMMANDS.map(
          ({ id, title, description, inputSchema, operatingRoles }) => ({
            id,
            title,
            description,
            inputSchema: withoutCampaignId(inputSchema),
            operatingRoles,
          }),
        ),
      dispatch: async (commandId, input) => {
        const command = findCoreAgentCommand(commandId);
        if (!command) throw new Error("Core command is not extension-callable");
        const delegated = await identity();
        const scoped = scopeInput(input, campaignId);
        validateJsonSchema(command.inputSchema, scoped);
        const output = await this.applicationHost.dispatch({
          id: command.id,
          input: scoped,
          context: {
            principalType:
              invocation.principal.kind === "agent"
                ? "AGENT"
                : invocation.principal.kind === "user"
                  ? "USER"
                  : "SYSTEM",
            principalId: invocation.principal.id,
            delegatedIdentity: delegated.delegatedUserId,
            campaignId,
            extensionId: CORE_AGENT_EXTENSION_ID,
            origin:
              invocation.principal.kind === "agent" ? "AGENT" : "EXTENSION",
            correlationId: `extension:${extensionId}`,
          },
        });
        validateJsonSchema(command.outputSchema, output);
        return output;
      },
      listQueries: () =>
        this.queryHost.list().map(({ id, inputSchema }) => ({
          id,
          inputSchema: inputSchema as JsonSchema,
        })),
      query: async (queryId, input) => {
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
