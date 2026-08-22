import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({
  api: {
    getOAuthConsentRequest: vi.fn(),
    approveOAuthConsent: vi.fn(),
    denyOAuthConsent: vi.fn(),
  },
}));

vi.mock("@/services/api", () => ({ api }));

import OAuthAuthorizePage from "../OAuthAuthorizePage";

describe("OAuthAuthorizePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getOAuthConsentRequest.mockResolvedValue({
      requestId: "request-1",
      clientName: "Table helper",
      resource: { pluginId: "calendar-plugin", resourceId: "events", scopes: ["events:read"] },
      campaigns: [{ id: "campaign-1", name: "Lantern", role: "DM" }],
      expiresAt: "2026-08-21T12:00:00.000Z",
    });
  });

  it("offers one campaign approval without keys or administrator grants", async () => {
    render(
      <MemoryRouter initialEntries={["/oauth/authorize?request=request-1"]}>
        <OAuthAuthorizePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Table helper")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Lantern · dm" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Allow connection" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no API keys or administrator grants/i),
    ).toBeInTheDocument();
  });
});
