export type ExtensionInstallMode = "trusted" | "sandboxed";
export type ExtensionInstallationState = "installed" | "active" | "error";
export type ExtensionGrantPrincipal = "USER" | "PLUGIN" | "SYSTEM";
export type ExtensionGrantPermission = "READ" | "WRITE" | "EXECUTE" | "ADMIN";

export interface ExtensionThemeContribution {
  id: string;
  name: string;
  contractVersion: "1.0";
  tokens: Record<string, string>;
  treatments?: {
    pageBackground?: {
      kind: "linear-gradient";
      angle: number;
      stops: Array<{ token: string; position: number }>;
    };
  };
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

export interface ExtensionPresentationContribution {
  id: string;
  name: string;
  contractVersion: "1";
  moduleUrl: string;
}

export interface ActiveExtensionPresentationContribution {
  extensionId: string;
  presentation: ExtensionPresentationContribution;
}

export interface ActiveExtensionContributions {
  themes: ActiveExtensionThemeContribution[];
  renderers: ActiveExtensionRendererContribution[];
  presentations: ActiveExtensionPresentationContribution[];
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
      capabilities?: string[];
      permissions?: string[];
      commands?: Array<{
        id: string;
        title: string;
        description: string;
      }>;
      publishedCapabilities?: Array<{
        id: string;
        title: string;
        description: string;
        commandId: string;
      }>;
      httpRoutes?: Array<{
        id: string;
        method: string;
        path: string;
      }>;
    };
    contributions?: {
      themes?: ExtensionThemeContribution[];
      renderers?: Array<{
        id: string;
        name: string;
        contractVersion: "1.0.0";
        browserEntrypoint: string;
      }>;
      presentations?: Array<{
        id: string;
        name: string;
        contractVersion: "1";
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

export interface PluginCredential {
  id: string;
  campaignId: string;
  label: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface PendingCapabilityApproval {
  id: string;
  campaignId: string;
  extensionId: string;
  commandId: string;
  state: "PENDING";
  displayMetadata: {
    capabilityTitle: string;
    capabilityVersion: string;
    campaignLabel: string;
    integrationLabel: string;
    riskExplanation: string;
    summary: Record<string, string | number | boolean>;
  };
  expiresAt: string;
  createdAt: string;
}

export interface OAuthConsentRequest {
  requestId: string;
  clientName: string;
  resource: { pluginId: string; resourceId: string; scopes: string[] };
  campaigns: Array<{ id: string; name: string; role: string }>;
  expiresAt: string;
}
