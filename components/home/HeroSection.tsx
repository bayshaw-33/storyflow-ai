"use client";

import { BRAND_NAME } from "@/lib/brand";
import { useI18n } from "@/lib/i18n/useI18n";

type HeroSectionProps = {
  onStartCreating: () => void;
};

export function HeroSection({ onStartCreating }: HeroSectionProps) {
  const { t } = useI18n();

  return (
    <section className="kk-hero" aria-labelledby="kk-home-title">
      <div className="kk-hero-copy">
        <h1 id="kk-home-title">{BRAND_NAME}</h1>
        <p>{t("home.hero.subtitle")}</p>
        <button className="kk-primary-cta" type="button" onClick={onStartCreating}>
          {t("action.startCreating")}
        </button>
      </div>
    </section>
  );
}
