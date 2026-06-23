"use client";

import Link from "next/link";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { CatMark } from "@/components/brand/CatMark";
import { useI18n } from "@/lib/i18n/useI18n";

const companions = [
  ["Lyra", "Story Architect", "Active", "Shapes loglines, structure, stakes, and story spine."],
  ["Arlo", "Worldbuilder", "Idle", "Builds worlds, rules, lore, timelines, and continuity."],
  ["Vale", "Dialogue Expert", "Idle", "Tightens voice, subtext, rhythm, and scene turns."],
  ["Muse", "Mood & Tone", "Active", "Keeps atmosphere, emotion, and visual direction aligned."],
  ["KK", "Creative Companion", "Idle", "Ambient status, creative nudge, and room signal."],
];

export default function CompanionsPage() {
  const { t } = useI18n();

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
        {companions.map(([name, role, status, description]) => (
          <article className="companion-card-page" key={name}>
            <div className="companion-card-portrait">
              {name === "KK" ? <CatMark /> : name[0]}
            </div>
            <span data-state={status.toLowerCase()}>{status}</span>
            <h2>{name}</h2>
            <strong>{role}</strong>
            <p>{description}</p>
            <button>{status === "Active" ? "Active" : "Set active"}</button>
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
