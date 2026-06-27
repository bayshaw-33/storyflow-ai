"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { DesignAssetImage } from "@/components/design/DesignAssetImage";
import { KK3D } from "@/components/kk/KK3D";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  DEFAULT_KK_CARD_ID,
  getKKCard,
  kkCardImage,
  KK_CARDS,
  KK_EQUIPPED_SKIN_EVENT,
  KK_EQUIPPED_SKIN_STORAGE_KEY,
  type KKCardId,
} from "@/lib/kk/cards";
import type { KKState } from "@/lib/kk/state";

export default function KKPage() {
  const { locale } = useI18n();
  const language = locale === "zh-CN" ? "zh" : "en";
  const isZh = language === "zh";
  const [equippedCardId, setEquippedCardId] = useState<KKCardId>(DEFAULT_KK_CARD_ID);
  const [previewState, setPreviewState] = useState<KKState>("IDLE");
  const equippedCard = useMemo(() => getKKCard(equippedCardId), [equippedCardId]);

  useEffect(() => {
    try {
      setEquippedCardId(getKKCard(window.localStorage.getItem(KK_EQUIPPED_SKIN_STORAGE_KEY)).id);
    } catch {
      setEquippedCardId(DEFAULT_KK_CARD_ID);
    }
  }, []);

  function equipCard(cardId: KKCardId) {
    setEquippedCardId(cardId);
    window.localStorage.setItem(KK_EQUIPPED_SKIN_STORAGE_KEY, cardId);
    window.dispatchEvent(new Event(KK_EQUIPPED_SKIN_EVENT));
  }

  const stateOptions: { state: KKState; label: string }[] = [
    { state: "IDLE", label: isZh ? "待命" : "Idle" },
    { state: "THINKING", label: isZh ? "思考" : "Thinking" },
    { state: "HAPPY", label: isZh ? "完成" : "Happy" },
    { state: "GUIDE", label: isZh ? "引导" : "Guide" },
  ];

  return (
    <main className="cosmic-page kk-companion-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
      </header>

      <section className="cosmic-title-band kk-companion-title">
        <span>KK</span>
        <h1>{isZh ? "动态 3D 创作搭档" : "Dynamic 3D Creative Companion"}</h1>
        <p>
          {isZh
            ? "KK 是常驻工作台的动态 3D 角色，会根据创作状态切换待命、思考、完成和引导动作。"
            : "KK is the persistent 3D companion for the workspace, switching between idle, thinking, success, and guide states."}
        </p>
      </section>

      <section className="kk-3d-console" aria-label={isZh ? "KK 3D 预览" : "KK 3D preview"}>
        <article className="dashboard-panel kk-3d-stage-card">
          <div className="kk-3d-stage">
            <KK3D state={previewState} skinId={equippedCardId} size="lg" />
          </div>
          <div className="kk-3d-state-row">
            {stateOptions.map((option) => (
              <button
                className={previewState === option.state ? "active" : ""}
                type="button"
                key={option.state}
                onClick={() => setPreviewState(option.state)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </article>

        <article className="dashboard-panel kk-3d-info-card">
          <span>{isZh ? "当前装备" : "Equipped"}</span>
          <h2>{equippedCard.name}</h2>
          <p>
            {isZh
              ? "卡牌决定 KK 的视觉主题；右下角真实运行的 KK 使用 3D 动态形象，不再渲染静态 PNG。"
              : "Cards define KK's visual theme. The live corner presence uses a dynamic 3D model instead of a static PNG."}
          </p>
          <dl>
            <div><dt>{isZh ? "稀有度" : "Rarity"}</dt><dd>{equippedCard.rarity}</dd></div>
            <div><dt>{isZh ? "状态" : "State"}</dt><dd>{stateOptions.find((item) => item.state === previewState)?.label}</dd></div>
            <div><dt>{isZh ? "资源类型" : "Runtime"}</dt><dd>{isZh ? "3D 动态 DOM" : "3D animated DOM"}</dd></div>
          </dl>
        </article>
      </section>

      <section className="kk-card-system-panel" aria-labelledby="kk-card-system-title">
        <div className="dashboard-panel-head">
          <div>
            <span>{isZh ? "KK 卡牌" : "KK Cards"}</span>
            <h2 id="kk-card-system-title">{isZh ? "卡牌皮肤库" : "Card Library"}</h2>
          </div>
        </div>
        <div className="kk-card-grid">
          {KK_CARDS.map((card) => {
            const equipped = card.id === equippedCardId;
            return (
              <article className={equipped ? "kk-skin-card is-equipped" : "kk-skin-card"} key={card.id}>
                <DesignAssetImage token={kkCardImage(card, language)} alt={card.name} draggable={false} />
                <div className="kk-skin-card-meta">
                  <span>{card.rarity}{card.isLimited ? " · Limited" : ""}</span>
                  <strong>{card.name}</strong>
                  <button type="button" onClick={() => equipCard(card.id)} disabled={equipped}>
                    {equipped ? (isZh ? "已装备" : "Equipped") : (isZh ? "装备" : "Equip")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
