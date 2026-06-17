"use client";

import { memo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { DesignAssetImage } from "@/components/design/DesignAssetImage";
import { glassAssetFor, isFlagship, TIERS, type TierDef } from "@/lib/pricing/tiers";

const MonetizationTier = memo(function MonetizationTier({
  tier,
  selected,
  onSelect,
}: {
  tier: TierDef;
  selected: boolean;
  onSelect: (tier: TierDef) => void;
}) {
  return (
    <div
      className={`kk-tier${isFlagship(tier) ? " is-flagship" : ""}${selected ? " is-selected" : ""}`}
      data-tier={tier.id}
      data-flagship={isFlagship(tier) ? "true" : undefined}
    >
      <DesignAssetImage
        className="kk-tier-glass"
        token={glassAssetFor(tier)}
        alt=""
        aria-hidden="true"
        draggable={false}
      />

      {tier.badge ? (
        <DesignAssetImage
          className="kk-tier-badge"
          data-badge={tier.badge}
          token="UNIVERSE_BADGES"
          alt={tier.badge}
          draggable={false}
        />
      ) : null}

      {tier.icon ? (
        <DesignAssetImage
          className="kk-tier-icon"
          token={tier.icon}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      ) : null}

      <span className="kk-tier-name">{tier.id}</span>

      <button className="kk-tier-select" type="button" onClick={() => onSelect(tier)}>
        SELECT TIER
      </button>
    </div>
  );
});

export function MonetizationLayer() {
  const router = useRouter();
  const [selected, setSelected] = useState<TierDef["id"] | null>(null);

  const selectTier = useCallback((tier: TierDef) => {
    setSelected(tier.id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kiikis_plan_id", tier.planId);
    }
    router.push("/dashboard");
  }, [router]);

  return (
    <section className="kk-monetization" aria-label="Tiers">
      {TIERS.map((tier) => (
        <MonetizationTier
          key={tier.id}
          tier={tier}
          selected={selected === tier.id}
          onSelect={selectTier}
        />
      ))}
    </section>
  );
}
