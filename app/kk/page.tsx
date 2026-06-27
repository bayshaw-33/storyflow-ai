"use client";

import { DesignAssetImage } from "@/components/design/DesignAssetImage";
import { useI18n } from "@/lib/i18n/useI18n";
import { kkCardImage, KK_CARDS } from "@/lib/kk/cards";

export default function KKPage() {
  const { locale } = useI18n();
  const language = locale === "zh-CN" ? "zh" : "en";
  const isZh = language === "zh";

  return (
    <main className="cosmic-page kk-library-page">
      <section className="kk-card-system-panel" aria-labelledby="kk-card-system-title">
        <div className="dashboard-panel-head">
          <div>
            <span>KK</span>
            <h1 id="kk-card-system-title">{isZh ? "卡牌皮肤库" : "Card Skin Library"}</h1>
          </div>
        </div>

        <div className="kk-card-grid">
          {KK_CARDS.map((card) => (
            <article className="kk-skin-card" key={card.id}>
              <DesignAssetImage token={kkCardImage(card, language)} alt={card.name} draggable={false} />
              <div className="kk-skin-card-meta">
                <span>{card.rarity}{card.isLimited ? " · Limited" : ""}</span>
                <strong>{card.name}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
