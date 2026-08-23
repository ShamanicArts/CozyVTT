export interface ExtensionHostPort {
  listAvailable(): Promise<unknown[]>;
  list(): Promise<unknown[]>;
  install(packageId: string, mode: "trusted" | "sandboxed"): Promise<unknown>;
  activate(extensionId: string): Promise<unknown>;
  deactivate(extensionId: string): Promise<unknown>;
  uninstall(extensionId: string): Promise<void>;
  listActiveRendererContributions(): Promise<any[]>;
  listActiveThemeContributions(): Promise<any[]>;
  readActiveRendererModule(
    extensionId: string,
    rendererId: string,
  ): Promise<{ checksum: string; contents: Buffer }>;
}
