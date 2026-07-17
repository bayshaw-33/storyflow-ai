"use client";

import { useI18n } from "@/lib/i18n/useI18n";

/**
 * T01 §4 点亮演示区（Ignite v0，静态 mock）
 * 左：未点亮卡组（黑 / 白 / 水泥灰 Universe 卡）
 * 右：点亮中卡组（金 / 蓝 / 紫红 三枚签名色星球卡）
 * 文案沿用现网「核心隐喻」区位原文（landing.metaphor.*）
 */
const UNLIT = [
  { id: "universe-black", tone: "black", label: "Universe · Draft" },
  { id: "universe-white", tone: "white", label: "Universe · Outline" },
  { id: "universe-concrete", tone: "concrete", label: "Universe · Sketch" },
];

const LIT = [
  { id: "lit-gold", tone: "gold" },
  { id: "lit-blue", tone: "blue" },
  { id: "lit-purple", tone: "purple" },
];

export function IgniteDemoSection() {
  const { t, locale } = useI18n();
  const isZh = locale === "zh-CN";

  return (
    <section className="ignite-section" aria-labelledby="ignite-title">
      <p className="ignite-kicker">{t("landing.metaphor.kicker")}</p>
      <h2 id="ignite-title" className="ignite-title">{t("landing.metaphor.title")}</h2>
      <p className="ignite-subtitle">{t("landing.metaphor.subtitle")}</p>

      <div className="ignite-stage">
        {/* 左：未点亮卡组 */}
        <div className="ignite-column ignite-column-unlit" aria-label={isZh ? "未点亮" : "Unlit"}>
          <p className="ignite-column-label">
            {isZh ? "未点亮 · UNLIT" : "Unlit"}
          </p>
          <div className="ignite-card-stack">
            {UNLIT.map((c) => (
              <div key={c.id} className="ignite-card ignite-card-unlit" data-tone={c.tone}>
                <div className="ignite-card-orb ignite-orb-dim" />
                <p className="ignite-card-label">{c.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 中间：点亮箭头 */}
        <div className="ignite-arrow" aria-hidden="true">
          <span className="ignite-arrow-glyph">→</span>
          <p className="ignite-arrow-label">{t("landing.metaphor.light")}</p>
        </div>

        {/* 右：点亮中卡组 */}
        <div className="ignite-column ignite-column-lit" aria-label={isZh ? "点亮中" : "Lit"}>
          <p className="ignite-column-label">
            {isZh ? "点亮中 · LIT" : "Lit"}
          </p>
          <div className="ignite-card-stack">
            {LIT.map((c) => (
              <div key={c.id} className="ignite-card ignite-card-lit" data-tone={c.tone}>
                <div className="ignite-card-orb ignite-orb-lit" data-tone={c.tone} />
                <p className="ignite-card-label">
                  {isZh ? "已点亮的星球" : "Lit planet"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ignite-footnote">
        <span>{t("landing.metaphor.write")}</span>
        <span className="ignite-footnote-sep">·</span>
        <span>{t("landing.metaphor.build")}</span>
        <span className="ignite-footnote-sep">·</span>
        <span>{t("landing.metaphor.light")}</span>
      </div>
    </section>
  );
}
