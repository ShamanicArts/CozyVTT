import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({
  api: {
    listCampaigns: vi.fn(),
    listAgentCredentials: vi.fn(),
    listPendingAgentConfirmations: vi.fn(),
    issueAgentCredential: vi.fn(),
    revokeAgentCredential: vi.fn(),
    approveAgentConfirmation: vi.fn(),
    denyAgentConfirmation: vi.fn(),
  },
}));

vi.mock("@/services/api", () => ({ api }));

import AgentAccessPanel from "../AgentAccessPanel";

describe("AgentAccessPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listCampaigns.mockResolvedValue({
      campaigns: [{ id: "campaign-1", name: "Lantern", members: [] }],
    });
    api.listAgentCredentials.mockResolvedValue([
      {
        id: "credential-1",
        campaignId: "campaign-1",
        label: "Existing",
        expiresAt: null,
        revokedAt: null,
      },
    ]);
    api.listPendingAgentConfirmations.mockResolvedValue([
      {
        id: "confirmation-1",
        campaignId: "campaign-1",
        extensionId: "cozyvtt.core-agent",
        commandId: "campaign.atmosphere.set",
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-01T01:00:00.000Z",
      },
    ]);
  });

  it("reveals an issued credential once and does not expose hashes or agent input", async () => {
    const user = userEvent.setup();
    api.issueAgentCredential.mockResolvedValue({
      credential: {
        id: "credential-2",
        campaignId: "campaign-1",
        label: "Helper",
        expiresAt: null,
        revokedAt: null,
      },
      token: "plain-issued-token",
    });
    render(<AgentAccessPanel />);
    await screen.findByText("Existing");
    await user.type(screen.getByLabelText("Label"), "Helper");
    await user.click(screen.getByRole("button", { name: "Issue credential" }));
    expect(await screen.findByText("plain-issued-token")).toBeInTheDocument();
    expect(screen.queryByText(/hash/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/input digest/i)).not.toBeInTheDocument();
  });

  it("approves a pending confirmation without rendering its command input", async () => {
    const user = userEvent.setup();
    api.approveAgentConfirmation.mockResolvedValue({
      receipt: "one-time-receipt",
      expiresInSeconds: 300,
    });
    render(<AgentAccessPanel />);
    await screen.findByText("campaign.atmosphere.set");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(api.approveAgentConfirmation).toHaveBeenCalledWith(
        "confirmation-1",
      ),
    );
    expect(
      screen.queryByText("campaign.atmosphere.set"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("one-time-receipt")).toBeInTheDocument();
  });
});
