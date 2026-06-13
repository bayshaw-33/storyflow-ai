"use client";

import { useIPUniverse } from "@/lib/ip/IPUniverseContext";

export function IPUniverseLayer() {
  const { state } = useIPUniverse();

  return (
    <aside
      className="kk-ip-universe-layer"
      data-layer="ip-universe"
      data-active-universe-id={state.activeUniverseId || ""}
      data-character-count={state.characters.length}
      data-canon-count={state.canon.length}
      data-timeline-count={state.timeline.length}
      aria-hidden="true"
    />
  );
}
