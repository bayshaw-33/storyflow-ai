import { memo } from "react";
import { KK3D } from "@/components/kk/KK3D";
import type { KKState } from "@/lib/kk/state";

type KKFloatingOrbProps = {
  state?: "idle" | "thinking" | "generating" | "success" | "error";
};

function mapState(state: KKFloatingOrbProps["state"]): KKState {
  if (state === "thinking" || state === "generating") return "THINKING";
  if (state === "success") return "HAPPY";
  return "IDLE";
}

export const KKFloatingOrb = memo(function KKFloatingOrb({ state = "idle" }: KKFloatingOrbProps) {
  return (
    <div className="kk-floating-module" data-state={state} aria-label={`KK ${state}`}>
      <KK3D state={mapState(state)} size="sm" />
    </div>
  );
});
