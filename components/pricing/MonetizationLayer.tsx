"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { getPlanEntitlement, formatLaunchPrice, type PlanEntitlement } from "@/lib/billing/plans";
import type { Locale } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/lib/i18n/useI18n";
import { glassAssetFor, isFlagship, TIERS, type TierDef } from "@/lib/pricing/tiers";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { DesignAssetImage } from "@/components/design/DesignAssetImage";

const PRIMARY_TIER_IDS: TierDef["id"][] = ["FREE", "ELITE", "PRO"];

const tierCopy = {
  "en-US": {
    kicker: "Pricing",
    title: "Choose the room that matches your production rhythm.",
    subtitle: "No payment flow is connected in this round. Your selection updates the active profile plan.",
    select: "Choose tier",
    selected: "Current tier",
    signingIn: "Sign in to choose a tier.",
    saving: "Saving",
    saved: "Plan updated.",
    error: "Could not update your plan. Please try again.",
    missingProfile: "Profile was not found for this account.",
    launchPrice: "Launch price",
    regularPrice: "Regular price",
    included: "Included",
    model: "Model access",
    monthly: "/ month",
  },
  "zh-CN": {
    kicker: "定价",
    title: "选择与你创作节奏匹配的工作间。",
    subtitle: "本轮暂不接入真实支付。选择档位后，会更新当前账号的 profile plan。",
    select: "选择档位",
    selected: "当前档位",
    signingIn: "请先登录后再选择档位。",
    saving: "保存中",
    saved: "套餐已更新。",
    error: "套餐更新失败，请重试。",
    missingProfile: "未找到当前账号的个人资料。",
    launchPrice: "上线价格",
    regularPrice: "原价",
    included: "包含",
    model: "模型权限",
    monthly: "/ 月",
  },
} satisfies Record<Locale, Record<string, string>>;

const MonetizationTier = memo(function MonetizationTier({
  tier,
  plan,
  copy,
  selected,
  saving,
  onSelect,
}: {
  tier: TierDef;
  plan: PlanEntitlement;
  copy: Record<string, string>;
  selected: boolean;
  saving: boolean;
  onSelect: (tier: TierDef) => void;
}) {
  const price = formatLaunchPrice(plan.launchMonthlyPrice);
  const regularPrice = formatLaunchPrice(plan.originalMonthlyPrice);
  const disabled = saving || plan.launchState === "coming-soon" || plan.launchState === "contact";

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
      <h2>{plan.name}</h2>
      <p>{plan.positioning}</p>
      <dl className="plan-entitlements">
        <div>
          <dt>{copy.launchPrice}</dt>
          <dd>
            {price}
            {plan.launchMonthlyPrice !== null ? copy.monthly : ""}
          </dd>
        </div>
        <div>
          <dt>{copy.regularPrice}</dt>
          <dd>
            {regularPrice}
            {plan.originalMonthlyPrice !== null ? copy.monthly : ""}
          </dd>
        </div>
        <div>
          <dt>{copy.model}</dt>
          <dd>{plan.model}</dd>
        </div>
      </dl>
      <div className="workflow-template-meta" aria-label={copy.included}>
        {plan.includes.slice(0, 4).map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>

      <button className="kk-tier-select" type="button" disabled={disabled} onClick={() => onSelect(tier)}>
        {saving ? copy.saving : selected ? copy.selected : copy.select}
      </button>
    </div>
  );
});

export function MonetizationLayer() {
  const { locale } = useI18n();
  const copy = tierCopy[locale];
  const [selected, setSelected] = useState<TierDef["id"] | null>(null);
  const [savingTier, setSavingTier] = useState<TierDef["id"] | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const tiers = useMemo(
    () => PRIMARY_TIER_IDS.map((id) => TIERS.find((tier) => tier.id === id)).filter(Boolean) as TierDef[],
    [],
  );

  const selectTier = useCallback(async (tier: TierDef) => {
    setSavingTier(tier.id);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("missing-supabase-client");

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        setMessage({ tone: "error", text: copy.signingIn });
        return;
      }

      const { data, error } = await supabase
        .from("storyflow_profiles")
        .update({
          plan: tier.planId,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .select("plan")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setMessage({ tone: "error", text: copy.missingProfile });
        return;
      }

      setSelected(tier.id);
      window.localStorage.setItem("kiikis_plan_id", tier.planId);
      setMessage({ tone: "success", text: copy.saved });
    } catch {
      setMessage({ tone: "error", text: copy.error });
    } finally {
      setSavingTier(null);
    }
  }, [copy]);

  return (
    <>
      <header className="cosmic-title-band centered">
        <span>{copy.kicker}</span>
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
      </header>

      {message ? <p className={`notice ${message.tone}`}>{message.text}</p> : null}

      <section className="kk-monetization" aria-label="Tiers">
        {tiers.map((tier) => (
          <MonetizationTier
            key={tier.id}
            tier={tier}
            plan={getPlanEntitlement(tier.planId)}
            copy={copy}
            selected={selected === tier.id}
            saving={savingTier === tier.id}
            onSelect={selectTier}
          />
        ))}
      </section>
    </>
  );
}
