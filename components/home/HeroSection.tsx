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
        token="HERO_BACKDROP"
        className="hero-asset-layer layer-backdrop"
        alt=""
        aria-hidden="true"
        draggable={false}
        priority
      />
      <DesignAssetImage
        token="HERO_ENVIRONMENT"
        className="hero-asset-layer layer-env"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <DesignAssetImage
        token="HERO_STARFIELD"
        className="hero-asset-layer layer-starfield"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <DesignAssetImage
        token="HERO_NEBULA"
        className="hero-asset-layer layer-nebula"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <DesignAssetImage
        token="HERO_ATMOSPHERE"
        className="hero-asset-layer layer-atmo"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <DesignAssetImage
        token="HERO_MAIN"
        className="hero-asset-layer layer-main"
        alt=""
        aria-hidden="true"
        draggable={false}
        priority
      />

      <div className="hero-content hero-copy layer-ui">
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
    </div>
  );
}
