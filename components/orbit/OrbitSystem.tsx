"use client";

import { useOrbit } from "@/lib/orbit/OrbitContext";

export function OrbitSystem() {
  const { state } = useOrbit();

  return (
    <div
      className="kk-orbit-system"
      data-system="orbit"
      data-node-count={state.nodes.length}
      data-focused-project-id={state.focusedProjectId || ""}
      data-focused-step-key={state.focusedStepKey || ""}
      aria-hidden="true"
    />
  );
}
