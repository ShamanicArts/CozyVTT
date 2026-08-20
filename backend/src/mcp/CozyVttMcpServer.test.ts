import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApplicationHost } from "../composition/ApplicationHost";
import { QueryHost } from "../application/queries/QueryHost";
import { CORE_AGENT_COMMANDS } from "../application/agents/CoreAgentCatalog";
import { SET_ATMOSPHERE_EFFECT } from "../application/campaigns/RealtimeCampaignCommands";
import { IMPORT_REMOTE_MAP } from "../application/maps/RemoteMapImportCommands";
import type { AgentAccessRepository } from "../ports/AgentAccessRepository";
import type {
  AgentAuditPort,
  IdempotencyPort,
} from "../ports/DurableFoundations";
import { createCozyVttMcpServer } from "./CozyVttMcpServer";

describe("CozyVTT MCP adapter", () => {
  it("discovers guarded queries and commands and preserves human confirmation", async () => {
    const queryHost = new QueryHost();
    queryHost.register({
      metadata: {
        id: "campaign.summary.get",
        version: "1",
        risk: "READ",
        inputSchema: { type: "object", additionalProperties: false },
        outputSchema: { type: "object" },
      },
      execute: async (_input, context) => ({ campaignId: context.campaignId }),
    });
    const applicationHost = new ApplicationHost();
    const command = CORE_AGENT_COMMANDS.find(
      (candidate) => candidate.id === SET_ATMOSPHERE_EFFECT,
    )!;
    applicationHost.register({
      metadata: {
        id: command.id,
        version: "1",
        risk: "MEDIUM",
        permissions: ["EXECUTE"],
      },
      execute: async () => "rain",
    });
    const createConfirmation = jest.fn(async () => ({
      id: "confirmation-1",
      expiresAt: new Date("2026-08-20T12:05:00.000Z"),
    }));
    const consumeApprovedConfirmationById = jest.fn(async () => true);
    const access = {
      createConfirmation,
      consumeApprovedConfirmationById,
    } as unknown as AgentAccessRepository;
    const audit: AgentAuditPort = { append: async () => undefined };
    const idempotency: IdempotencyPort = {
      register: async () => "CREATED",
      complete: async () => undefined,
    };
    const server = createCozyVttMcpServer(
      {
        credentialId: "credential-1",
        delegatedUserId: "user-1",
        campaignId: "campaign-1",
        expiresAt: null,
      },
      {
        access,
        audit,
        idempotency,
        applicationHost,
        queryHost,
        extensionRuntime: () => {
          throw new Error("extensions disabled");
        },
        now: () => new Date("2026-08-20T12:00:00.000Z"),
      },
    );
    const client = new Client({ name: "test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const catalog = await client.listTools();
    expect(catalog.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "query_campaign_summary_get",
        `command_${command.id.replaceAll(".", "_")}`,
        "command_map_import-remote",
      ]),
    );
    const importTool = catalog.tools.find(
      (tool) => tool.name === "command_map_import-remote",
    );
    expect(
      (importTool?.inputSchema.properties?.input as { properties?: object })
        .properties,
    ).not.toHaveProperty("campaignId");

    const query = await client.callTool({
      name: "query_campaign_summary_get",
      arguments: {},
    });
    expect(query.structuredContent).toEqual({ campaignId: "campaign-1" });

    const pending = await client.callTool({
      name: `command_${command.id.replaceAll(".", "_")}`,
      arguments: {
        input: { effect: "rain" },
        idempotencyKey: "request-1234",
      },
    });
    expect(pending.structuredContent).toMatchObject({
      confirmationRequired: true,
      confirmationId: "confirmation-1",
    });

    const executed = await client.callTool({
      name: `command_${command.id.replaceAll(".", "_")}`,
      arguments: {
        input: { effect: "rain" },
        idempotencyKey: "request-1234",
        confirmationId: "confirmation-1",
      },
    });
    expect(executed.structuredContent).toEqual({ result: "rain" });
    expect(createConfirmation).toHaveBeenCalledTimes(1);
    expect(consumeApprovedConfirmationById).toHaveBeenCalledTimes(1);

    await client.close();
    await server.close();
  });

  it("imports a remote map through MCP without a second approval ceremony", async () => {
    const applicationHost = new ApplicationHost();
    const execute = jest.fn(async (input: Record<string, unknown>) => ({
      assetId: "asset-1",
      mapId: "map-1",
      name: input.name,
      imageUrl: "/api/assets/maps/asset-1",
      width: input.width,
      height: input.height,
      gridSize: input.gridSize,
      active: true,
    }));
    applicationHost.register({
      metadata: {
        id: IMPORT_REMOTE_MAP,
        version: "1",
        risk: "MEDIUM",
        permissions: ["WRITE", "EXECUTE"],
      },
      execute,
    });
    const createConfirmation = jest.fn();
    const server = createCozyVttMcpServer(
      {
        credentialId: "credential-1",
        delegatedUserId: "user-1",
        campaignId: "campaign-1",
        expiresAt: null,
      },
      {
        access: { createConfirmation } as unknown as AgentAccessRepository,
        audit: { append: async () => undefined },
        idempotency: {
          register: async () => "CREATED",
          complete: async () => undefined,
        },
        applicationHost,
        queryHost: new QueryHost(),
        extensionRuntime: () => {
          throw new Error("extensions disabled");
        },
      },
    );
    const client = new Client({ name: "test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: "command_map_import-remote",
      arguments: {
        input: {
          sourceUrl: "https://example.com/dungeon.jpg",
          name: "Dungeon",
          width: 41,
          height: 29,
          gridSize: 32,
        },
        idempotencyKey: "map-import-1234",
      },
    });
    expect(result.structuredContent).toMatchObject({
      assetId: "asset-1",
      mapId: "map-1",
      active: true,
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "campaign-1" }),
      expect.objectContaining({
        origin: "AGENT",
        delegatedIdentity: "user-1",
      }),
    );
    expect(createConfirmation).not.toHaveBeenCalled();

    await client.close();
    await server.close();
  });
});
