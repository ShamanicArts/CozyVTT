import type { ComponentType } from "react";

export const WORKSPACE_LAYOUT_CONTRACT_VERSION = "1" as const;

export type WorkspaceLayoutContractVersion =
  typeof WORKSPACE_LAYOUT_CONTRACT_VERSION;

export const workspaceLayoutRegions = [
  "campaign.header.tools",
  "campaign.navigator",
  "campaign.stage",
  "campaign.inspector",
] as const;

export type WorkspaceLayoutRegion = (typeof workspaceLayoutRegions)[number];

export type WorkspaceBreakpoint = "compact" | "medium" | "wide";
export type WorkspaceRole = "DM" | "PLAYER" | "SPECTATOR";

export interface WorkspaceLayoutContext {
  readonly breakpoint: WorkspaceBreakpoint;
  readonly role: WorkspaceRole;
}

export interface WorkspaceContributionVisibility {
  readonly breakpoints?: readonly WorkspaceBreakpoint[];
  readonly roles?: readonly WorkspaceRole[];
}

export interface WorkspaceContributionProps {
  readonly layoutContext: WorkspaceLayoutContext;
}

export interface WorkspaceLayoutContribution {
  readonly contractVersion: WorkspaceLayoutContractVersion;
  readonly id: string;
  readonly ownerId: string;
  readonly region: WorkspaceLayoutRegion;
  readonly title: string;
  readonly component: ComponentType<WorkspaceContributionProps>;
  readonly order?: number;
  readonly visibility?: WorkspaceContributionVisibility;
}

export interface WorkspaceContributionPlacement {
  readonly order?: number;
  readonly hidden?: boolean;
}

export interface ResolvedWorkspaceContribution extends WorkspaceLayoutContribution {
  readonly order: number;
  readonly hidden: boolean;
}

export interface WorkspaceLayoutRegistration {
  update(placement: WorkspaceContributionPlacement): void;
  dispose(): void;
}
