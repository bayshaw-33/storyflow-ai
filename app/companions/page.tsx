import Link from "next/link";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { CatMark } from "@/components/brand/CatMark";

const companions = [
  ["Lyra", "Story Architect", "Active", "Shapes loglines, structure, stakes, and story spine."],
  ["Arlo", "Worldbuilder", "Idle", "Builds worlds, rules, lore, timelines, and continuity."],
  ["Vale", "Dialogue Expert", "Idle", "Tightens voice, subtext, rhythm, and scene turns."],
  ["Muse", "Mood & Tone", "Active", "Keeps atmosphere, emotion, and visual direction aligned."],
  ["KK", "Creative Companion", "Idle", "Ambient status, creative nudge, and room signal."],
];

export default function CompanionsPage() {
  return (
    <main className="cosmic-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
        <nav>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/universes">Universe</Link>
          <Link href="/templates">Templates</Link>
          <Link href="/subscription">Pricing</Link>
          <Link href="/settings">Settings</Link>
        </nav>
      </header>

      <section className="cosmic-title-band">
        <span>COMPANIONS</span>
        <h1>AI writers with a quiet signal.</h1>
        <p>Premium creative companions for structure, worlds, dialogue, mood, and ambient project state.</p>
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
          <h2>Add companion</h2>
          <p>Prepare a custom creative role for a future team or studio workflow.</p>
          <button>Unlock later</button>
        </article>
      </section>
    </main>
  );
}
