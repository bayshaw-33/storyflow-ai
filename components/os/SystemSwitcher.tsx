"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import { DesignAssetImage } from "@/components/design/DesignAssetImage";
import { useOS, type ActiveSystem } from "@/lib/os/uiState";

// Asset-driven OS navigation — system switching triggers, not a navbar.
// Each trigger switches the active system layer and routes to its surface.
const SYSTEMS: { system: ActiveSystem; route: string; label: string }[] = [
  { system: "hero", route: "/", label: "Hero" },
  { system: "workspace", route: "/dashboard", label: "Workspace" },
  { system: "universe", route: "/universes", label: "Universe" },
  { system: "pricing", route: "/subscription", label: "Pricing" },
];

export const SystemSwitcher = memo(function SystemSwitcher() {
  const router = useRouter();
  const os = useOS();

  return (
    <nav className="kk-system-switcher" aria-label="System switcher">
      {SYSTEMS.map(({ system, route, label }) => {
        // Universe is gated by the PRO access layer (no bypass).
        const locked = system === "universe" && os.planReady && !os.access.universe;
        return (
          <button
            key={system}
            type="button"
            className={`kk-system-trigger${os.activeSystem === system ? " is-active" : ""}${locked ? " is-locked" : ""}`}
            data-system={system}
            aria-current={os.activeSystem === system ? "true" : undefined}
            aria-label={locked ? `${label} (locked)` : label}
            onClick={() => router.push(locked ? "/subscription" : route)}
          >
            <DesignAssetImage token="LOGO_ICON" alt="" aria-hidden="true" draggable={false} />
          </button>
        );
      })}
    </nav>
  );
});
