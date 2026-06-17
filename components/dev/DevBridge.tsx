"use client";

import { useEffect, useRef } from "react";
import { useOS } from "@/lib/os/uiState";
import { DEV, devStore, installDevApi, traceTransition } from "@/lib/dev/trace";

// Dev-only bridge: installs the AI co-pilot read API and keeps the global
// debug store in sync with UI_STATE. Renders nothing.
export function DevBridge() {
  const os = useOS();
  const prevSystem = useRef<string | null>(null);
  const prevKk = useRef<string | null>(null);

  useEffect(() => {
    installDevApi();
  }, []);

  useEffect(() => {
    if (!DEV) return;
    const store = devStore();
    store.activeSystem = os.activeSystem;
    store.workspaceActiveModule = os.selectedWorkspaceModule;
    store.uiState = {
      activeSystem: os.activeSystem,
      kkState: os.kkState,
      selectedNode: os.selectedNode,
      selectedWorkspaceModule: os.selectedWorkspaceModule,
      selectedPricingTier: os.selectedPricingTier,
      planId: os.planId,
      access: os.access,
    };

    // system transitions
    traceTransition(prevSystem.current, `system:${os.activeSystem}`);
    prevSystem.current = `system:${os.activeSystem}`;

    // KK state transitions
    traceTransition(prevKk.current, `kk:${os.kkState}`);
    prevKk.current = `kk:${os.kkState}`;
  }, [
    os.activeSystem,
    os.kkState,
    os.selectedNode,
    os.selectedWorkspaceModule,
    os.selectedPricingTier,
    os.planId,
    os.access,
  ]);

  return null;
}
