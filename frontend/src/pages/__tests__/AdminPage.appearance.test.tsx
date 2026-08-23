import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "../AdminPage";

const { getSettings } = vi.hoisted(() => ({ getSettings: vi.fn() }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { displayName: "Admin" } }),
}));

vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
    availableThemes: [],
    refreshAppearance: vi.fn(),
  }),
}));

vi.mock("@/services/admin.service", () => ({
  adminService: {
    getStats: vi.fn(() => new Promise(() => {})),
    getSettings,
  },
}));

vi.mock("@/components/admin/ExtensionManagement", () => ({
  default: () => null,
}));

describe("AdminPage appearance", () => {
  beforeEach(() => {
    getSettings.mockReset();
  });

  it("selects the saved theme on the first rendered picker", async () => {
    let resolveSettings: (settings: object) => void = () => {};
    getSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveSettings = resolve;
      }),
    );

    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(getSettings).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: /Cozy Default/i }),
    ).not.toBeInTheDocument();

    await act(async () => {
      resolveSettings({
        id: "settings",
        instanceName: "CozyVTT",
        timezone: "UTC",
        allowRegistration: false,
        requireAdminApproval: true,
        themeId: "deep-dungeon",
        customThemeColors: null,
        fontId: "default",
        customLogoUrl: null,
        customFaviconUrl: null,
        customMascotUrl: null,
      });
    });

    expect(
      await screen.findByRole("button", { name: /Deep Dungeon/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /Cozy Default/i }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});
