import type { ReactNode } from "react";
import type { WorkspaceLayoutContext } from "@/layout";

export const CAMPAIGN_PRESENTATION_CONTRACT_VERSION = "1" as const;

export interface CampaignPresentationContext {
  readonly layout: WorkspaceLayoutContext;
}

interface CampaignPresentationContributionBase {
  readonly contractVersion: typeof CAMPAIGN_PRESENTATION_CONTRACT_VERSION;
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
}

/** Internal adapter for presentations bundled with CozyVTT. */
export interface ReactCampaignPresentationContribution
  extends CampaignPresentationContributionBase {
  readonly kind: "react";
  readonly render: (context: CampaignPresentationContext) => ReactNode;
}

export interface CampaignPresentationInstance {
  update(context: CampaignPresentationContext): void;
  resize(size: { readonly width: number; readonly height: number }): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

/** Framework-neutral lifecycle for future DOM, Canvas, and WebGL providers. */
export interface ImperativeCampaignPresentationContribution
  extends CampaignPresentationContributionBase {
  readonly kind: "imperative";
  activate(
    mount: HTMLElement,
    context: CampaignPresentationContext,
  ): CampaignPresentationInstance | Promise<CampaignPresentationInstance>;
}

export type CampaignPresentationContribution =
  | ReactCampaignPresentationContribution
  | ImperativeCampaignPresentationContribution;

export interface CampaignPresentationRegistration {
  dispose(): void;
}
