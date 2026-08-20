import type { ExtensionInstallation } from "../host/contracts";
import type { SandboxedExtensionLifecycle } from "../host/ports";
import { NodeBubblewrapSandbox } from "./NodeBubblewrapSandbox";

export class SandboxedExtensionSupervisor implements SandboxedExtensionLifecycle {
  public constructor(private readonly sandbox: NodeBubblewrapSandbox) {}
  async activate(installation: ExtensionInstallation): Promise<void> {
    await this.call(installation, "activate");
  }
  async deactivate(installation: ExtensionInstallation): Promise<void> {
    await this.call(installation, "deactivate");
  }
  private async call(
    installation: ExtensionInstallation,
    method: "activate" | "deactivate",
  ): Promise<void> {
    await this.sandbox.invoke({
      extensionId: installation.extensionId,
      packagePath: installation.packagePath,
      checksum: installation.packageChecksum,
      method,
      params: {},
      inputSchema: {},
      outputSchema: {},
    });
  }
}
