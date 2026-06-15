"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { STORAGE_KEY } from "@/lib/projects";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type CreditState = {
  balance: number;
  monthlyLimit: number;
  periodEnd: string;
};

const sections = [
  ["Account", "Signed-in identity and cloud sync state."],
  ["Profile", "Creator name, studio identity, and public workspace label."],
  ["Language", "Global interface language for all product surfaces."],
  ["Appearance", "Cosmic dark mode and focus-density controls."],
  ["AI Provider", "Platform default, user API key, and provider selection."],
  ["API Key settings", "Secrets are never exposed in the browser UI."],
  ["Billing", "Plan, usage, invoices, and upgrade state."],
  ["Team", "Studio seats, roles, and shared universe permissions."],
  ["Security", "Session, authentication, and protected workspace state."],
  ["Integrations", "Future export, storage, and production connectors."],
];

export default function SettingsPage() {
  const [projectCount, setProjectCount] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [credits, setCredits] = useState<CreditState | null>(null);

  useEffect(() => {
    setProjectCount(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").length);
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      if (data.session) void loadCredits(data.session);
    });
  }, []);

  async function loadCredits(nextSession: Session) {
    try {
      const response = await fetch("/api/account/credits", {
        headers: { Authorization: `Bearer ${nextSession.access_token}` },
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setCredits({
          balance: data.credits.balance,
          monthlyLimit: data.credits.monthlyLimit,
          periodEnd: data.credits.periodEnd,
        });
      }
    } catch {
      setCredits(null);
    }
  }

  return (
    <main className="cosmic-page settings-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
        <nav>
          <Link href="/">Dashboard</Link>
          <Link href="/universes">Universe</Link>
          <Link href="/companions">Companions</Link>
          <Link href="/templates">Templates</Link>
          <Link href="/subscription">Pricing</Link>
        </nav>
      </header>

      <section className="cosmic-title-band">
        <span>SETTINGS</span>
        <h1>Control the room without breaking the spell.</h1>
        <p>{session?.user.email || "Local draft mode"} · {projectCount} local projects</p>
      </section>

      <section className="settings-grid">
        {sections.map(([title, description]) => (
          <article className="settings-card" key={title}>
            <span>{title}</span>
            <p>{description}</p>
            {title === "Language" ? <LanguageToggle /> : null}
            {title === "AI Provider" ? (
              <div className="settings-control-row">
                <button>Platform default</button>
                <button>User API Key</button>
                <button>Provider select</button>
              </div>
            ) : null}
            {title === "Billing" && credits ? (
              <strong>{credits.balance}/{credits.monthlyLimit} generations left</strong>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
