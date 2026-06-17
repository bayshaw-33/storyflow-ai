import { memo } from "react";
import { CatMark } from "@/components/brand/CatMark";

type KKFloatingOrbProps = {
  state?: "idle" | "thinking" | "generating" | "success" | "error";
};

export const KKFloatingOrb = memo(function KKFloatingOrb({ state = "idle" }: KKFloatingOrbProps) {
  return (
    <div className="kk-floating-module" data-state={state} aria-label={`KK ${state}`}>
      <CatMark state={state} />
    </div>
  );
});
