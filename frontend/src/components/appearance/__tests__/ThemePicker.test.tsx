import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { FONT_OPTIONS, PRESET_THEMES } from "@/themes";
import { THEME_CONTRACT_VERSION } from "@/theming";
import ThemePicker, { DEFAULT_CUSTOM_COLORS } from "../ThemePicker";

vi.mock("@/services/api", () => ({
  api: { getAppearance: vi.fn().mockRejectedValue(new Error("offline")) },
}));

describe("ThemePicker runtime catalogue", () => {
  it("shows and selects a validated extension theme", async () => {
    const onChange = vi.fn();
    const extensionTheme = {
      ...PRESET_THEMES[0],
      id: "example.theme-lantern",
      name: "Lantern Night",
      description: "Contributed locally",
      contractVersion: THEME_CONTRACT_VERSION,
    };
    render(
      <ThemeProvider
        contributionLoader={{
          loadActiveThemeManifests: async () => [extensionTheme],
        }}
      >
        <ThemePicker
          themeId={PRESET_THEMES[0].id}
          fontId="default"
          customColors={DEFAULT_CUSTOM_COLORS}
          onChange={onChange}
        />
      </ThemeProvider>,
    );

    const button = await screen.findByRole("button", {
      name: /Lantern Night/i,
    });
    await userEvent.click(button);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          themeId: "example.theme-lantern",
        }),
      ),
    );
  });

  it("loads every font stylesheet while previews are visible", () => {
    const { unmount } = render(
      <ThemePicker
        themeId={PRESET_THEMES[0].id}
        fontId="default"
        customColors={DEFAULT_CUSTOM_COLORS}
        onChange={vi.fn()}
      />,
    );

    for (const font of FONT_OPTIONS) {
      const link = document.getElementById(
        `theme-font-preview-${font.id}`,
      ) as HTMLLinkElement | null;
      expect(link?.href).toBe(font.googleImport);
      expect(screen.getByText(font.name)).toHaveStyle({
        fontFamily: font.heading,
      });
    }

    unmount();
    for (const font of FONT_OPTIONS) {
      expect(
        document.getElementById(`theme-font-preview-${font.id}`),
      ).not.toBeInTheDocument();
    }
  });
});
