import Link from "next/link";
import { KiikisLogo } from "@/components/brand/KiikisLogo";

const plans = [
  ["Free", "$0", "limited projects", "basic templates", "limited AI generations"],
  ["Creator", "$19", "more projects", "more AI generations", "export access"],
  ["Pro", "$49", "advanced workflow", "priority generation", "image generation", "more storage"],
  ["Studio", "$149", "team collaboration", "shared universe", "admin controls"],
  ["Enterprise", "Custom", "custom limits", "advanced support", "private deployment options", "custom integrations"],
];

export default function SubscriptionPage() {
  return (
    <main className="cosmic-page pricing-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
        <nav>
          <Link href="/">Dashboard</Link>
          <Link href="/universes">Universe</Link>
          <Link href="/companions">Companions</Link>
          <Link href="/templates">Templates</Link>
          <Link href="/settings">Settings</Link>
        </nav>
      </header>

      <section className="cosmic-title-band">
        <span>SUBSCRIPTION</span>
        <h1>Choose how bright your universe can grow.</h1>
        <p>Plan UI only. Payment wiring remains untouched.</p>
      </section>

      <section className="pricing-table">
        {plans.map(([name, price, ...features]) => (
          <article className={name === "Pro" ? "plan-card featured" : "plan-card"} key={name}>
            <span>{name}</span>
            <h2>{price}</h2>
            <ul>
              {features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <button>{name === "Enterprise" ? "Contact us" : "Select plan"}</button>
          </article>
        ))}
      </section>
    </main>
  );
}
