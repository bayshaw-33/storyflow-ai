"use client";

import Link from "next/link";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { EXTRA_DRAFT_SCRIPT_CREDIT, KK_CREDIT_PACKS } from "@/lib/billing/addons";
import { formatLaunchPrice, LAUNCH_OFFER_EN, LAUNCH_OFFER_ZH, PLAN_ENTITLEMENTS } from "@/lib/billing/plans";
import { useI18n } from "@/lib/i18n/useI18n";

export default function SubscriptionPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return (
    <main className="cosmic-page pricing-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
        <nav>
          <Link href="/dashboard">{isZh ? "工作台" : "Dashboard"}</Link>
          <Link href="/universes">{isZh ? "宇宙" : "Universe"}</Link>
          <Link href="/companions">{isZh ? "伙伴" : "Companions"}</Link>
          <Link href="/templates">{isZh ? "模板" : "Templates"}</Link>
          <Link href="/settings">{isZh ? "设置" : "Settings"}</Link>
        </nav>
      </header>

      <section className="cosmic-title-band">
        <span>{isZh ? "订阅" : "SUBSCRIPTION"}</span>
        <h1>{isZh ? "选择你的 kiikis 创作引擎。" : "Choose your kiikis production engine."}</h1>
        <p>{isZh ? LAUNCH_OFFER_ZH : LAUNCH_OFFER_EN}</p>
      </section>

      <section className="pricing-table">
        {PLAN_ENTITLEMENTS.map((plan) => {
          const isFlagship = plan.id === "universe";
          const hasPrice = plan.launchMonthlyPrice !== null;
          return (
            <article className={isFlagship ? "plan-card featured" : "plan-card"} key={plan.id}>
              <span>{plan.name}</span>
              <p>{isZh ? plan.positioningZh : plan.positioning}</p>
              <div className="plan-price-stack">
                <small>{isZh ? "原价" : "Original"}: {formatLaunchPrice(plan.originalMonthlyPrice)}{hasPrice ? "/mo" : ""}</small>
                <h2>{formatLaunchPrice(plan.launchMonthlyPrice)}{hasPrice ? "/mo" : ""}</h2>
                <strong>{isZh ? "年付等效" : "Annual"}: {formatLaunchPrice(plan.launchAnnualMonthlyEquivalent)}{hasPrice ? "/mo" : ""}</strong>
              </div>
              <dl className="plan-entitlements">
                <div><dt>{isZh ? "模型" : "Model"}</dt><dd>{plan.model}</dd></div>
                <div><dt>{isZh ? "初稿额度" : "Draft credits"}</dt><dd>{plan.draftScriptCreditsMonthly ?? "N/A"}</dd></div>
                <div><dt>KK币</dt><dd>{plan.kkCreditsMonthly ?? "N/A"}</dd></div>
                <div><dt>{isZh ? "故事种子" : "Story Seeds"}</dt><dd>{plan.storySeeds ?? "N/A"}</dd></div>
              </dl>
              <ul>
                {plan.includes.slice(0, 8).map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              <button>{plan.launchState === "contact" || plan.launchState === "coming-soon" ? "Contact us" : "Select plan"}</button>
            </article>
          );
        })}
      </section>

      <section className="pricing-addons">
        <article className="settings-card">
          <span>{isZh ? "加购" : "ADD-ONS"}</span>
          <h2>{EXTRA_DRAFT_SCRIPT_CREDIT.name}</h2>
          <p>{EXTRA_DRAFT_SCRIPT_CREDIT.description}</p>
          <strong>${EXTRA_DRAFT_SCRIPT_CREDIT.priceUsd}</strong>
        </article>
        {KK_CREDIT_PACKS.map((pack) => (
          <article className="settings-card" key={pack.id}>
            <span>{pack.kkCredits.toLocaleString()} KK币</span>
            <h2>{pack.name}</h2>
            <p>{isZh ? "用于平台 GPT 与图片能力。" : "For platform GPT and image features."}</p>
            <strong>${pack.priceUsd}</strong>
          </article>
        ))}
      </section>
    </main>
  );
}
