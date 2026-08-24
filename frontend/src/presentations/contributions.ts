import type { ActiveExtensionPresentationContribution } from "@/types/extensions";
import {
  CAMPAIGN_PRESENTATION_CONTRACT_VERSION,
  type ImperativeCampaignPresentationContribution,
} from "./contracts";
import type { PresentationRegistry } from "./PresentationRegistry";

export interface CampaignPresentationPluginContribution {
  readonly id: string;
  readonly title: string;
  readonly activate: ImperativeCampaignPresentationContribution["activate"];
}

export interface CampaignPresentationPluginApi {
  readonly contractVersion: typeof CAMPAIGN_PRESENTATION_CONTRACT_VERSION;
  registerPresentation(
    contribution: CampaignPresentationPluginContribution,
  ): () => void;
}

export type CampaignPresentationModuleImporter = (
  url: string,
) => Promise<unknown>;

type CampaignPresentationActivator = (
  api: CampaignPresentationPluginApi,
) => void | (() => void) | Promise<void | (() => void)>;

const runtimeImport: CampaignPresentationModuleImporter = (url) =>
  import(/* @vite-ignore */ url) as Promise<unknown>;

/** Loads campaign-authorized modules and owns every registration they create. */
export async function activatePresentationContributions(
  registry: PresentationRegistry,
  contributions: readonly ActiveExtensionPresentationContribution[],
  importer: CampaignPresentationModuleImporter = runtimeImport,
): Promise<() => void> {
  const contributionDisposers: Array<() => void> = [];

  for (const contribution of contributions) {
    if (
      contribution.presentation.contractVersion !==
      CAMPAIGN_PRESENTATION_CONTRACT_VERSION
    )
      continue;

    const ownedDisposers: Array<() => void> = [];
    try {
      const imported = await importer(contribution.presentation.moduleUrl);
      const activate = readActivator(imported);
      const dispose = await activate(
        createOwnedApi(registry, contribution.extensionId, ownedDisposers),
      );
      if (typeof dispose === "function" && !ownedDisposers.includes(dispose))
        ownedDisposers.push(dispose);
      contributionDisposers.push(() => disposeAll(ownedDisposers));
    } catch (error) {
      disposeAll(ownedDisposers);
      console.error(
        `[CozyVTT presentation] Could not activate ${contribution.extensionId}/${contribution.presentation.id}.`,
        error,
      );
    }
  }

  return () => disposeAll(contributionDisposers);
}

function createOwnedApi(
  registry: PresentationRegistry,
  extensionId: string,
  disposers: Array<() => void>,
): CampaignPresentationPluginApi {
  return {
    contractVersion: CAMPAIGN_PRESENTATION_CONTRACT_VERSION,
    registerPresentation: (contribution) => {
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(contribution.id)) {
        throw new Error("Presentation ids must be lowercase kebab-case.");
      }
      const registration = registry.register({
        contractVersion: CAMPAIGN_PRESENTATION_CONTRACT_VERSION,
        id: `${extensionId}.${contribution.id}`,
        ownerId: extensionId,
        title: contribution.title,
        kind: "imperative",
        activate: contribution.activate,
      });
      const dispose = () => registration.dispose();
      disposers.push(dispose);
      return dispose;
    },
  };
}

function readActivator(imported: unknown): CampaignPresentationActivator {
  if (typeof imported !== "object" || imported === null) {
    throw new Error(
      "Presentation module must export activateCampaignPresentation.",
    );
  }
  const activate = (imported as Record<string, unknown>)[
    "activateCampaignPresentation"
  ];
  if (typeof activate !== "function") {
    throw new Error(
      "Presentation module must export activateCampaignPresentation.",
    );
  }
  return activate as CampaignPresentationActivator;
}

function disposeAll(disposers: Array<() => void>): void {
  for (const dispose of disposers.splice(0).reverse()) {
    try {
      dispose();
    } catch (error) {
      console.error("[CozyVTT presentation] Contribution cleanup failed.", error);
    }
  }
}
