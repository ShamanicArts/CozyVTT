import { ApplicationHost } from "../../composition/ApplicationHost";
import { QueryHost } from "../../application/queries/QueryHost";
import { AGENT_SET_ATMOSPHERE_EFFECT } from "../../application/agents/AgentGmCommands";
import type { AgentAccessRepository } from "../../ports/AgentAccessRepository";
import { CoreApplicationGatewayFactory } from "./CoreApplicationGateway";

describe("CoreApplicationGatewayFactory", () => {
  it("gives extensions the same campaign-scoped core command and query boundary", async () => {
    const application = new ApplicationHost();
    const execute = jest.fn(async (input: unknown, context: unknown) => {
      expect(context).toMatchObject({
        principalId: "credential-1",
        delegatedIdentity: "dm-1",
        campaignId: "campaign-1",
        origin: "AGENT",
      });
      return (input as { effect: string | null }).effect;
    });
    application.register({
      metadata: {
        id: AGENT_SET_ATMOSPHERE_EFFECT,
        version: "1",
        risk: "MEDIUM",
        permissions: ["WRITE", "EXECUTE"],
      },
      execute,
    });
    const queries = new QueryHost();
    queries.register({
      metadata: {
        id: "campaign.summary.get",
        version: "1",
        risk: "READ",
        inputSchema: { type: "object", additionalProperties: false },
        outputSchema: { type: "object" },
      },
      execute: async (_input, context) => ({ campaignId: context.campaignId }),
    });
    const access = {
      findCredentialById: async () => ({
        id: "credential-1",
        delegatedUserId: "dm-1",
        campaignId: "campaign-1",
        label: "fixture",
        expiresAt: null,
        revokedAt: null,
      }),
    } as unknown as AgentAccessRepository;
    const gateway = new CoreApplicationGatewayFactory(
      application,
      queries,
      access,
    ).create("cozyvtt.encounter-director", {
      principal: { id: "credential-1", kind: "agent" },
      scope: { campaignId: "campaign-1" },
    });

    await expect(
      gateway.dispatch(AGENT_SET_ATMOSPHERE_EFFECT, { effect: "mist" }),
    ).resolves.toBe("mist");
    await expect(gateway.query("campaign.summary.get", {})).resolves.toEqual({
      campaignId: "campaign-1",
    });
    expect(execute).toHaveBeenCalledWith(
      { campaignId: "campaign-1", effect: "mist" },
      expect.anything(),
    );
    expect(gateway.listCommands()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "agent.actor.spawn" }),
      ]),
    );
  });

  it("rejects command IDs outside the public core catalog and campaign escape", async () => {
    const gateway = new CoreApplicationGatewayFactory(
      new ApplicationHost(),
      new QueryHost(),
      {
        findCredentialById: async () => ({
          id: "credential-1",
          delegatedUserId: "dm-1",
          campaignId: "campaign-1",
        }),
      } as unknown as AgentAccessRepository,
    ).create("cozyvtt.fixture", {
      principal: { id: "credential-1", kind: "agent" },
      scope: { campaignId: "campaign-1" },
    });
    await expect(gateway.dispatch("admin.backup.delete", {})).rejects.toThrow(
      "not extension-callable",
    );
    await expect(
      gateway.dispatch(AGENT_SET_ATMOSPHERE_EFFECT, {
        campaignId: "other-campaign",
        effect: "rain",
      }),
    ).rejects.toThrow("cannot escape");
  });
});
