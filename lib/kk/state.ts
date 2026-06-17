// KIIKIS KK — Companion state machine core.
// KK is a stateful entity, not an image. Exactly one state at a time.

import type { AssetToken } from "@/lib/design/manifest";

export type KKState = "IDLE" | "THINKING" | "HAPPY" | "GUIDE";

// Each state resolves to exactly one asset; unknown states fall back to idle.
const STATE_ASSET: Record<KKState, AssetToken> = {
  IDLE: "KK_IDLE",
  THINKING: "KK_THINKING",
  HAPPY: "KK_HAPPY",
  GUIDE: "KK_GUIDE",
};

export function assetForState(state: KKState): AssetToken {
  return STATE_ASSET[state] ?? "KK_IDLE";
}

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
