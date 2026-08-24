export interface ActiveRendererContribution {
  extensionId: string;
  renderer: {
    id: string;
    name: string;
    contractVersion: string;
  };
}

export type CampaignPresentationRole = "DM" | "PLAYER" | "SPECTATOR";

export interface ActiveCampaignPresentationContribution {
  extensionId: string;
  presentation: {
    id: string;
    title: string;
    contractVersion: "1";
  };
}

export interface ExtensionHostPort {
  listAvailable(): Promise<unknown[]>;
  list(): Promise<unknown[]>;
  install(packageId: string, mode: "trusted" | "sandboxed"): Promise<unknown>;
  activate(extensionId: string): Promise<unknown>;
  deactivate(extensionId: string): Promise<unknown>;
  uninstall(extensionId: string): Promise<void>;
  listActiveRendererContributions(): Promise<ActiveRendererContribution[]>;
  listActiveThemeContributions(): Promise<unknown[]>;
  listActivePresentationContributions(
    role: CampaignPresentationRole,
  ): Promise<ActiveCampaignPresentationContribution[]>;
  readActiveRendererModule(
    extensionId: string,
    rendererId: string,
  ): Promise<{ checksum: string; contents: Buffer }>;
  readActivePresentationModule(
    extensionId: string,
    presentationId: string,
    role: CampaignPresentationRole,
  ): Promise<{ checksum: string; contents: Buffer }>;
}
