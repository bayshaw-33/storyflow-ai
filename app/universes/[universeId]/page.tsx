"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, CheckCircle2, Download, FilePlus2, Loader2, XCircle } from "lucide-react";
import { createContinuationProject, upsertProject } from "@/lib/projects";
import { upsertProjectToSupabase } from "@/lib/supabase/projects";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  acceptInboxItem,
  buildInheritedStoryBible,
  buildProjectLink,
  canUseUniverseEngine,
  createUniverseJsonExport,
  DEFAULT_INHERITANCE_SETTINGS,
  exportUniverseMarkdown,
  getUniverseBundle,
  readUniverseEntitlement,
  rejectInboxItem,
  UniverseBundle,
  UniverseInboxItem,
  UniverseProjectRole,
  upsertUniverseProjectLink,
} from "@/lib/universe";

type TabKey = "overview" | "characters" | "relationships" | "timeline" | "facts" | "inbox" | "projects" | "checks";

export default function UniverseDetailPage() {
  const params = useParams<{ universeId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [bundle, setBundle] = useState<UniverseBundle | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [entitlement, setEntitlement] = useState(canUseUniverseEngine(null));
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    projectRole: "main_season" as UniverseProjectRole,
    seasonNumber: 2,
    market: "North America",
    language: "English",
    episodeCount: 24,
    episodeDuration: "2 minutes",
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
  }, [params.universeId]);

  async function refresh(nextSession: Session | null = session) {
    setLoading(true);
    const accessToken = nextSession?.access_token || null;
    const [nextBundle, nextEntitlement] = await Promise.all([
      getUniverseBundle(params.universeId, { accessToken }),
      readUniverseEntitlement({ accessToken }).catch(() => canUseUniverseEngine({ email: nextSession?.user.email || "" })),
    ]);
    setBundle(nextBundle);
    setEntitlement(nextEntitlement);
    setLoading(false);
  }

  async function acceptItem(item: UniverseInboxItem, editedPayload?: Record<string, unknown>) {
    await acceptInboxItem(item, editedPayload, { accessToken: session?.access_token });
    setStatus("Inbox item accepted into canon.");
    await refresh();
  }

  async function rejectItem(item: UniverseInboxItem) {
    await rejectInboxItem(item, { accessToken: session?.access_token });
    setStatus("Inbox item rejected.");
    await refresh();
  }

  async function createProjectFromUniverse() {
    if (!bundle) return;
    if (!entitlement.canUse) {
      setError(entitlement.reason);
      return;
    }
    const title = createForm.title.trim();
    if (!title) {
      setError("Project title is required.");
      return;
    }

    const inheritanceSettings = DEFAULT_INHERITANCE_SETTINGS;
    const project = createContinuationProject({
      title,
      market: createForm.market,
      targetLanguage: createForm.language,
      episodeCount: createForm.episodeCount,
      episodeDuration: createForm.episodeDuration,
      universeId: bundle.universe.id,
      seasonNumber: createForm.seasonNumber,
      projectRole: createForm.projectRole,
      inheritanceSettings,
      storyBible: buildInheritedStoryBible(bundle, inheritanceSettings),
      idea: [
        `Inherited from Universe: ${bundle.universe.name}`,
        bundle.universe.description,
        "",
        "Canon inheritance summary:",
        bundle.canonFacts.slice(0, 12).map((fact) => `- ${fact.fact_text}`).join("\n"),
      ].join("\n"),
    });
    const link = buildProjectLink({
      universeId: bundle.universe.id,
      projectId: project.id,
      userId: session?.user.id || null,
      projectRole: createForm.projectRole,
      seasonNumber: createForm.seasonNumber,
      inheritanceSettings,
    });

    upsertProject(project);
    await Promise.allSettled([
      upsertProjectToSupabase(project, { accessToken: session?.access_token }),
      upsertUniverseProjectLink(link, { accessToken: session?.access_token }),
    ]);

    router.push(`/projects/${project.id}`);
  }

  function exportBundle(format: "json" | "md") {
    if (!bundle) return;
    const content = format === "json" ? createUniverseJsonExport(bundle) : exportUniverseMarkdown(bundle);
    downloadBlob(`${safeFileName(bundle.universe.name)}-universe.${format === "json" ? "json" : "md"}`, content, format === "json" ? "application/json" : "text/markdown");
  }

  const tabs = useMemo<Array<{ key: TabKey; label: string; count?: number }>>(() => [
    { key: "overview", label: "Overview" },
    { key: "characters", label: "Characters", count: bundle?.entities.filter((item) => item.type === "character").length },
    { key: "relationships", label: "Relationships", count: bundle?.relationships.length },
    { key: "timeline", label: "Timeline", count: bundle?.timeline.length },
    { key: "facts", label: "Canon Facts", count: bundle?.canonFacts.length },
    { key: "inbox", label: "Inbox", count: bundle?.inbox.filter((item) => item.status === "pending").length },
    { key: "projects", label: "Linked Projects", count: bundle?.links.length },
    { key: "checks", label: "Canon Checks", count: bundle?.reports.length },
  ], [bundle]);

  if (loading) {
    return (
      <main className="app-shell">
        <section className="empty-state">
          <Loader2 className="spin" size={28} />
          <h1>Loading Universe</h1>
        </section>
      </main>
    );
  }

  if (!bundle) {
    return (
      <main className="app-shell">
        <section className="empty-state">
          <h1>Universe not found</h1>
          <Link className="primary-button" href="/universes">Back to Universes</Link>
        </section>
      </main>
    );
  }

  const characters = bundle.entities.filter((item) => item.type === "character");
  const locations = bundle.entities.filter((item) => item.type === "location");
  const pendingInbox = bundle.inbox.filter((item) => item.status === "pending");

  return (
    <main className="app-shell universe-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <Link className="icon-button" href="/universes" title="Back">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <span className="kicker">Universe</span>
            <h1>{bundle.universe.name}</h1>
          </div>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={() => exportBundle("json")}><Download size={17} /> JSON</button>
          <button className="secondary-button" onClick={() => exportBundle("md")}><Download size={17} /> MD</button>
          <button className="primary-button" onClick={() => setCreateOpen(true)} disabled={!entitlement.canUse}>
            <FilePlus2 size={17} /> Create Project
          </button>
        </div>
      </header>

      {status ? <div className="notice success"><CheckCircle2 size={16} /> {status}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      <nav className="universe-tabs">
        {tabs.map((tab) => (
          <button key={tab.key} className={activeTab === tab.key ? "active" : ""} onClick={() => setActiveTab(tab.key)}>
            {tab.label}{typeof tab.count === "number" ? <span>{tab.count}</span> : null}
          </button>
        ))}
      </nav>

      {activeTab === "overview" ? (
        <section className="universe-detail-grid">
          <article className="universe-panel large">
            <span className="kicker">Overview</span>
            <h2>{bundle.universe.description || "No description yet."}</h2>
            <div className="universe-meta">
              <span>{bundle.universe.genre || "Genre TBD"}</span>
              <span>{bundle.universe.default_language}</span>
              <span>{bundle.universe.target_markets.join(", ") || "Markets TBD"}</span>
              <span>{bundle.universe.access_level}</span>
            </div>
          </article>
          <article className="universe-panel">
            <span className="kicker">Canon State</span>
            <h2>{bundle.snapshots[0]?.title || "No state snapshot"}</h2>
            <p>{bundle.snapshots[0]?.summary || "Accept state changes from Inbox to build current canon state."}</p>
          </article>
          <article className="universe-panel">
            <span className="kicker">Counts</span>
            <div className="universe-counts">
              <strong>{characters.length}<span>Characters</span></strong>
              <strong>{bundle.canonFacts.length}<span>Facts</span></strong>
              <strong>{bundle.timeline.length}<span>Events</span></strong>
              <strong>{pendingInbox.length}<span>Inbox</span></strong>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "characters" ? <ListSection items={characters} render={(item) => ({ title: item.name, body: item.summary, meta: item.status })} /> : null}
      {activeTab === "relationships" ? <ListSection items={bundle.relationships} render={(item) => ({ title: item.relationship_type, body: item.summary, meta: item.status })} /> : null}
      {activeTab === "timeline" ? <ListSection items={bundle.timeline} render={(item) => ({ title: item.title, body: item.description, meta: item.date_label || item.status })} /> : null}
      {activeTab === "facts" ? <ListSection items={bundle.canonFacts} render={(item) => ({ title: item.fact_text, body: item.source_location_text || "", meta: `${item.importance}${item.is_locked ? " / locked" : ""}` })} /> : null}
      {activeTab === "projects" ? <ListSection items={bundle.links} render={(item) => ({ title: item.project_id, body: JSON.stringify(item.inheritance_settings), meta: item.project_role })} /> : null}
      {activeTab === "checks" ? <ListSection items={bundle.reports} render={(item) => ({ title: `Score ${item.score}`, body: item.issues_json.map((issue) => `${issue.severity}: ${issue.title}`).join("\n"), meta: new Date(item.created_at).toLocaleString() })} /> : null}

      {activeTab === "inbox" ? (
        <section className="universe-list">
          {bundle.inbox.length === 0 ? <div className="empty-state"><h2>Inbox is empty</h2><p>Extract updates from a project workspace to review canon candidates here.</p></div> : null}
          {bundle.inbox.map((item) => (
            <article className="universe-row" key={item.id}>
              <div>
                <span>{item.item_type} / {Math.round(item.confidence * 100)}% / {item.status}</span>
                <h2>{item.title}</h2>
                <p>{item.source_excerpt}</p>
                <pre>{JSON.stringify(item.proposed_payload, null, 2)}</pre>
              </div>
              <div className="universe-row-actions">
                <button className="primary-button" disabled={item.status !== "pending" || !entitlement.canUse} onClick={() => acceptItem(item)}>
                  <CheckCircle2 size={16} /> Accept
                </button>
                <button className="secondary-button" disabled={item.status !== "pending" || !entitlement.canUse} onClick={() => rejectItem(item)}>
                  <XCircle size={16} /> Reject
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {locations.length && activeTab === "overview" ? (
        <section className="universe-list">
          <h2>Locations</h2>
          {locations.slice(0, 6).map((item) => (
            <article className="universe-row" key={item.id}>
              <div>
                <span>{item.status}</span>
                <h2>{item.name}</h2>
                <p>{item.summary}</p>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {createOpen ? (
        <div className="modal-backdrop">
          <div className="modal wizard-modal">
            <h2>Create Project from Universe</h2>
            <p>The new project starts with a Story Bible initialized from canon facts, state, characters and relationships.</p>
            <div className="wizard-grid">
              <label>Title<input value={createForm.title} onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))} autoFocus /></label>
              <label>
                Role
                <select value={createForm.projectRole} onChange={(event) => setCreateForm((current) => ({ ...current, projectRole: event.target.value as UniverseProjectRole }))}>
                  <option value="main_season">Main season</option>
                  <option value="spin_off">Spin-off</option>
                  <option value="prequel">Prequel</option>
                  <option value="adaptation">Adaptation</option>
                  <option value="localization">Localization</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>Season<input type="number" value={createForm.seasonNumber} onChange={(event) => setCreateForm((current) => ({ ...current, seasonNumber: Number(event.target.value) || 1 }))} /></label>
              <label>Market<input value={createForm.market} onChange={(event) => setCreateForm((current) => ({ ...current, market: event.target.value }))} /></label>
              <label>Language<input value={createForm.language} onChange={(event) => setCreateForm((current) => ({ ...current, language: event.target.value }))} /></label>
              <label>Episodes<input type="number" value={createForm.episodeCount} onChange={(event) => setCreateForm((current) => ({ ...current, episodeCount: Number(event.target.value) || 12 }))} /></label>
            </div>
            <label>Episode duration<input value={createForm.episodeDuration} onChange={(event) => setCreateForm((current) => ({ ...current, episodeDuration: event.target.value }))} /></label>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="primary-button" onClick={createProjectFromUniverse}>Create</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ListSection<T>({ items, render }: { items: T[]; render: (item: T) => { title: string; body: string; meta: string } }) {
  return (
    <section className="universe-list">
      {items.length === 0 ? <div className="empty-state"><h2>No records yet</h2></div> : null}
      {items.map((item, index) => {
        const row = render(item);
        return (
          <article className="universe-row" key={index}>
            <div>
              <span>{row.meta}</span>
              <h2>{row.title}</h2>
              {row.body ? <p>{row.body}</p> : null}
            </div>
          </article>
        );
      })}
    </section>
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
