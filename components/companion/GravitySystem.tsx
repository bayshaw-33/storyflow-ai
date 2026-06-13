"use client";

import { OrbitSystem } from "@/components/orbit/OrbitSystem";
import { useGravity } from "@/lib/gravity/GravityContext";

export function GravitySystem() {
  const { state } = useGravity();

  return (
    <div
      className="kk-gravity-system"
      data-layer="gravity-system"
      data-companion={state.companion.name}
      data-companion-state={state.companion.state}
      data-focused-project-id={state.projectFocus?.projectId || ""}
      data-writer-count={state.writers.length}
      aria-hidden="true"
    >
      <div className="kk-gravity-core" data-core="kk" />
      <OrbitSystem />
    </div>
  );
}
