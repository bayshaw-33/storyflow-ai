"use client";

import { useEffect } from "react";
import { useTimeSlotSync } from "@/lib/time-slot/useTimeSlot";

function applyTheme() {
  document.documentElement.dataset.theme = "dark";
  document.documentElement.style.colorScheme = "dark";
}

export function ThemeTimeSync() {
  useTimeSlotSync();

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
