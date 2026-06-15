"use client";

import { useI18n } from "@/lib/i18n/useI18n";

type HeroSectionProps = {
  onStartCreating: () => void;
};

export function HeroSection({ onStartCreating }: HeroSectionProps) {
  const { t, locale } = useI18n();
  const isZh = locale === "zh-CN";

  return (
    <section className="kiikis-hero" aria-labelledby="kiikis-hero-title">
      <div className="hero-cosmos" aria-hidden="true">
        <img src="/brand/kiikis-hero-clean.jpg" alt="" />
      </div>

      <div className="hero-copy">
        <span className="hero-kicker">{t("landing.hero.kicker")}</span>
        <h1 id="kiikis-hero-title">
          {isZh ? (
            <>
              <span className="hero-line">每个伟大的故事</span>
              <span className="hero-line">都从黑暗开始。</span>
            </>
          ) : (
            <>
              <span className="hero-line">Every great story</span>
              <span className="hero-line">starts in the dark.</span>
            </>
          )}
        </h1>
        <p>
          {isZh
            ? "从灵感到故事。从想法到宇宙。释放你的想象力。"
            : "From spark to story. From idea to universe. Your imagination. Unlocked."}
        </p>
        <div className="hero-actions">
          <button className="kk-primary-cta" type="button" onClick={onStartCreating}>
            {t("landing.hero.primary")}
          </button>
          <button className="kk-secondary-cta" type="button">
            {t("landing.hero.secondary")}
          </button>
        </div>
      </div>
    </section>
  );
}
