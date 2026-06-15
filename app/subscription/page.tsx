"use client";

import Link from "next/link";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { EXTRA_DRAFT_SCRIPT_CREDIT, KK_CREDIT_PACKS } from "@/lib/billing/addons";
import { formatLaunchPrice, LAUNCH_OFFER_EN, LAUNCH_OFFER_ZH, PLAN_ENTITLEMENTS } from "@/lib/billing/plans";
import { useI18n } from "@/lib/i18n/useI18n";

function priceLabel(value: number | null, suffix = "/mo") {
  if (value === null) return "Custom";
  if (value === 0) return "$0";
  return `${formatLaunchPrice(value)}${suffix}`;
}

export default function SubscriptionPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return (
    <main className="kk-pricing-page">
      <header className="kk-pricing-nav">
        <Link href="/" className="kk-pricing-nav-brand">
          <KiikisLogo compact />
        </Link>

        <nav className="kk-pricing-nav-links" aria-label="Primary">
          <Link href="/dashboard">{isZh ? "工作台" : "Dashboard"}</Link>
          <Link href="/universes">{isZh ? "宇宙" : "Universe"}</Link>
          <Link href="/companions">{isZh ? "伙伴" : "Companions"}</Link>
          <Link href="/templates">{isZh ? "模板" : "Templates"}</Link>
          <Link href="/settings">{isZh ? "设置" : "Settings"}</Link>
        </nav>

        <div className="kk-pricing-nav-actions">
          <Link href="/" className="kk-text-button">{isZh ? "首页" : "Home"}</Link>
          <Link href="/dashboard" className="kk-room-button">{isZh ? "进入编剧室" : "Enter the Room"}</Link>
        </div>
      </header>

      <section className="kk-pricing-header">
        <span>{isZh ? "上线套餐" : "LAUNCH PLANS"}</span>
        <h1>{isZh ? "选择你的计划。构建你的宇宙。" : "Choose your plan. Build your universe."}</h1>
        <p>{isZh ? LAUNCH_OFFER_ZH : LAUNCH_OFFER_EN}</p>
      </section>

      <section className="kk-plans-grid" aria-label="Pricing plans">
        {PLAN_ENTITLEMENTS.map((plan) => {
          const isUniverse = plan.id === "universe";
          const isSecondary = plan.id === "team" || plan.id === "enterprise";
          const hasPrice = plan.launchMonthlyPrice !== null;
          const highlights = [
            plan.model,
            plan.storySeeds ? `${plan.storySeeds} Story Seeds` : null,
            plan.draftScriptCreditsMonthly ? `${plan.draftScriptCreditsMonthly} Draft Script Credits / month` : null,
            plan.kkCreditsMonthly ? `${plan.kkCreditsMonthly.toLocaleString()} KK币 / month` : null,
            plan.mediaKkLimitMonthly ? `Media limit: ${plan.mediaKkLimitMonthly.toLocaleString()} KK币 / month` : null,
            plan.features.universe ? "Universe enabled" : null,
          ].filter(Boolean);

          return (
            <article
              className={[
                "kk-plan-card",
                isUniverse ? "featured" : "",
                isSecondary ? "secondary" : "",
              ].filter(Boolean).join(" ")}
              key={plan.id}
            >
              <div className="kk-plan-topline">
                <span className="kk-plan-tier">{plan.name}</span>
                {isUniverse ? <em>{isZh ? "旗舰" : "Flagship"}</em> : null}
              </div>

              <p className="kk-plan-positioning">{isZh ? plan.positioningZh : plan.positioning}</p>

              <div className="kk-plan-price-block">
                {hasPrice ? (
                  <>
                    <small>{isZh ? "原价" : "Original"} {priceLabel(plan.originalMonthlyPrice)}</small>
                    <span className="kk-price">{priceLabel(plan.launchMonthlyPrice)}</span>
                    <span className="kk-annual">{isZh ? "年付等效" : "Annual"} {priceLabel(plan.launchAnnualMonthlyEquivalent)}</span>
                  </>
                ) : (
                  <>
                    <small>{plan.launchState === "coming-soon" ? "Coming Soon" : "Contact Us"}</small>
                    <span className="kk-price">{plan.id === "team" ? "Soon" : "Custom"}</span>
                    <span className="kk-annual">{isZh ? "联系获取方案" : "Talk to us for access"}</span>
                  </>
                )}
              </div>

              <ul className="kk-plan-highlights">
                {highlights.slice(0, isSecondary ? 4 : 7).map((item) => (
                  <li key={item}>{item}</li>
                ))}
                {isSecondary && plan.futureDirection?.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>

              <button className="kk-plan-cta" type="button">
                {plan.id === "team" || plan.id === "enterprise"
                  ? "Contact Us"
                  : plan.launchMonthlyPrice === 0
                    ? "Start Free"
                    : "Select Plan"}
              </button>
            </article>
          );
        })}
      </section>

      <section className="kk-addons-section" aria-label="Add-ons">
        <span className="kk-addons-label">{isZh ? "加购包" : "ADD-ONS"}</span>
        <div className="kk-addons-grid">
          <article className="kk-addon-card">
            <span>DRAFT CREDIT</span>
            <strong>{EXTRA_DRAFT_SCRIPT_CREDIT.name}</strong>
            <p>{EXTRA_DRAFT_SCRIPT_CREDIT.description}</p>
            <span className="kk-addon-price">${EXTRA_DRAFT_SCRIPT_CREDIT.priceUsd}</span>
          </article>

          {KK_CREDIT_PACKS.map((pack) => (
            <article className="kk-addon-card" key={pack.id}>
              <span>{pack.kkCredits.toLocaleString()} KK币</span>
              <strong>{pack.name}</strong>
              <p>{isZh ? "用于平台 GPT 与图片能力。" : "For platform GPT and image features."}</p>
              <span className="kk-addon-price">${pack.priceUsd}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
