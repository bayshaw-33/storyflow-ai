type KKFloatingOrbProps = {
  state?: "idle" | "generating" | "success" | "error";
};

export function KKFloatingOrb({ state = "idle" }: KKFloatingOrbProps) {
  return (
    <div className="kk-floating-module" data-state={state} aria-label={`KK ${state}`}>
      KK
    </div>
  );
}
