import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/services/api";
import type { ActiveExtensionPresentationContribution } from "@/types/extensions";
import {
  activatePresentationContributions,
  type CampaignPresentationModuleImporter,
} from "./contributions";
import type { PresentationRegistry } from "./PresentationRegistry";

export type CampaignPresentationContributionLoader = (
  campaignId: string,
) => Promise<ActiveExtensionPresentationContribution[]>;

const loadProductionContributions: CampaignPresentationContributionLoader =
  (campaignId) => api.listActiveCampaignPresentationContributions(campaignId);

export function CampaignPresentationProvider({
  campaignId,
  registry,
  children,
  contributionLoader = loadProductionContributions,
  moduleImporter,
}: {
  readonly campaignId: string;
  readonly registry: PresentationRegistry;
  readonly children: ReactNode;
  readonly contributionLoader?: CampaignPresentationContributionLoader;
  readonly moduleImporter?: CampaignPresentationModuleImporter;
}) {
  const [contributionRevision, setContributionRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setContributionRevision((revision) => revision + 1);
    window.addEventListener("cozyvtt:extensions-changed", refresh);
    return () =>
      window.removeEventListener("cozyvtt:extensions-changed", refresh);
  }, []);

  useEffect(() => {
    let active = true;
    let dispose = () => {};
    contributionLoader(campaignId)
      .then((contributions) =>
        activatePresentationContributions(
          registry,
          contributions,
          moduleImporter,
        ),
      )
      .then((cleanup) => {
        if (active) dispose = cleanup;
        else cleanup();
      })
      .catch(() => {
        // Presentations are optional; the built-in campaign stage remains.
      });
    return () => {
      active = false;
      dispose();
    };
  }, [campaignId, contributionLoader, contributionRevision, moduleImporter, registry]);

  return children;
}
