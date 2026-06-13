"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, Download, Lock, Plus, Sparkles } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  canUseUniverseEngine,
  createUniverseJsonExport,
  exportUniverseMarkdown,
  getUniverseBundle,
  listUniverses,
  readUniverseEntitlement,
  Universe,
  upsertUniverse,
} from "@/lib/universe";

type UniverseForm = {
  name: string;
  description: string;
  genre: string;
  default_language: string;
  target_markets: string;
  tone: string;
};

export default function UniversesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState("");
  const [entitlement, setEntitlement] = useState(canUseUniverseEngine(null));
  const [form, setForm] = useState<UniverseForm>({
    name: "",
    description: "",
    genre: "",
    default_language: "English",
    target_markets: "North America",
    tone: "",
  });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      void refresh(data.session || null);
    });

    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        void refresh(nextSession);
      }) || {};

    if (!supabase) void refresh(null);
    return () => listener?.subscription.unsubscribe();
  }, []);

  async function refresh(nextSession: Session | null = session) {
    const accessToken = nextSession?.access_token || null;
    const [items, nextEntitlement] = await Promise.all([
      listUniverses({ accessToken }),
      readUniverseEntitlement({ accessToken }).catch(() => canUseUniverseEngine({ email: nextSession?.user.email || "" })),
    ]);
    setUniverses(items);
    setEntitlement(nextEntitlement);
    setLoaded(true);
  }

  async function createUniverse() {
    if (!entitlement.canUse) {
      setError(entitlement.reason);
      return;
    }
    const name = form.name.trim();
    if (!name) {
      setError("Universe name is required.");
      return;
    }

    const now = new Date().toISOString();
    const universe: Universe = {
      id: crypto.randomUUID(),
      user_id: session?.user.id || null,
      name,
      description: form.description.trim(),
      genre: form.genre.trim(),
      default_language: form.default_language.trim() || "English",
      target_markets: form.target_markets.split(",").map((item) => item.trim()).filter(Boolean),
      tone: form.tone.trim(),
      status: "active",
      access_level: "studio_annual",
      metadata: { source: "manual_create" },
      created_at: now,
      updated_at: now,
    };
    await upsertUniverse(universe, { accessToken: session?.access_token });
    setCreateOpen(false);
    setForm({ name: "", description: "", genre: "", default_language: "English", target_markets: "North America", tone: "" });
    setError("");
    await refresh();
  }

  async function exportUniverse(universeId: string, format: "json" | "md") {
    const bundle = await getUniverseBundle(universeId, { accessToken: session?.access_token });
    if (!bundle) return;
    const content = format === "json" ? createUniverseJsonExport(bundle) : exportUniverseMarkdown(bundle);
    const extension = format === "json" ? "json" : "md";
    downloadBlob(`${safeFileName(bundle.universe.name)}-universe.${extension}`, content, format === "json" ? "application/json" : "text/markdown");
  }

  const sorted = useMemo(() => [...universes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [universes]);

  return (
    <main className="app-shell universe-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <Link className="icon-button" href="/" title="Back">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <span className="kicker">IP Universe Engine</span>
            <h1>Universes</h1>
          </div>
        </div>
        <div className="header-actions">
          {!entitlement.canUse ? <span className="universe-lock"><Lock size={15} /> Studio Annual / Enterprise</span> : null}
          <button className="primary-button" onClick={() => setCreateOpen(true)}>
            <Plus size={18} /> New Universe
          </button>
        </div>
      </header>

      {!entitlement.canUse ? (
        <section className="universe-upgrade-band">
          <div>
            <span className="kicker">Premium capability</span>
            <h2>Universe Engine is for Studio Annual / Enterprise</h2>
            <p>Upgrade one finished project into a reusable IP universe. Free users can review and export owned universes, but creation, inheritance, writeback and Canon Check stay locked.</p>
          </div>
          <Lock size={28} />
        </section>
      ) : null}

      <section className="universe-grid">
        {loaded && sorted.length === 0 ? (
          <div className="empty-state">
            <Sparkles size={28} />
            <h2>No universes yet</h2>
            <p>Create a new Universe here, or upgrade an existing project from its workspace.</p>
          </div>
        ) : null}

        {sorted.map((universe) => (
          <article className="universe-card" key={universe.id}>
            <div>
              <span>{universe.access_level}</span>
              <h2>{universe.name}</h2>
              <p>{universe.description || "No description yet."}</p>
            </div>
            <div className="universe-meta">
              <span>{universe.genre || "Genre TBD"}</span>
              <span>{universe.default_language}</span>
              <span>{universe.target_markets.join(", ") || "Markets TBD"}</span>
              <span>{new Date(universe.updated_at).toLocaleDateString()}</span>
            </div>
            <div className="universe-actions">
              <Link className="primary-button" href={`/universes/${universe.id}`}>Open</Link>
              <button className="secondary-button" onClick={() => exportUniverse(universe.id, "json")} title="Export JSON">
                <Download size={16} /> JSON
              </button>
              <button className="secondary-button" onClick={() => exportUniverse(universe.id, "md")} title="Export Markdown">
                <Download size={16} /> MD
              </button>
            </div>
          </article>
        ))}
      </section>

      {createOpen ? (
        <div className="modal-backdrop">
          <div className="modal wizard-modal">
            <h2>Create Universe</h2>
            <p>Set up the long-term IP layer. Project extraction can happen later from a workspace.</p>
            <div className="wizard-grid">
              <label>
                Name
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} autoFocus />
              </label>
              <label>
                Genre
                <input value={form.genre} onChange={(event) => setForm((current) => ({ ...current, genre: event.target.value }))} />
              </label>
              <label>
                Default language
                <input value={form.default_language} onChange={(event) => setForm((current) => ({ ...current, default_language: event.target.value }))} />
              </label>
              <label>
                Target markets
                <input value={form.target_markets} onChange={(event) => setForm((current) => ({ ...current, target_markets: event.target.value }))} />
              </label>
            </div>
            <label>
              Description
              <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </label>
            <label>
              Tone / style guide
              <textarea value={form.tone} onChange={(event) => setForm((current) => ({ ...current, tone: event.target.value }))} />
            </label>
            {error ? <div className="notice error">{error}</div> : null}
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="primary-button" onClick={createUniverse}>Create</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "").trim() || "storyflow-universe";
}
