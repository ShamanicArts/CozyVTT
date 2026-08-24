import { describe, expect, it, vi } from "vitest";
import {
  CAMPAIGN_PRESENTATION_CONTRACT_VERSION,
  PresentationRegistrationError,
  PresentationRegistry,
  type ReactCampaignPresentationContribution,
} from "@/presentations";

function presentation(
  overrides: Partial<ReactCampaignPresentationContribution> = {},
): ReactCampaignPresentationContribution {
  return {
    contractVersion: CAMPAIGN_PRESENTATION_CONTRACT_VERSION,
    id: "cozyvtt.core.map-2d",
    ownerId: "cozyvtt.core",
    title: "Map",
    kind: "react",
    render: () => null,
    ...overrides,
  };
}

describe("PresentationRegistry", () => {
  it("resolves the active presentation and falls back when it is unavailable", () => {
    const registry = new PresentationRegistry();
    const map = presentation();
    const vista = presentation({
      id: "cozyvtt.core.vista",
      title: "Vista",
    });
    registry.register(map);
    registry.register(vista);

    expect(registry.resolve(vista.id, map.id)).toBe(vista);
    expect(registry.resolve("missing", map.id)).toBe(map);
  });

  it("uses identity-safe registration cleanup and owner-safe unregistration", () => {
    const registry = new PresentationRegistry();
    const listener = vi.fn();
    registry.subscribe(listener);
    const registration = registry.register(presentation());

    expect(registry.unregister("cozyvtt.core.map-2d", "someone.else")).toBe(
      false,
    );
    registration.dispose();
    registration.dispose();
    expect(registry.get("cozyvtt.core.map-2d")).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("rejects duplicate, incompatible, and incomplete registrations", () => {
    const registry = new PresentationRegistry();
    registry.register(presentation());

    expect(() => registry.register(presentation())).toThrow(
      PresentationRegistrationError,
    );
    expect(() =>
      new PresentationRegistry().register(
        presentation({
          // Deliberately exercise runtime validation at the host boundary.
          contractVersion: "2" as "1",
        }),
      ),
    ).toThrow(/supports 1/);
    expect(() =>
      new PresentationRegistry().register(presentation({ title: "" })),
    ).toThrow(/non-empty/);
  });
});
