import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({
  api: {
    listCampaigns: vi.fn(),
    listPluginCredentials: vi.fn(),
    listPendingCapabilityApprovals: vi.fn(),
    revokePluginCredential: vi.fn(),
    approveCapabilityApproval: vi.fn(),
    denyCapabilityApproval: vi.fn(),
  },
}));

vi.mock("@/services/api", () => ({ api }));

import ConnectedPluginsPanel from "../ConnectedPluginsPanel";

describe("ConnectedPluginsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listCampaigns.mockResolvedValue({
      campaigns: [{ id: "campaign-1", name: "Lantern", members: [] }],
    });
    api.listPluginCredentials.mockResolvedValue([
      {
        id: "credential-1",
        campaignId: "campaign-1",
        label: "Existing",
        expiresAt: null,
        revokedAt: null,
      },
    ]);
    api.listPendingCapabilityApprovals.mockResolvedValue([
      {
        id: "approval-1",
        campaignId: "campaign-1",
        extensionId: "cozyvtt.public-capabilities",
        commandId: "campaign.atmosphere.set",
        state: "PENDING",
        displayMetadata: {
          capabilityTitle: "Change the atmosphere",
          capabilityVersion: "1",
          campaignLabel: "Lantern",
          integrationLabel: "GM assistant",
          riskExplanation: "high risk action requested by a delegated integration",
          summary: {},
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2026-01-01T01:00:00.000Z",
      },
    ]);
  });

  it("shows connected plugins without transport-specific setup", async () => {
    render(<ConnectedPluginsPanel />);
    await screen.findByText("Existing");
    expect(screen.getByText("Connected plugins")).toBeInTheDocument();
    expect(screen.queryByText(/setup url/i)).not.toBeInTheDocument();
  });

  it("approves a pending approval without rendering its command input", async () => {
    const user = userEvent.setup();
    api.approveCapabilityApproval.mockResolvedValue({ approved: true });
    render(<ConnectedPluginsPanel />);
    await screen.findByText("Change the atmosphere");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(api.approveCapabilityApproval).toHaveBeenCalledWith(
        "approval-1",
      ),
    );
    expect(
      screen.queryByText("Change the atmosphere"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/receipt/i)).not.toBeInTheDocument();
  });
});
