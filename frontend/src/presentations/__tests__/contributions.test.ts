import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activatePresentationContributions,
  PresentationRegistry,
  type CampaignPresentationPluginApi,
} from "@/presentations";
import type { ActiveExtensionPresentationContribution } from "@/types/extensions";

const contribution: ActiveExtensionPresentationContribution = {
  extensionId: "example.vista",
  presentation: {
    id: "campaign-vista",
    name: "Campaign Vista",
    contractVersion: "1",
    moduleUrl: "/campaign-vista.mjs",
  },
};

describe("campaign presentation contributions", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("qualifies registrations by extension and cleans up only its registration", async () => {
    const registry = new PresentationRegistry();
    const core = {
      contractVersion: "1" as const,
      id: "cozyvtt.core.map-2d",
      ownerId: "cozyvtt.core",
      title: "Map",
      kind: "react" as const,
      render: () => null,
    };
    registry.register(core);

    const cleanup = await activatePresentationContributions(
      registry,
      [contribution],
      async () => ({
        activateCampaignPresentation: (api: CampaignPresentationPluginApi) =>
          api.registerPresentation({
            id: "vista",
            title: "Vista",
            activate: () => ({
              update: () => {},
              resize: () => {},
              setVisible: () => {},
              dispose: () => {},
            }),
          }),
      }),
    );

    expect(registry.get("example.vista.vista")).toMatchObject({
      ownerId: "example.vista",
      kind: "imperative",
      title: "Vista",
    });
    cleanup();
    cleanup();
    expect(registry.get("example.vista.vista")).toBeUndefined();
    expect(registry.get(core.id)).toBe(core);
  });

  it("requires the named activator export and removes partial registrations", async () => {
    const registry = new PresentationRegistry();
    const activate = (api: CampaignPresentationPluginApi) => {
      api.registerPresentation({
        id: "temporary",
        title: "Temporary",
        activate: () => {
          throw new Error("not mounted in this test");
        },
      });
      throw new Error("activation failed");
    };

    await activatePresentationContributions(registry, [contribution], async () => ({
      activateCampaignPresentation: activate,
    }));
    await activatePresentationContributions(registry, [contribution], async () => ({
      default: activate,
    }));

    expect(registry.get("example.vista.temporary")).toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it("rejects unqualified local ids before they reach the registry", async () => {
    const registry = new PresentationRegistry();

    await activatePresentationContributions(registry, [contribution], async () => ({
      activateCampaignPresentation: (api: CampaignPresentationPluginApi) =>
        api.registerPresentation({
          id: "other.owner.vista",
          title: "Vista",
          activate: () => {
            throw new Error("not mounted in this test");
          },
        }),
    }));

    expect(registry.get("other.owner.vista")).toBeUndefined();
    expect(console.error).toHaveBeenCalledOnce();
  });
});
