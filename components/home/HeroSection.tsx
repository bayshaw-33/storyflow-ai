"use client";

import { useI18n } from "@/lib/i18n/useI18n";
import { DesignAssetImage } from "@/components/design/DesignAssetImage";

type HeroSectionProps = {
  onStartCreating: () => void;
};

export function HeroSection({ onStartCreating }: HeroSectionProps) {
  const { t, locale } = useI18n();
  const isZh = locale === "zh-CN";

  return (
    <div className="hero-root" aria-labelledby="kiikis-hero-title">
      <DesignAssetImage
        token="HERO_MAIN"
        className="hero-asset-layer layer-main"
        alt=""
        aria-hidden="true"
        draggable={false}
        priority
      />

      <div className="hero-content hero-copy layer-ui">
        <h1 id="kiikis-hero-title">
          {isZh ? (
            <>
              <span className="hero-line">每一个宇宙，</span>
              <span className="hero-line">都始于一个念头 ×</span>
            </>
          ) : (
            <>
              <span className="hero-line">Every universe</span>{" "}
              <span className="hero-line">begins with one idea.</span>
            </>
          )}
        </h1>
        <p>
          {isZh
            ? "从故事到影像，让创作彼此相连，让成果持续积累。"
            : "From story to screen, every step connects—and every creation builds on the last."}
        </p>
        <div className="hero-actions">
          <button className="kk-primary-cta" type="button" onClick={onStartCreating}>
            {t("landing.hero.primary")}
          </button>
        </div>
      </div>
    </div>
  );
}
