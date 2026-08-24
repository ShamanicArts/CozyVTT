import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CAMPAIGN_PRESENTATION_CONTRACT_VERSION,
  CampaignStageHost,
  PresentationRegistry,
  type CampaignPresentationContext,
  type CampaignPresentationInstance,
  type ImperativeCampaignPresentationContribution,
  type ReactCampaignPresentationContribution,
} from "@/presentations";
import { CampaignRole } from "@/types";

const context: CampaignPresentationContext = {
  layout: { breakpoint: "wide", role: "DM" },
  campaignId: "campaign-1",
  scene: {
    getSnapshot: () => ({
      version: "1",
      campaignId: "campaign-1",
      role: CampaignRole.DM,
      selectedTokenId: null,
      interaction: {
        mode: "none",
        ruler: { origin: null, color: "amber" },
        aoe: { origin: null, shape: "sphere", sizeFt: 20 },
        pings: [],
      },
      map: null,
    }),
    subscribe: () => () => {},
    selectToken: () => {},
    setInteractionMode: () => {},
    setRulerOrigin: () => {},
    setRulerColor: () => {},
    setAoE: () => {},
    ping: () => {},
    moveToken: async () => {},
  },
};

function reactPresentation(
  id: string,
  label: string,
): ReactCampaignPresentationContribution {
  return {
    contractVersion: CAMPAIGN_PRESENTATION_CONTRACT_VERSION,
    id,
    ownerId: "cozyvtt.core",
    title: label,
    kind: "react",
    render: () => <div>{label}</div>,
  };
}

describe("CampaignStageHost", () => {
  it("mounts exactly one active presentation", () => {
    const registry = new PresentationRegistry();
    registry.register(reactPresentation("map", "Map presentation"));
    registry.register(reactPresentation("vista", "Vista presentation"));

    const { container } = render(
      <CampaignStageHost
        registry={registry}
        activePresentationId="vista"
        fallbackPresentationId="map"
        context={context}
      />,
    );

    expect(screen.getByText("Vista presentation")).toBeInTheDocument();
    expect(screen.queryByText("Map presentation")).not.toBeInTheDocument();
    expect(
      container.querySelectorAll("[data-campaign-presentation]"),
    ).toHaveLength(1);
  });

  it("reacts to registry changes and uses the built-in fallback", () => {
    const registry = new PresentationRegistry();
    const fallback = reactPresentation("map", "Map presentation");
    const registration = registry.register(
      reactPresentation("vista", "Vista presentation"),
    );

    render(
      <CampaignStageHost
        registry={registry}
        activePresentationId="vista"
        fallbackPresentationId="map"
        context={context}
      />,
    );
    expect(screen.getByText("Vista presentation")).toBeInTheDocument();

    act(() => {
      registry.register(fallback);
      registration.dispose();
    });
    expect(screen.getByText("Map presentation")).toBeInTheDocument();
  });

  it("disposes an imperative presentation when the stage unmounts", async () => {
    const registry = new PresentationRegistry();
    const instance: CampaignPresentationInstance = {
      update: vi.fn(),
      resize: vi.fn(),
      setVisible: vi.fn(),
      dispose: vi.fn(),
    };
    const contribution: ImperativeCampaignPresentationContribution = {
      contractVersion: CAMPAIGN_PRESENTATION_CONTRACT_VERSION,
      id: "three-dimensional-map",
      ownerId: "example.three",
      title: "3D Map",
      kind: "imperative",
      activate: vi.fn(async () => instance),
    };
    registry.register(contribution);

    const { unmount } = render(
      <CampaignStageHost
        registry={registry}
        activePresentationId={contribution.id}
        fallbackPresentationId={contribution.id}
        context={context}
      />,
    );
    await waitFor(() => expect(contribution.activate).toHaveBeenCalledOnce());
    await waitFor(() => expect(instance.setVisible).toHaveBeenCalledWith(true));

    unmount();
    expect(instance.setVisible).toHaveBeenLastCalledWith(false);
    expect(instance.dispose).toHaveBeenCalledOnce();
  });

  it("publishes and clears imperative presentation commands with the lifecycle", async () => {
    const registry = new PresentationRegistry();
    const commands = [
      {
        id: "fit",
        title: "Fit map to screen",
        icon: "fit" as const,
        run: vi.fn(),
      },
    ];
    const instance: CampaignPresentationInstance = {
      commands,
      update: vi.fn(),
      resize: vi.fn(),
      setVisible: vi.fn(),
      dispose: vi.fn(),
    };
    const contribution: ImperativeCampaignPresentationContribution = {
      contractVersion: CAMPAIGN_PRESENTATION_CONTRACT_VERSION,
      id: "command-map",
      ownerId: "example.commands",
      title: "Command map",
      kind: "imperative",
      activate: vi.fn(async () => instance),
    };
    const onCommandsChanged = vi.fn();
    registry.register(contribution);

    const { unmount } = render(
      <CampaignStageHost
        registry={registry}
        activePresentationId={contribution.id}
        fallbackPresentationId={contribution.id}
        context={context}
        onCommandsChanged={onCommandsChanged}
      />,
    );

    await waitFor(() => expect(onCommandsChanged).toHaveBeenCalledWith(commands));
    unmount();
    expect(onCommandsChanged).toHaveBeenLastCalledWith([]);
  });

  it("updates an asynchronously activated presentation with the latest context", async () => {
    const registry = new PresentationRegistry();
    const instance: CampaignPresentationInstance = {
      update: vi.fn(),
      resize: vi.fn(),
      setVisible: vi.fn(),
      dispose: vi.fn(),
    };
    let finishActivation: ((value: CampaignPresentationInstance) => void) | null =
      null;
    const contribution: ImperativeCampaignPresentationContribution = {
      contractVersion: CAMPAIGN_PRESENTATION_CONTRACT_VERSION,
      id: "delayed-map",
      ownerId: "example.delayed",
      title: "Delayed map",
      kind: "imperative",
      activate: () =>
        new Promise((resolve) => {
          finishActivation = resolve;
        }),
    };
    registry.register(contribution);

    const { rerender } = render(
      <CampaignStageHost
        registry={registry}
        activePresentationId={contribution.id}
        fallbackPresentationId={contribution.id}
        context={context}
      />,
    );
    const compactContext: CampaignPresentationContext = {
      ...context,
      layout: { breakpoint: "compact", role: "PLAYER" },
    };
    rerender(
      <CampaignStageHost
        registry={registry}
        activePresentationId={contribution.id}
        fallbackPresentationId={contribution.id}
        context={compactContext}
      />,
    );

    await act(async () => finishActivation?.(instance));
    await waitFor(() => expect(instance.update).toHaveBeenCalledWith(compactContext));
  });

  it("contains a failed presentation and renders its fallback", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const registry = new PresentationRegistry();
    registry.register(reactPresentation("map", "Map presentation"));
    registry.register({
      ...reactPresentation("broken", "Broken presentation"),
      render: () => {
        throw new Error("render failed");
      },
    });

    render(
      <CampaignStageHost
        registry={registry}
        activePresentationId="broken"
        fallbackPresentationId="map"
        context={context}
      />,
    );

    expect(screen.getByText("Map presentation")).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
