// KIIKIS PRICING — Tier engine.
// A tier is NOT a card; it is a permission layer mapped to an existing plan.
// No invented pricing logic — planId links to lib/billing/plans access control.

import type { AssetToken } from "@/lib/design/manifest";
import type { PlanId } from "@/lib/billing/plans";

export type TierId = "FREE" | "ELITE" | "PRO" | "UNIVERSE" | "TEAM";

// Badge overlays — the only allowed kinds. No text marketing labels.
export type BadgeKind = "popular" | "flagship" | "pre-launch";

export type TierDef = {
  id: TierId;
  /** the permission layer this tier grants */
  planId: PlanId;
  /** tier icon asset (premium tiers) */
  icon?: AssetToken;
  /** overlay badge */
  badge?: BadgeKind;
  /** conversion-flow target (entry → upgrade → enterprise) */
  next?: TierId;
};

// Exactly ONE flagship tier — dynamic / configurable. Change this constant to
// move the flagship highlight; only this tier uses the Universe flagship card.
export const FLAGSHIP_TIER: TierId = "UNIVERSE";

export const TIERS: TierDef[] = [
  { id: "FREE", planId: "free", next: "ELITE" },
  { id: "ELITE", planId: "elite", icon: "UNIVERSE_TIER_ICONS", next: "PRO" },
  { id: "PRO", planId: "pro", icon: "UNIVERSE_TIER_ICONS", badge: "popular", next: "UNIVERSE" },
  { id: "UNIVERSE", planId: "universe", icon: "UNIVERSE_TIER_ICONS", badge: "flagship", next: "TEAM" },
  { id: "TEAM", planId: "team", icon: "UNIVERSE_TIER_ICONS", badge: "pre-launch" },
];

// All four tiers share the same clean glass texture — the dedicated
// "flagship" art asset has stale branding text baked into its pixels from
// an earlier design pass and must not be used to represent a real tier
// card (it would show mismatched text next to the actual tier name).
// The flagship tier is still visually distinguished via the .is-flagship
// border-glow treatment in CSS, no separate image needed.
export function glassAssetFor(_tier: TierDef): AssetToken {
  return "UNIVERSE_PRICING_GLASS";
}

export function isFlagship(tier: TierDef): boolean {
  return tier.id === FLAGSHIP_TIER;
}
