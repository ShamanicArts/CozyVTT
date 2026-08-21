import { CommandBus } from "../../application/commands/CommandBus";
import { InMemoryExtensionPolicy } from "../../application/policy/ExtensionPolicy";
import { ApplicationHost } from "../../composition/ApplicationHost";
import { QueryHost } from "../../application/queries/QueryHost";
import { AGENT_SET_ATMOSPHERE_EFFECT } from "../../application/agents/AgentGmCommands";
import type { AgentAccessRepository } from "../../ports/AgentAccessRepository";
import { ExtensionCommandBridge } from "../bridge/ExtensionCommandBridge";
import { InMemoryAgentToolAudit } from "../bridge/contracts";
import { CoreApplicationGatewayFactory } from "../core/CoreApplicationGateway";
import type { ExtensionManifest } from "../contracts";
import type { ExtensionInstallation } from "../host/contracts";
import { ExtensionRegistry } from "../registry";
import type { NodeBubblewrapSandbox } from "./NodeBubblewrapSandbox";
import { SandboxRegistryProxy } from "./SandboxRegistryProxy";

const manifest: ExtensionManifest = {
  manifestVersion: "1.0",
  id: "cozyvtt.sandbox-director",
  name: "Sandbox director",
  version: "1.0.0",
  description: "Fixture",
  compatibility: { extensionApi: "^1.0.0", cozyVtt: "^1.1.0" },
  capabilities: ["commands", "agent-tools"],
  permissions: ["campaign.write"],
  commands: [
    {
      id: "director.act",
      version: "1.0.0",
      title: "Act",
      description: "Act",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      requiredPermissions: ["campaign.write"],
      idempotent: true,
    },
  ],
  agentTools: [
    {
      id: "director_act",
      title: "Act",
      description: "Act",
      commandId: "director.act",
      requiredPermissions: ["campaign.write"],
      risk: "low",
      confirmation: "never",
    },
  ],
};

describe("SandboxRegistryProxy core actions", () => {
  it("executes declared sandbox core actions through the scoped gateway", async () => {
    const registry = new ExtensionRegistry();
    const bus = new CommandBus();
    const bridge = new ExtensionCommandBridge(
      registry,
      bus,
      new InMemoryExtensionPolicy([
        {
          principalId: "credential-1",
          campaignId: "campaign-1",
          extensionId: manifest.id,
          permissions: ["campaign.write"],
        },
      ]),
      new InMemoryAgentToolAudit(),
      [],
    );
    const sandbox = {
      invokeWithCoreActions: jest.fn(async () => ({
        result: { ok: true },
        coreActions: [
          { commandId: AGENT_SET_ATMOSPHERE_EFFECT, input: { effect: "rain" } },
        ],
      })),
    } as unknown as NodeBubblewrapSandbox;
    const application = new ApplicationHost();
    const setEffect = jest.fn(async () => "rain");
    application.register({
      metadata: {
        id: AGENT_SET_ATMOSPHERE_EFFECT,
        version: "1",
        risk: "MEDIUM",
        permissions: ["WRITE", "EXECUTE"],
      },
      execute: setEffect,
    });
    const core = new CoreApplicationGatewayFactory(
      application,
      new QueryHost(),
      {
        findCredentialById: async () => ({
          id: "credential-1",
          delegatedUserId: "dm-1",
          campaignId: "campaign-1",
        }),
      } as unknown as AgentAccessRepository,
    );
    const proxy = new SandboxRegistryProxy(
      registry,
      bus,
      bridge,
      sandbox,
      core,
    );
    await proxy.activate({
      extensionId: manifest.id,
      state: "active",
      mode: "SANDBOXED",
      packagePath: "fixture",
      packageChecksum: "sha256:fixture",
      packageManifest: { manifest, entrypoint: "runner.js", dependencies: {} },
    } as unknown as ExtensionInstallation);

    await bridge.invoke({
      principal: { id: "credential-1", kind: "agent" },
      scope: { campaignId: "campaign-1" },
      toolId: "director_act",
      input: {},
    });
    expect(setEffect).toHaveBeenCalledWith(
      { effect: "rain", campaignId: "campaign-1" },
      expect.objectContaining({ delegatedIdentity: "dm-1" }),
    );
  });
});
