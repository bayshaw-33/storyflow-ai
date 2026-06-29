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
        <h1 id="kiikis-hero-title">
          {isZh ? (
            <>
              <span className="hero-line">每一个宇宙，</span>
              <span className="hero-line">都始于一个念头。</span>
            </>
          ) : (
            <>
              <span className="hero-line">Every universe</span>
              <span className="hero-line">begins with one idea.</span>
            </>
          )}
        </h1>
        <p>
          {isZh
            ? "写小说。构剧本。画分镜。剪视频。作曲子。都在一个宇宙里——由你来建造。"
            : "Write the novel. Shape the script. Frame the storyboard. Cut the video. Compose the song. All in one Universe — yours to build."}
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
