/**
 * ThemeSyncBridge
 *
 * Bridges AuthContext → ThemeContext. Sits inside <AuthProvider> (so it can
 * consume auth state) and inside <ThemeProvider> (so it can drive theme
 * application). Renders nothing.
 *
 * On login: applies the user's stored preferences as a theme overlay.
 * On logout: clears the overlay so the public/login page reverts to the
 *            admin's default theme. Also clears the localStorage cache so
 *            the next anonymous load paints the system theme directly.
 *
 * This pattern (vs. having ThemeProvider call useAuth directly) avoids a
 * circular provider dependency — ThemeProvider currently wraps AuthProvider
 * because the auth check fires after theme is mounted.
 */

import { useEffect, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { useTheme } from "./ThemeContext";
import { api } from "@/services/api";
import { extensionThemesToManifests } from "@/theming";

export function ThemeSyncBridge() {
  const { user, authenticated } = useAuth();
  const {
    applyUserPreferences,
    setContributionLoader,
    refreshThemeContributions,
  } = useTheme();
  const contributionLoader = useMemo(
    () => ({
      loadActiveThemeManifests: async () =>
        extensionThemesToManifests(await api.listActiveThemeContributions()),
    }),
    [],
  );

  useEffect(() => {
    if (authenticated && user) {
      applyUserPreferences(user.preferences ?? null);
      setContributionLoader(contributionLoader);
    } else {
      applyUserPreferences(null);
      setContributionLoader(null);
    }
    // We intentionally key on the serialized preferences identity so that
    // partial updates (savePref) re-trigger the effect.
  }, [
    authenticated,
    user?.id,
    JSON.stringify(user?.preferences ?? null),
    contributionLoader,
    setContributionLoader,
  ]);

  useEffect(() => {
    const refresh = () => refreshThemeContributions();
    window.addEventListener("cozyvtt:extensions-changed", refresh);
    return () =>
      window.removeEventListener("cozyvtt:extensions-changed", refresh);
  }, [refreshThemeContributions]);

  return null;
}

export default ThemeSyncBridge;
