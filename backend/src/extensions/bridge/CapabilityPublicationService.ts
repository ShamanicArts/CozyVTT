import type { PublishedCapabilityInvocationContext, PublishedCapabilityInvocation, PublishedCapabilityInvocationResult, PublishedCapabilityCatalogEntry } from './contracts';
import type { ExtensionCommandBridge } from './ExtensionCommandBridge';

/** Transport-neutral facade for a future plugin, CLI, or UI capability adapter. */
export class CapabilityPublicationService {
  constructor(private readonly bridge: ExtensionCommandBridge) {}

  listCatalog(context: PublishedCapabilityInvocationContext): Promise<PublishedCapabilityCatalogEntry[]> {
    return this.bridge.listCatalog(context);
  }

  invoke(invocation: PublishedCapabilityInvocation): Promise<PublishedCapabilityInvocationResult> {
    return this.bridge.invoke(invocation);
  }
}
