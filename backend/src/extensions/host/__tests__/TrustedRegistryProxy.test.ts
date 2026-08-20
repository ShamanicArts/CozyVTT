import { CommandBus } from "../../../application/commands/CommandBus";
import { InMemoryExtensionPolicy } from "../../../application/policy/ExtensionPolicy";
import { ExtensionCommandBridge } from "../../bridge/ExtensionCommandBridge";
import { InMemoryAgentToolAudit } from "../../bridge/contracts";
import type { ExtensionManifest, ExtensionModule } from "../../contracts";
import { ExtensionRegistry } from "../../registry";
import { TrustedRegistryProxy } from "../TrustedRegistryProxy";

const manifest: ExtensionManifest = {
  manifestVersion: "1.0",
  id: "cozyvtt.trusted-notes",
  name: "Trusted notes",
  version: "1.0.0",
  description: "Trusted command fixture",
  compatibility: { extensionApi: "^1.0.0", cozyVtt: "^1.1.0" },
  capabilities: ["commands", "agent-tools"],
  permissions: ["campaign.write"],
  commands: [
    {
      id: "trusted.note.create",
      version: "1.0.0",
      title: "Create note",
      description: "Create a trusted note",
      inputSchema: {
        type: "object",
        properties: { note: { type: "string" } },
        required: ["note"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: {
          note: { type: "string" },
          campaignId: { type: "string" },
        },
        required: ["note", "campaignId"],
        additionalProperties: false,
      },
      requiredPermissions: ["campaign.write"],
      idempotent: false,
    },
  ],
  agentTools: [
    {
      id: "trusted_note_create",
      title: "Create note",
      description: "Create a trusted note",
      commandId: "trusted.note.create",
      requiredPermissions: ["campaign.write"],
      risk: "low",
      confirmation: "never",
    },
  ],
};

describe("TrustedRegistryProxy", () => {
  function setup() {
    const registry = new ExtensionRegistry();
    const bus = new CommandBus();
    const policy = new InMemoryExtensionPolicy([
      {
        principalId: "agent-1",
        campaignId: "campaign-1",
        extensionId: manifest.id,
        permissions: ["campaign.write"],
      },
    ]);
    const bridge = new ExtensionCommandBridge(
      registry,
      bus,
      policy,
      new InMemoryAgentToolAudit(),
      [],
    );
    return {
      registry,
      bus,
      bridge,
      proxy: new TrustedRegistryProxy(registry, bus, bridge),
    };
  }

  it("executes reviewed handlers through the guarded bridge and removes them on deactivation", async () => {
    const { bus, bridge, proxy } = setup();
    const execute = jest.fn(async (input, context) => ({
      note: input.note,
      campaignId: context.scope.campaignId,
    }));
    const module: ExtensionModule = {
      manifest,
      commandHandlers: { "trusted.note.create": execute },
    };

    await proxy.install(module);
    await proxy.activate(manifest.id);
    await expect(
      bridge.invoke({
        principal: { id: "agent-1", kind: "agent" },
        scope: { campaignId: "campaign-1" },
        toolId: "trusted_note_create",
        input: { note: "Ash at the gate" },
      }),
    ).resolves.toMatchObject({
      result: { data: { note: "Ash at the gate", campaignId: "campaign-1" } },
    });
    expect(execute).toHaveBeenCalledWith(
      { note: "Ash at the gate" },
      expect.objectContaining({ scope: { campaignId: "campaign-1" } }),
    );

    await proxy.deactivate(manifest.id);
    expect(bus.has(`trusted.${manifest.id}.trusted.note.create`)).toBe(false);
    await expect(
      bridge.invoke({
        principal: { id: "agent-1", kind: "agent" },
        scope: { campaignId: "campaign-1" },
        toolId: "trusted_note_create",
        input: { note: "No longer reachable" },
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN_TOOL" });
  });

  it("rejects a trusted module whose executable handlers do not match its manifest", async () => {
    const { proxy } = setup();
    await expect(proxy.install({ manifest })).rejects.toThrow(
      "missing: trusted.note.create",
    );
    await expect(
      proxy.install({
        manifest,
        commandHandlers: {
          "trusted.note.create": async () => ({}),
          "undeclared.command": async () => ({}),
        },
      }),
    ).rejects.toThrow("undeclared: undeclared.command");
  });
});
