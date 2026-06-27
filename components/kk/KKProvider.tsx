"use client";

import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KK3D } from "@/components/kk/KK3D";
import {
  type KKCardId,
  DEFAULT_KK_CARD_ID,
  getKKCard,
  KK_EQUIPPED_SKIN_EVENT,
  KK_EQUIPPED_SKIN_STORAGE_KEY,
} from "@/lib/kk/cards";
import { useOS } from "@/lib/os/uiState";
import {
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
  skinId,
  onClick,
}: {
  state: KKState;
  skinId: KKCardId;
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
      <KK3D state={state} skinId={skinId} size="sm" />
    </button>
  );
});

// Single companion runtime. Mounted ONCE at the root so KK is a cross-page
// presence layer (never more than one instance).
export function KKProvider({ children }: { children: React.ReactNode }) {
  const os = useOS();
  const router = useRouter();
  const [state, setState] = useState<KKState>("IDLE");
  const [equippedCardId, setEquippedCardId] = useState<KKCardId>(DEFAULT_KK_CARD_ID);
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

  useEffect(() => {
    const syncSkin = () => {
      try {
        setEquippedCardId(getKKCard(window.localStorage.getItem(KK_EQUIPPED_SKIN_STORAGE_KEY)).id);
      } catch {
        setEquippedCardId(DEFAULT_KK_CARD_ID);
      }
    };

    syncSkin();
    window.addEventListener("storage", syncSkin);
    window.addEventListener(KK_EQUIPPED_SKIN_EVENT, syncSkin);
    return () => {
      window.removeEventListener("storage", syncSkin);
      window.removeEventListener(KK_EQUIPPED_SKIN_EVENT, syncSkin);
    };
  }, []);

  // Full KK behaviour (blocking guide overlay) is gated to the ELITE layer.
  const requestGuide = useCallback(() => {
    if (os.access.fullKK) {
      setGuide(true);
    } else {
      router.push("/dashboard");
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
          <KK3D className="kk-guide-overlay" state="GUIDE" skinId={equippedCardId} size="lg" />
        </div>
      ) : (
        // Corner-anchored presence. 3D KK is rendered from DOM/CSS, not a PNG.
        <KKPresence state={state} skinId={equippedCardId} onClick={requestGuide} />
      )}
    </KKContext.Provider>
  );
}
