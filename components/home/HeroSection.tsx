"use client";

import { useI18n } from "@/lib/i18n/useI18n";

type HeroSectionProps = {
  onStartCreating: () => void;
};

export function HeroSection({ onStartCreating }: HeroSectionProps) {
  const { t } = useI18n();
  const title = t("landing.hero.title");
  const titleParts = title.includes(" starts ")
    ? ["Every great story", "starts in the dark."]
    : title.includes("，")
      ? title.split("，")
      : [title];

  return (
    <section className="kiikis-hero" aria-labelledby="kiikis-hero-title">
      <div className="hero-cosmos" aria-hidden="true">
        <img src="/brand/kiikis-hero-clean.jpg" alt="" />
      </div>

      <div className="hero-copy">
        <span className="hero-kicker">{t("landing.hero.kicker")}</span>
        <h1 id="kiikis-hero-title">
          {titleParts[0]}
          {titleParts[1] ? <span>{titleParts[1]}</span> : null}
        </h1>
        <p>{t("landing.hero.subtitle")}</p>
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
