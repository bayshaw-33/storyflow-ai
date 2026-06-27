"use client";

import { memo } from "react";
import type { KKCardId } from "@/lib/kk/cards";
import type { KKState } from "@/lib/kk/state";

type KK3DProps = {
  state?: KKState;
  skinId?: KKCardId;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export const KK3D = memo(function KK3D({
  state = "IDLE",
  skinId = "classic_brave",
  size = "md",
  className = "",
}: KK3DProps) {
  return (
    <span
      className={`kk-3d ${className}`}
      data-state={state.toLowerCase()}
      data-skin={skinId}
      data-size={size}
      aria-hidden="true"
    >
      <span className="kk-3d-shadow" />
      <span className="kk-3d-rig">
        <span className="kk-3d-ear kk-3d-ear-left" />
        <span className="kk-3d-ear kk-3d-ear-right" />
        <span className="kk-3d-head">
          <span className="kk-3d-face">
            <span className="kk-3d-eye kk-3d-eye-left" />
            <span className="kk-3d-eye kk-3d-eye-right" />
            <span className="kk-3d-nose" />
            <span className="kk-3d-mouth" />
          </span>
        </span>
        <span className="kk-3d-body" />
        <span className="kk-3d-tail" />
        <span className="kk-3d-orb" />
      </span>
    </span>
  );
});
