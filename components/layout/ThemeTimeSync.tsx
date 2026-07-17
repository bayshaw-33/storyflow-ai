"use client";

import { useEffect } from "react";

function applyTheme() {
  document.documentElement.dataset.theme = "dark";
  document.documentElement.style.colorScheme = "dark";
}

export function ThemeTimeSync() {
  useEffect(() => {
    applyTheme();
    window.addEventListener("storage", applyTheme);
    document.addEventListener("visibilitychange", applyTheme);

    return () => {
      window.removeEventListener("storage", applyTheme);
      document.removeEventListener("visibilitychange", applyTheme);
    };
  }, []);

  return null;
}
