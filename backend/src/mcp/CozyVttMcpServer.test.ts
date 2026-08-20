import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApplicationHost } from "../composition/ApplicationHost";
import { QueryHost } from "../application/queries/QueryHost";
import { CORE_AGENT_COMMANDS } from "../application/agents/CoreAgentCatalog";
import type { AgentAccessRepository } from "../ports/AgentAccessRepository";
import type {
  AgentAuditPort,
  ExtensionGrantPort,
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
    const command = CORE_AGENT_COMMANDS[0];
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
    const consumeApprovedConfirmation = jest.fn(async () => true);
    const access = {
      createConfirmation,
      consumeApprovedConfirmation,
    } as unknown as AgentAccessRepository;
    const grants: ExtensionGrantPort = { hasGrant: async () => true };
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
      },
      {
        access,
        grants,
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
    expect(catalog.tools.map((tool) => tool.name)).toEqual([
      "query_campaign_summary_get",
      `command_${command.id.replaceAll(".", "_")}`,
    ]);

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
        confirmationReceipt: "approved-receipt",
      },
    });
    expect(executed.structuredContent).toEqual({ result: "rain" });
    expect(createConfirmation).toHaveBeenCalledTimes(1);
    expect(consumeApprovedConfirmation).toHaveBeenCalledTimes(1);

    await client.close();
    await server.close();
  });
});
