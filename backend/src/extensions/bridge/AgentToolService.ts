import type { AgentToolInvocationContext, AgentToolInvocation, AgentToolInvocationResult, AgentToolCatalogEntry } from './contracts';
import type { ExtensionCommandBridge } from './ExtensionCommandBridge';

/** Transport-neutral facade for a future MCP, CLI, or UI agent adapter. */
export class AgentToolService {
  constructor(private readonly bridge: ExtensionCommandBridge) {}

  listCatalog(context: AgentToolInvocationContext): Promise<AgentToolCatalogEntry[]> {
    return this.bridge.listCatalog(context);
  }

  invoke(invocation: AgentToolInvocation): Promise<AgentToolInvocationResult> {
    return this.bridge.invoke(invocation);
  }
}
