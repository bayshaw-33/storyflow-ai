// KIIKIS KK — state machine core.
// KK is a stateful 3D runtime entity, not an image. Exactly one state at a time.

export type KKState = "IDLE" | "THINKING" | "HAPPY" | "GUIDE";

// Deterministic transitions (no random switching). A transition that is not
// listed for the current state is rejected (the state holds).
const TRANSITIONS: Record<KKState, KKState[]> = {
  IDLE: ["THINKING", "HAPPY", "GUIDE"],
  THINKING: ["HAPPY", "IDLE", "GUIDE"],
  HAPPY: ["IDLE", "THINKING", "GUIDE"],
  GUIDE: ["IDLE"], // guide only ever resolves back to idle
};

export function canTransition(from: KKState, to: KKState): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

// How long transient states auto-resolve back to IDLE (ms). GUIDE never auto-resolves.
export const HAPPY_HOLD_MS = 2600;
export const INACTIVITY_IDLE_MS = 15000;
