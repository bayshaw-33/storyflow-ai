"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { getPlanEntitlement, formatPrice, formatCnyPrice, type PlanEntitlement } from "@/lib/billing/plans";
import type { Locale } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/lib/i18n/useI18n";
import { glassAssetFor, isFlagship, TIERS, type TierDef } from "@/lib/pricing/tiers";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { DesignAssetImage } from "@/components/design/DesignAssetImage";

const PRIMARY_TIER_IDS: TierDef["id"][] = ["FREE", "ELITE", "PRO", "ULTRA"];

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
    betaLabel: "Beta",
    originalPrice: "Original",
    included: "Included",
    monthly: "/ mo",
    annual: "Annual",
    monthlyToggle: "Monthly",
    annualSave: "Save more",
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
    betaLabel: "公测价",
    originalPrice: "原价",
    included: "包含",
    monthly: "/ 月",
    annual: "年付",
    monthlyToggle: "月付",
    annualSave: "更划算",
  },
} satisfies Record<Locale, Record<string, string>>;

const MonetizationTier = memo(function MonetizationTier({
  tier,
  plan,
  copy,
  selected,
  saving,
  annual,
  locale,
  onSelect,
}: {
  tier: TierDef;
  plan: PlanEntitlement;
  copy: Record<string, string>;
  selected: boolean;
  saving: boolean;
  annual: boolean;
  locale: string;
  onSelect: (tier: TierDef) => void;
}) {
  const isZh = locale === "zh-CN";

  const betaPrice = annual
    ? (isZh ? plan.cnyBetaAnnualMonthlyPrice : plan.betaAnnualMonthlyPrice)
    : (isZh ? plan.cnyBetaMonthlyPrice : plan.betaMonthlyPrice);
  const originalPrice = annual
    ? (isZh ? plan.cnyAnnualMonthlyPrice : plan.annualMonthlyPrice)
    : (isZh ? plan.cnyMonthlyPrice : plan.monthlyPrice);

  const fmtBeta = isZh ? formatCnyPrice(betaPrice) : formatPrice(betaPrice);
  const fmtOriginal = isZh ? formatCnyPrice(originalPrice) : formatPrice(originalPrice);
  const showStrike = originalPrice > betaPrice;
  const isFree = plan.monthlyPrice === 0;

  const disabled = saving;

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
      <p>{isZh ? plan.positioningZh : plan.positioning}</p>

      <div className="kk-tier-price">
        {!isFree && <span className="kk-tier-beta-label">{copy.betaLabel}</span>}
        <strong className="kk-tier-price-main">
          {fmtBeta}
          {!isFree && <span className="kk-tier-price-period">{copy.monthly}</span>}
        </strong>
        {showStrike && (
          <s className="kk-tier-price-original">{fmtOriginal}{copy.monthly}</s>
        )}
      </div>

      <div className="workflow-template-meta" aria-label={copy.included}>
        {plan.includes.map((item) => (
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
  const [annual, setAnnual] = useState(false);
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

      <div className="kk-billing-toggle">
        <button
          type="button"
          className={`kk-billing-option${!annual ? " is-active" : ""}`}
          onClick={() => setAnnual(false)}
        >
          {copy.monthlyToggle}
        </button>
        <button
          type="button"
          className={`kk-billing-option${annual ? " is-active" : ""}`}
          onClick={() => setAnnual(true)}
        >
          {copy.annual}
          <span className="kk-billing-save">{copy.annualSave}</span>
        </button>
      </div>

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
            annual={annual}
            locale={locale}
            onSelect={selectTier}
          />
        ))}
      </section>
    </>
  );
}
