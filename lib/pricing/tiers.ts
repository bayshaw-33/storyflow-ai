// KIIKIS PRICING — Tier engine.
// A tier is NOT a card; it is a permission layer mapped to an existing plan.
// No invented pricing logic — planId links to lib/billing/plans access control.

import type { AssetToken } from "@/lib/design/manifest";
import type { PlanId } from "@/lib/billing/plans";

export type TierId = "FREE" | "ELITE" | "PRO" | "ULTRA";

// Badge overlays — the only allowed kinds. No text marketing labels.
export type BadgeKind = "popular" | "flagship" | "recommended";

export type TierDef = {
  id: TierId;
  /** the permission layer this tier grants */
  planId: PlanId;
  /** tier icon asset (premium tiers) */
  icon?: AssetToken;
  /** overlay badge */
  badge?: BadgeKind;
  /** conversion-flow target (entry → upgrade) */
  next?: TierId;
};

// Exactly ONE flagship tier — dynamic / configurable.
export const FLAGSHIP_TIER: TierId = "ULTRA";

export const TIERS: TierDef[] = [
  { id: "FREE",  planId: "free",  next: "ELITE" },
  { id: "ELITE", planId: "elite", badge: "recommended", next: "PRO" },
  { id: "PRO",   planId: "pro",   badge: "popular",     next: "ULTRA" },
  { id: "ULTRA", planId: "ultra", badge: "flagship" },
];

// All tiers share the same clean glass texture.
export function glassAssetFor(_tier: TierDef): AssetToken {
  return "UNIVERSE_PRICING_GLASS";
}

export function isFlagship(tier: TierDef): boolean {
  return tier.id === FLAGSHIP_TIER;
}
