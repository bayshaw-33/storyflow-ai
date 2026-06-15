"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { DEFAULT_PLAN_ID, getPlanEntitlement, type PlanId } from "@/lib/billing/plans";
import { STORAGE_KEY } from "@/lib/projects";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";

const PLAN_STORAGE_KEY = "kiikis_plan_id";

export default function SettingsPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [projectCount, setProjectCount] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [planId, setPlanId] = useState<PlanId>(DEFAULT_PLAN_ID);

  useEffect(() => {
    setProjectCount(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").length);
    const storedPlan = localStorage.getItem(PLAN_STORAGE_KEY) as PlanId | null;
    if (storedPlan) setPlanId(storedPlan);

    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => setSession(data.session || null));
  }, []);

  const plan = useMemo(() => getPlanEntitlement(planId), [planId]);
  const providerLocked = !plan.modelAccess.bringYourOwnApi;

  function updatePlan(nextPlan: PlanId) {
    setPlanId(nextPlan);
    localStorage.setItem(PLAN_STORAGE_KEY, nextPlan);
  }

  const cards = [
    ["Account", session?.user.email || "Local draft mode"],
    ["Profile", isZh ? "作者名称、团队身份与公开工作区标签。" : "Writer name, team identity, and public workspace label."],
    ["Language", isZh ? "全局界面语言。" : "Global interface language."],
    ["Appearance", isZh ? "深色外观与编辑密度。" : "Dark appearance and editor density."],
    ["Plan & Usage", isZh ? "当前套餐、初稿额度和 KK币。" : "Current plan, draft credits, and KK coins."],
    ["AI Provider", isZh ? "根据套餐权益启用模型能力。" : "Provider capabilities follow plan entitlement."],
    ["API Key Settings", isZh ? "密钥不会在浏览器界面暴露。" : "Secrets are never exposed in browser UI."],
    ["Security", isZh ? "登录、会话与工作区保护。" : "Authentication, session, and workspace protection."],
    ["Integrations", isZh ? "未来导出、存储和制作连接器。" : "Future export, storage, and production connectors."],
  ];

  return (
    <main className="cosmic-page settings-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
        <nav>
          <Link href="/dashboard">{isZh ? "工作台" : "Dashboard"}</Link>
          <Link href="/universes">{isZh ? "宇宙" : "Universe"}</Link>
          <Link href="/companions">{isZh ? "伙伴" : "Companions"}</Link>
          <Link href="/templates">{isZh ? "模板" : "Templates"}</Link>
          <Link href="/subscription">{isZh ? "订阅" : "Pricing"}</Link>
        </nav>
      </header>

      <section className="cosmic-title-band">
        <span>{isZh ? "设置" : "SETTINGS"}</span>
        <h1>{isZh ? "控制你的 kiikis 工作区。" : "Control your kiikis workspace."}</h1>
        <p>{session?.user.email || "Local draft mode"} / {projectCount} {isZh ? "本地项目" : "local projects"}</p>
      </section>

      <section className="settings-grid">
        {cards.map(([title, description]) => (
          <article className="settings-card" key={title}>
            <span>{title}</span>
            <p>{description}</p>

            {title === "Language" ? <LanguageToggle /> : null}

            {title === "Plan & Usage" ? (
              <div className="plan-usage-panel">
                <label>
                  {isZh ? "当前套餐" : "Current plan"}
                  <select value={planId} onChange={(event) => updatePlan(event.target.value as PlanId)}>
                    <option value="free">Free</option>
                    <option value="elite">Elite</option>
                    <option value="pro">Pro</option>
                    <option value="universe">Universe</option>
                  </select>
                </label>
                <dl className="plan-entitlements">
                  <div><dt>{isZh ? "初稿额度" : "Draft Script Credits"}</dt><dd>{plan.draftScriptCreditsMonthly ?? 0}</dd></div>
                  <div><dt>KK币</dt><dd>{plan.kkCreditsMonthly ?? 0}</dd></div>
                  <div><dt>{isZh ? "媒体 KK币上限" : "Media KK limit"}</dt><dd>{plan.mediaKkLimitMonthly ?? "N/A"}</dd></div>
                  <div><dt>{isZh ? "计费周期" : "Billing cycle"}</dt><dd>{isZh ? "未接入" : "Not connected"}</dd></div>
                </dl>
                <Link className="kk-primary-cta compact" href="/subscription">{isZh ? "升级" : "Upgrade"}</Link>
              </div>
            ) : null}

            {title === "AI Provider" ? (
              <div className="settings-control-row">
                <button>DeepSeek</button>
                <button disabled={providerLocked}>Platform GPT</button>
                <button disabled={providerLocked}>{isZh ? "自带 API" : "User API Key"}</button>
                <p>{providerLocked ? "Free / Elite: DeepSeek only. BYO API disabled." : "Pro / Universe: platform default, provider select, and BYO API available."}</p>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
