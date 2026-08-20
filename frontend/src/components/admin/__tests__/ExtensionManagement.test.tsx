import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { api } = vi.hoisted(() => ({
  api: {
    listExtensionPackages: vi.fn(),
    listExtensionInstallations: vi.fn(),
    listExtensionGrants: vi.fn(),
    adminListAllCampaigns: vi.fn(),
    installExtension: vi.fn(),
    activateExtension: vi.fn(),
    deactivateExtension: vi.fn(),
    uninstallExtension: vi.fn(),
    createExtensionGrant: vi.fn(),
    revokeExtensionGrant: vi.fn(),
  },
}));

vi.mock("@/services/api", () => ({ api }));

import ExtensionManagement from "../ExtensionManagement";

describe("ExtensionManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listExtensionPackages.mockResolvedValue([
      {
        id: "example.weather",
        version: "1.0.0",
        checksum: "sha256:abc",
        dependencies: {},
      },
    ]);
    api.listExtensionInstallations.mockResolvedValue([]);
    api.listExtensionGrants.mockResolvedValue([]);
    api.adminListAllCampaigns.mockResolvedValue({
      campaigns: [{ id: "campaign-1", name: "Lantern", members: [] }],
    });
    api.installExtension.mockResolvedValue({ extensionId: "example.weather" });
  });

  it("offers explicit trusted and sandboxed installation boundaries", async () => {
    const user = userEvent.setup();
    render(<ExtensionManagement />);
    await screen.findByRole("button", { name: "Install sandboxed" });
    expect(
      screen.getByText(/normal user MCP connections do not require/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Install sandboxed" }));
    await waitFor(() =>
      expect(api.installExtension).toHaveBeenCalledWith(
        "example.weather",
        "sandboxed",
      ),
    );
  });
});
