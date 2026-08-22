import type {
  Command,
  CommandBus,
  CommandHandler,
} from "../../application/commands/CommandBus";
import type { ExtensionCommandBridge } from "../bridge/ExtensionCommandBridge";
import type {
  PublishedCapabilityInvocationContext,
  CommandBinding,
} from "../bridge/contracts";
import type { ExtensionModule } from "../contracts";
import { ExtensionRegistry } from "../registry";
import type { ExtensionLifecycleRegistry } from "./ports";
import type { CoreApplicationGatewayFactory } from "../core/CoreApplicationGateway";
import type { TrustedHttpTransportRegistry } from "./TrustedHttpTransportRegistry";

interface TrustedExtensionCommand extends Command<unknown> {
  readonly type: string;
  readonly input: Record<string, unknown>;
  readonly context: PublishedCapabilityInvocationContext;
}

/**
 * Connects reviewed in-process extension code to the same guarded command
 * bridge used by sandboxed modules. Descriptor publication and executable
 * registration therefore share one lifecycle and are removed atomically.
 */
export class TrustedRegistryProxy implements ExtensionLifecycleRegistry {
  private readonly modules = new Map<string, ExtensionModule>();
  private readonly disposers = new Map<string, Array<() => void>>();

  public constructor(
    private readonly registry: ExtensionRegistry,
    private readonly commandBus: CommandBus,
    private readonly bridge: ExtensionCommandBridge,
    private readonly coreGateway?: CoreApplicationGatewayFactory,
    private readonly httpTransport?: TrustedHttpTransportRegistry,
  ) {}

  async install(module: ExtensionModule): Promise<unknown> {
    assertHandlerCoverage(module);
    const installed = await this.registry.install(module);
    this.modules.set(module.manifest.id, module);
    return installed;
  }

  async activate(extensionId: string): Promise<unknown> {
    const module = this.requireModule(extensionId);
    const disposers: Array<() => void> = [];
    try {
      for (const descriptor of module.manifest.commands) {
        const execute = module.commandHandlers?.[descriptor.id];
        if (!execute) throw new Error(`Missing handler for ${descriptor.id}`);
        const type = trustedCommandType(extensionId, descriptor.id);
        const handler: CommandHandler<TrustedExtensionCommand, unknown> = {
          execute: async (command) =>
            execute(command.input, {
              ...command.context,
              core: this.coreGateway?.create(
                extensionId,
                command.context,
                module.manifest.permissions,
              ),
            }),
        };
        disposers.push(this.commandBus.register(type, handler));
        const binding: CommandBinding = {
          commandId: descriptor.id,
          createCommand: (input, context) => ({ type, input, context }),
        };
        disposers.push(this.bridge.registerBinding(binding));
      }
      if (module.manifest.httpRoutes?.length) {
        if (!this.httpTransport) throw new Error("Trusted HTTP transport registry is unavailable");
        disposers.push(this.httpTransport.register(
          extensionId,
          module.manifest.httpRoutes,
          module.manifest.oauthResources ?? [],
          module.httpHandlers ?? {},
        ));
      }
      const activated = await this.registry.activate(extensionId);
      this.disposers.set(extensionId, disposers);
      return activated;
    } catch (error) {
      disposeAll(disposers);
      throw error;
    }
  }

  async deactivate(extensionId: string): Promise<unknown> {
    const deactivated = await this.registry.deactivate(extensionId);
    disposeAll(this.disposers.get(extensionId) ?? []);
    this.disposers.delete(extensionId);
    return deactivated;
  }

  async uninstall(extensionId: string): Promise<void> {
    await this.registry.uninstall(extensionId);
    disposeAll(this.disposers.get(extensionId) ?? []);
    this.disposers.delete(extensionId);
    this.modules.delete(extensionId);
  }

  getExtension(extensionId: string): unknown | undefined {
    return this.registry.getExtension(extensionId);
  }

  private requireModule(extensionId: string): ExtensionModule {
    const module = this.modules.get(extensionId);
    if (!module) throw new Error(`Extension ${extensionId} is not installed`);
    return module;
  }
}

function assertHandlerCoverage(module: ExtensionModule): void {
  const declared = new Set(module.manifest.commands.map(({ id }) => id));
  const implemented = Object.keys(module.commandHandlers ?? {});
  const missing = [...declared].filter((id) => !implemented.includes(id));
  const extra = implemented.filter((id) => !declared.has(id));
  if (missing.length || extra.length) {
    throw new Error(
      `Extension ${module.manifest.id} command handlers do not match its manifest` +
        `${missing.length ? `; missing: ${missing.join(", ")}` : ""}` +
        `${extra.length ? `; undeclared: ${extra.join(", ")}` : ""}`,
    );
  }
  const declaredRoutes = new Set((module.manifest.httpRoutes ?? []).map(({ id }) => id));
  const implementedRoutes = Object.keys(module.httpHandlers ?? {});
  const missingRoutes = [...declaredRoutes].filter((id) => !implementedRoutes.includes(id));
  const extraRoutes = implementedRoutes.filter((id) => !declaredRoutes.has(id));
  if (missingRoutes.length || extraRoutes.length) {
    throw new Error(
      `Extension ${module.manifest.id} HTTP handlers do not match its manifest` +
        `${missingRoutes.length ? `; missing: ${missingRoutes.join(", ")}` : ""}` +
        `${extraRoutes.length ? `; undeclared: ${extraRoutes.join(", ")}` : ""}`,
    );
  }
}

function trustedCommandType(extensionId: string, commandId: string): string {
  return `trusted.${extensionId}.${commandId}`;
}

function disposeAll(disposers: readonly (() => void)[]): void {
  for (const dispose of [...disposers].reverse()) dispose();
}
