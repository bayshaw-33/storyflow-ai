"use client";

import { useEffect } from "react";

const THEME_MODE_STORAGE_KEY = "kiikis_theme_mode";

function themeFromTime(date = new Date()) {
  const hour = date.getHours();
  return hour >= 18 || hour < 7 ? "dark" : "light";
}

function resolveTheme() {
  const stored = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return themeFromTime();
}

function applyTheme() {
  const theme = resolveTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeTimeSync() {
  useEffect(() => {
    applyTheme();
    const interval = window.setInterval(applyTheme, 60_000);
    window.addEventListener("storage", applyTheme);
    document.addEventListener("visibilitychange", applyTheme);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", applyTheme);
      document.removeEventListener("visibilitychange", applyTheme);
    };
  }, []);

  return null;
}
