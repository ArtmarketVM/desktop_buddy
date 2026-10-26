import { useEffect, useLayoutEffect, useState } from "react";
import type { UserSettings } from "./types";

type Theme = "light" | "dark";
type Appearance = Pick<UserSettings, "theme" | "follow_system_theme">;

export function useTheme(settings?: Appearance) {
  const [preference, setPreference] = useState<Appearance>(() => ({
    theme: localStorage.getItem("buddy-theme") === "dark" ? "dark" : "light",
    follow_system_theme:
      localStorage.getItem("buddy-follow-system-theme") !== "false",
  }));
  const [systemTheme, setSystemTheme] = useState<Theme>(() =>
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  );
  const savedTheme = settings?.theme;
  const followSystem = settings?.follow_system_theme;
  useEffect(() => {
    if (savedTheme)
      setPreference({
        theme: savedTheme,
        follow_system_theme: followSystem ?? true,
      });
  }, [savedTheme, followSystem]);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const update = () => setSystemTheme(media.matches ? "dark" : "light");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const theme = preference.follow_system_theme ? systemTheme : preference.theme;
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("buddy-theme", preference.theme);
    localStorage.setItem(
      "buddy-follow-system-theme",
      String(preference.follow_system_theme),
    );
  }, [theme, preference]);
  return {
    theme,
    setTheme: (next: Theme) =>
      setPreference({ theme: next, follow_system_theme: false }),
  };
}
