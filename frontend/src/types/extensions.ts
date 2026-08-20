export type ExtensionInstallMode = "trusted" | "sandboxed";
export type ExtensionInstallationState = "installed" | "active" | "error";
export type ExtensionGrantPrincipal = "USER" | "AGENT" | "SYSTEM";
export type ExtensionGrantPermission = "READ" | "WRITE" | "EXECUTE" | "ADMIN";

export interface ExtensionThemeContribution {
  id: string;
  name: string;
  contractVersion: "1.0";
  tokens: Record<string, string>;
}

export interface ActiveExtensionThemeContribution {
  extensionId: string;
  theme: ExtensionThemeContribution;
}

export interface ExtensionRendererContribution {
  id: string;
  name: string;
  contractVersion: "1.0.0";
  moduleUrl: string;
}

export interface ActiveExtensionRendererContribution {
  extensionId: string;
  renderer: ExtensionRendererContribution;
}

export interface ActiveExtensionContributions {
  themes: ActiveExtensionThemeContribution[];
  renderers: ActiveExtensionRendererContribution[];
}

export interface ExtensionPackage {
  id: string;
  version: string;
  checksum: string;
  dependencies: Record<string, string>;
}

export interface ExtensionInstallation {
  extensionId: string;
  version: string;
  packagePath: string;
  packageChecksum: string;
  installMode: ExtensionInstallMode;
  state: ExtensionInstallationState;
  lastError: string | null;
  installedAt: string;
  activatedAt: string | null;
  updatedAt: string;
  packageManifest: {
    manifest: {
      id: string;
      name?: string;
      version?: string;
      description?: string;
    };
    contributions?: {
      themes?: ExtensionThemeContribution[];
      renderers?: Array<{
        id: string;
        name: string;
        contractVersion: "1.0.0";
        browserEntrypoint: string;
      }>;
    };
  };
}

export interface ExtensionGrant {
  id: string;
  principalType: ExtensionGrantPrincipal;
  principalId: string;
  scopeCampaignId: string;
  extensionId: string;
  permission: ExtensionGrantPermission;
  expiresAt: string | null;
  revokedAt?: string | null;
  createdAt?: string;
}

export interface AgentCredential {
  id: string;
  campaignId: string;
  label: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface PendingAgentConfirmation {
  id: string;
  campaignId: string;
  extensionId: string;
  commandId: string;
  expiresAt: string;
  createdAt: string;
}

export interface McpAuthorizationRequest {
  requestId: string;
  clientName: string;
  campaigns: Array<{ id: string; name: string; role: string }>;
  expiresAt: string;
}
