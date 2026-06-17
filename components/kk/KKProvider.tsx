"use client";

import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DesignAssetImage } from "@/components/design/DesignAssetImage";
import { useOS } from "@/lib/os/uiState";
import {
  assetForState,
  canTransition,
  HAPPY_HOLD_MS,
  INACTIVITY_IDLE_MS,
  type KKState,
} from "@/lib/kk/state";

type KKApi = {
  state: KKState;
  /** user asks a question / a request is in flight */
  think: () => void;
  /** a user action succeeded */
  celebrate: () => void;
  /** enter/exit onboarding/help mode */
  setGuide: (on: boolean) => void;
};

const KKContext = createContext<KKApi | null>(null);

export function useKK(): KKApi {
  const ctx = useContext(KKContext);
  if (!ctx) throw new Error("useKK must be used within <KKProvider>");
  return ctx;
}

const KKPresence = memo(function KKPresence({
  state,
  onClick,
}: {
  state: KKState;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="kk-companion"
      data-state={state}
      aria-label={`KK ${state.toLowerCase()}`}
      onClick={onClick}
    >
      <DesignAssetImage token={assetForState(state)} alt="" draggable={false} />
    </button>
  );
});

// Single companion runtime. Mounted ONCE at the root so KK is a cross-page
// presence layer (never more than one instance).
export function KKProvider({ children }: { children: React.ReactNode }) {
  const os = useOS();
  const router = useRouter();
  const [state, setState] = useState<KKState>("IDLE");
  const happyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // guarded, deterministic transition
  const go = useCallback((next: KKState) => {
    setState((current) => (canTransition(current, next) ? next : current));
  }, []);

  const clearHappy = () => {
    if (happyTimer.current) clearTimeout(happyTimer.current);
    happyTimer.current = null;
  };

  const think = useCallback(() => {
    clearHappy();
    go("THINKING");
  }, [go]);

  const celebrate = useCallback(() => {
    clearHappy();
    go("HAPPY");
    happyTimer.current = setTimeout(() => go("IDLE"), HAPPY_HOLD_MS);
  }, [go]);

  const setGuide = useCallback(
    (on: boolean) => {
      clearHappy();
      go(on ? "GUIDE" : "IDLE");
    },
    [go],
  );

  // user inactive -> IDLE (never interrupts an explicit GUIDE session)
  useEffect(() => {
    const reset = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        setState((current) => (current === "GUIDE" ? current : "IDLE"));
      }, INACTIVITY_IDLE_MS);
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "scroll", "mousemove"];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((event) => window.removeEventListener(event, reset));
      if (idleTimer.current) clearTimeout(idleTimer.current);
      clearHappy();
    };
  }, []);

  // Mirror KK state into the global UI_STATE so every system can read it.
  useEffect(() => {
    os.setKkState(state.toLowerCase() as "idle" | "thinking" | "happy" | "guide");
  }, [state, os]);

  // Full KK behaviour (blocking guide overlay) is gated to the ELITE layer.
  const requestGuide = useCallback(() => {
    if (os.access.fullKK) {
      setGuide(true);
    } else {
      router.push("/subscription");
    }
  }, [os.access.fullKK, setGuide, router]);

  const isGuide = state === "GUIDE";
  const api = useMemo(() => ({ state, think, celebrate, setGuide }), [state, think, celebrate, setGuide]);

  return (
    <KKContext.Provider value={api}>
      {children}

      {/* GUIDE: dim backdrop disables unrelated UI; click to exit. No tooltips. */}
      {isGuide ? (
        <div
          className="kk-guide-layer"
          role="dialog"
          aria-label="KK guide"
          onClick={() => setGuide(false)}
        >
          <DesignAssetImage className="kk-guide-overlay" token="KK_GUIDE" alt="KK guide" draggable={false} />
        </div>
      ) : (
        // Corner-anchored presence. One image = one state. Click requests guide.
        <KKPresence state={state} onClick={requestGuide} />
      )}
    </KKContext.Provider>
  );
}
