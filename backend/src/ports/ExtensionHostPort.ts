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

export interface ActiveGameSystemContribution {
  extensionId: string;
  gameSystem: {
    id: string;
    name: string;
    shortName: string;
    description: string;
    contractVersion: "1";
    selectable: boolean;
    characterDataSchema: Readonly<Record<string, unknown>>;
    characterTemplates: readonly {
      id: string;
      name: string;
      description: string;
      data: Readonly<Record<string, unknown>>;
    }[];
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
  listActiveGameSystemContributions(): Promise<ActiveGameSystemContribution[]>;
  readActiveRendererModule(
    extensionId: string,
    rendererId: string,
  ): Promise<{ checksum: string; contents: Buffer }>;
  readActivePresentationModule(
    extensionId: string,
    presentationId: string,
    role: CampaignPresentationRole,
  ): Promise<{ checksum: string; contents: Buffer }>;
  readActiveGameSystemModule(
    extensionId: string,
    gameSystemId: string,
  ): Promise<{ checksum: string; contents: Buffer }>;
}
