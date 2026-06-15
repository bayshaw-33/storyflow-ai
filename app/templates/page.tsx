import Link from "next/link";
import { KiikisLogo } from "@/components/brand/KiikisLogo";

const templates = [
  ["Short Drama", "Vertical episodes, high-density turns, hooks, and delivery package.", "9 steps", "Focused"],
  ["Novel", "Serialized arcs, chapter plans, world logic, and character continuity.", "12 steps", "Deep"],
  ["Film Script", "Feature concepts, treatment, scenes, rewrites, and final draft.", "10 steps", "Pro"],
  ["MV Concept", "Music video story frames, mood, visual metaphors, and direction.", "6 steps", "Beta"],
  ["Custom Workflow", "Assemble a studio-specific production path from reusable steps.", "Custom", "Studio"],
];

export default function TemplatesPage() {
  return (
    <main className="cosmic-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
        <nav>
          <Link href="/">Dashboard</Link>
          <Link href="/universes">Universe</Link>
          <Link href="/companions">Companions</Link>
          <Link href="/subscription">Pricing</Link>
          <Link href="/settings">Settings</Link>
        </nav>
      </header>

      <section className="cosmic-title-band">
        <span>TEMPLATES / WORKFLOWS</span>
        <h1>Start from the right orbit.</h1>
        <p>Choose a production path for the story world you want to build.</p>
      </section>

      <section className="template-page-grid">
        {templates.map(([title, description, steps, difficulty]) => (
          <article className="template-page-card" key={title}>
            <span className="template-cosmic-thumb" />
            <h2>{title}</h2>
            <p>{description}</p>
            <div>
              <span>{steps}</span>
              <span>{difficulty}</span>
            </div>
            <Link href="/#dashboard">Start</Link>
          </article>
        ))}
      </section>
    </main>
  );
}
