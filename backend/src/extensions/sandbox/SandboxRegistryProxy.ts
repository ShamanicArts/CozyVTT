import type {
  CommandBus,
  CommandHandler,
} from "../../application/commands/CommandBus";
import type { ExtensionCommandBridge } from "../bridge/ExtensionCommandBridge";
import type {
  PublishedCapabilityInvocationContext,
  CommandBinding,
} from "../bridge/contracts";
import type { ExtensionModule } from "../contracts";
import type { ExtensionInstallation } from "../host/contracts";
import { ExtensionRegistry } from "../registry";
import { NodeBubblewrapSandbox } from "./NodeBubblewrapSandbox";
import type { CoreApplicationGatewayFactory } from "../core/CoreApplicationGateway";

interface SandboxCommand {
  readonly type: string;
  readonly input: Record<string, unknown>;
  readonly context: PublishedCapabilityInvocationContext;
}

/** Descriptor-only registration: the module has no lifecycle code and no package import. */
export class SandboxRegistryProxy {
  private readonly disposers = new Map<string, Array<() => void>>();
  public constructor(
    private readonly registry: ExtensionRegistry,
    private readonly commandBus: CommandBus,
    private readonly bridge: ExtensionCommandBridge,
    private readonly sandbox: NodeBubblewrapSandbox,
    private readonly coreGateway?: CoreApplicationGatewayFactory,
  ) {}
  async activate(installation: ExtensionInstallation): Promise<void> {
    const manifest = installation.packageManifest.manifest;
    if ((manifest.httpRoutes?.length ?? 0) > 0 || (manifest.oauthResources?.length ?? 0) > 0) {
      throw new Error("Sandboxed extensions cannot contribute HTTP transports");
    }
    const module: ExtensionModule = { manifest };
    if (!this.registry.getExtension(manifest.id))
      await this.registry.install(module);
    const disposers: Array<() => void> = [];
    for (const descriptor of manifest.commands) {
      const type = `sandbox.${manifest.id}.${descriptor.id}`;
      disposers.push(
        this.commandBus.register(type, {
          execute: async (command: SandboxCommand) => {
            const response = await this.sandbox.invokeWithCoreActions({
              extensionId: installation.extensionId,
              packagePath: installation.packagePath,
              checksum: installation.packageChecksum,
              method: "command",
              params: { commandId: descriptor.id, input: command.input },
              inputSchema: { type: "object" },
              outputSchema: descriptor.outputSchema,
            });
            if (response.coreActions.length) {
              if (!this.coreGateway) {
                throw new Error("Sandbox core gateway is unavailable");
              }
              const gateway = this.coreGateway.create(
                installation.extensionId,
                command.context,
                manifest.permissions,
              );
              for (const action of response.coreActions) {
                await gateway.dispatch(action.commandId, action.input, {
                  idempotencyKey: action.idempotencyKey,
                });
              }
            }
            return response.result;
          },
        } as CommandHandler<SandboxCommand, unknown>),
      );
      const binding: CommandBinding = {
        commandId: descriptor.id,
        createCommand: (
          input: Record<string, unknown>,
          context: PublishedCapabilityInvocationContext,
        ) => ({ type, input, context }),
      };
      disposers.push(this.bridge.registerBinding(binding));
    }
    this.disposers.set(manifest.id, disposers);
    await this.registry.activate(manifest.id);
  }
  async deactivate(extensionId: string): Promise<void> {
    if (this.registry.getExtension(extensionId)?.state === "active")
      await this.registry.deactivate(extensionId);
    for (const dispose of this.disposers.get(extensionId) ?? []) dispose();
    this.disposers.delete(extensionId);
  }
}
