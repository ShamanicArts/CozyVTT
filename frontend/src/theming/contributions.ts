import type { ThemeHost, ThemeManifest } from "./ThemeHost";
import type { ActiveExtensionThemeContribution } from "@/types/extensions";
import type { ThemeColors } from "@/themes";
import { THEME_CONTRACT_VERSION } from "./ThemeHost";

/** Transport adapter supplied by the authenticated application shell. */
export interface ActiveThemeContributionLoader {
  loadActiveThemeManifests(): Promise<ReadonlyArray<ThemeManifest>>;
}

const extensionTokenNames: Record<keyof ThemeColors, string> = {
  brand: "--color-brand",
  brandDark: "--color-brand-dark",
  accent: "--color-accent",
  accentHover: "--color-accent-hover",
  accentText: "--color-accent-text",
  bgBase: "--color-bg-base",
  bgSurface: "--color-bg-surface",
  bgSurfaceLight: "--color-bg-surface-light",
  bgSurfaceDark: "--color-bg-surface-dark",
  ink: "--color-ink",
  inkSecondary: "--color-ink-secondary",
  inkMuted: "--color-ink-muted",
  paper: "--color-paper",
  danger: "--color-danger",
  spirit: "--color-spirit",
};

/**
 * The extension route transports data-only CSS tokens. Convert only complete
 * semantic palettes into ThemeHost manifests, rejecting partial theme payloads
 * rather than letting extensions overwrite arbitrary document variables.
 */
export function extensionThemesToManifests(
  contributions: readonly ActiveExtensionThemeContribution[],
): ThemeManifest[] {
  return contributions.flatMap(({ extensionId, theme }) => {
    const colors = {} as ThemeColors;
    for (const [color, tokenName] of Object.entries(
      extensionTokenNames,
    ) as Array<[keyof ThemeColors, string]>) {
      const value = theme.tokens[tokenName];
      if (!value) return [];
      colors[color] = value;
    }
    const pageBackground = theme.treatments?.pageBackground;
    const stops = pageBackground?.stops.map((stop) => {
      const entry = (
        Object.entries(extensionTokenNames) as Array<
          [keyof ThemeColors, string]
        >
      ).find(([, tokenName]) => tokenName === stop.token);
      return entry ? { token: entry[0], position: stop.position } : null;
    });
    if (stops?.some((stop) => stop === null)) return [];
    return [
      {
        id: `${extensionId}-${theme.id}`,
        name: theme.name,
        description: `Theme contributed by ${extensionId}`,
        category: "neutral",
        contractVersion: THEME_CONTRACT_VERSION,
        colors,
        treatments:
          pageBackground && stops
            ? {
                pageBackground: {
                  kind: pageBackground.kind,
                  angle: pageBackground.angle,
                  stops: stops.filter((stop) => stop !== null),
                },
              }
            : undefined,
      },
    ];
  });
}

/**
 * Applies one server snapshot transactionally enough for a React workspace:
 * invalid manifests fail closed, and the returned cleanup only unregisters
 * contributions this particular loader call installed.
 */
export async function registerActiveThemeContributions(
  host: ThemeHost,
  loader: ActiveThemeContributionLoader,
): Promise<() => void> {
  const manifests = await loader.loadActiveThemeManifests();
  const disposers: Array<() => void> = [];
  try {
    for (const manifest of manifests) disposers.push(host.register(manifest));
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose();
    throw error;
  }
  return () => disposers.reverse().forEach((dispose) => dispose());
}
