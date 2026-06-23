"use client";

import Link from "next/link";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { CatMark } from "@/components/brand/CatMark";
import { useI18n } from "@/lib/i18n/useI18n";

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
  const statusLabel = {
    active: language === "zh" ? "在线" : "Active",
    idle: language === "zh" ? "待命" : "Idle",
  };

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
    </main>
  );
}
