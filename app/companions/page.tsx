"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { CatMark } from "@/components/brand/CatMark";
import { DesignAssetImage } from "@/components/design/DesignAssetImage";
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

const companions = [
  {
    id: "lyra",
    name: { zh: "Lyra", en: "Lyra" },
    role: { zh: "故事架构师", en: "Story Architect" },
    status: "active",
    description: {
      zh: "负责一句话卖点、结构骨架、戏剧筹码和故事主脊，让灵感真正站起来。",
      en: "Shapes loglines, structure, stakes, and the story spine.",
    },
  },
  {
    id: "arlo",
    name: { zh: "Arlo", en: "Arlo" },
    role: { zh: "世界观筑造者", en: "Worldbuilder" },
    status: "idle",
    description: {
      zh: "梳理世界规则、时间线、设定边界和连续性，让虚构世界有自己的重力。",
      en: "Builds worlds, rules, lore, timelines, and continuity.",
    },
  },
  {
    id: "vale",
    name: { zh: "Vale", en: "Vale" },
    role: { zh: "对白医生", en: "Dialogue Expert" },
    status: "idle",
    description: {
      zh: "打磨人物声线、潜台词、节奏和场景转折，让每句对白都带着动作。",
      en: "Tightens voice, subtext, rhythm, and scene turns.",
    },
  },
  {
    id: "muse",
    name: { zh: "Muse", en: "Muse" },
    role: { zh: "情绪与调性顾问", en: "Mood & Tone" },
    status: "active",
    description: {
      zh: "守住氛围、情绪走向和视觉气质，让作品始终拥有同一种心跳。",
      en: "Keeps atmosphere, emotion, and visual direction aligned.",
    },
  },
  {
    id: "kk",
    name: { zh: "KK", en: "KK" },
    role: { zh: "创作搭档", en: "Creative Companion" },
    status: "idle",
    description: {
      zh: "感知工作台状态，适时给出轻推、提醒和房间信号。",
      en: "Reads the room, offers creative nudges, and keeps the signal alive.",
    },
  },
] satisfies Array<{
  id: string;
  name: Record<"zh" | "en", string>;
  role: Record<"zh" | "en", string>;
  status: "active" | "idle";
  description: Record<"zh" | "en", string>;
}>;

export default function CompanionsPage() {
  const { locale, t } = useI18n();
  const language = locale === "zh-CN" ? "zh" : "en";
  const [equippedCardId, setEquippedCardId] = useState<KKCardId>(DEFAULT_KK_CARD_ID);
  const equippedCard = useMemo(() => getKKCard(equippedCardId), [equippedCardId]);
  const statusLabel = {
    active: language === "zh" ? "在线" : "Active",
    idle: language === "zh" ? "待命" : "Idle",
  };

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

  return (
    <main className="cosmic-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
      </header>

      <section className="cosmic-title-band">
        <span>COMPANIONS</span>
        <h1>{t("companions.hero.title")}</h1>
        <p>{t("companions.hero.subtitle")}</p>
      </section>

      <section className="companion-grid-page">
        {companions.map((companion) => (
          <article className="companion-card-page" key={companion.id}>
            <div className="companion-card-portrait">
              {companion.id === "kk" ? <CatMark /> : companion.name.en[0]}
            </div>
            <span data-state={companion.status}>{statusLabel[companion.status]}</span>
            <h2>{companion.name[language]}</h2>
            <strong>{companion.role[language]}</strong>
            <p>{companion.description[language]}</p>
            <button>{companion.status === "active" ? statusLabel.active : language === "zh" ? "设为当前搭档" : "Set active"}</button>
          </article>
        ))}
        <article className="companion-card-page add-companion">
          <div className="companion-card-portrait">+</div>
          <h2>{t("companions.add.title")}</h2>
          <p>{t("companions.add.body")}</p>
          <button>{t("companions.add.unlock")}</button>
        </article>
      </section>

      <section className="kk-card-system-panel" aria-labelledby="kk-card-system-title">
        <div className="dashboard-panel-head">
          <div>
            <span>{language === "zh" ? "KK 皮肤" : "KK Skins"}</span>
            <h2 id="kk-card-system-title">{language === "zh" ? "卡片皮肤库" : "Card Skin Library"}</h2>
          </div>
        </div>
        <div className="kk-card-system-layout">
          <aside className="kk-card-preview">
            <DesignAssetImage token={equippedCard.skin} alt={equippedCard.name} draggable={false} />
            <div>
              <span>{language === "zh" ? "当前装备" : "Equipped"}</span>
              <strong>{equippedCard.name}</strong>
              <small>{equippedCard.rarity}</small>
            </div>
          </aside>
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
                      {equipped ? (language === "zh" ? "已装备" : "Equipped") : (language === "zh" ? "装备" : "Equip")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
