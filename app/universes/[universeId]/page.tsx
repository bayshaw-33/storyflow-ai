"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, CheckCircle2, Download, FilePlus2, Loader2, XCircle } from "lucide-react";
import {
  createContinuationProject,
  createNovelProject,
  createProject,
  readProjectsFromStorage,
  upsertProject,
  type DramaProject,
  type WorkflowType,
} from "@/lib/projects";
import { readProjectsFromSupabase, upsertProjectToSupabase } from "@/lib/supabase/projects";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";
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
  saveInboxItems,
  type UniverseBundle,
  type UniverseInheritanceSettings,
  type UniverseInboxItem,
  type UniverseProjectRole,
  upsertUniverseProjectLink,
} from "@/lib/universe";

type TabKey = "overview" | "characters" | "relationships" | "timeline" | "facts" | "assets" | "inbox" | "projects" | "checks";

type UniverseAssetRow = {
  title: string;
  type: string;
  url: string;
  prompt: string;
  source: string;
};

type UniverseCreateWorkflow = Exclude<WorkflowType, "viral" | "creation">;

const UNIVERSE_CREATE_WORKFLOWS: Array<{ value: UniverseCreateWorkflow; label: string }> = [
  { value: "continuation", label: "Script Creation" },
  { value: "novel", label: "Novel Creation" },
  { value: "song", label: "Song Creation" },
  { value: "storyboard", label: "Storyboard Creation" },
  { value: "video", label: "Video Creation" },
];

export default function UniverseDetailPage() {
  const params = useParams<{ universeId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [bundle, setBundle] = useState<UniverseBundle | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [entitlement, setEntitlement] = useState(canUseUniverseEngine(null));
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    workflowType: "continuation" as UniverseCreateWorkflow,
    title: "",
    projectRole: "main_season" as UniverseProjectRole,
    seasonNumber: 2,
    market: "North America",
    language: "English",
    episodeCount: 24,
    episodeDuration: "2 minutes",
  });

  // Local projects (for extract / canon-check project selector)
  const [projects, setProjects] = useState<DramaProject[]>([]);
  const [extractProjectId, setExtractProjectId] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [checkProjectId, setCheckProjectId] = useState("");
  const [checking, setChecking] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      const localProjects = readProjectsFromStorage();
      if (!session?.access_token) {
        setProjects(getUniverseSourceProjects(localProjects));
        return;
      }

      const cloudProjects = await readProjectsFromSupabase({ accessToken: session.access_token }).catch(() => []);
      if (!cancelled) setProjects(getUniverseSourceProjects(mergeProjectsForUniverseDetail(localProjects, cloudProjects)));
    }

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );
  const selectableLinks = useMemo(
    () => bundle?.links.filter((link) => projectsById.has(link.project_id)) || [],
    [bundle?.links, projectsById],
  );

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

  async function extractFromProject() {
    const project = projectsById.get(extractProjectId);
    if (!project || !bundle) return;
    setExtracting(true);
    setStatus("");
    setError("");
    try {
      const res = await fetch("/api/universe/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ universeId: params.universeId, project }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => ""));
      const data = await res.json().catch(() => ({}));
      await saveInboxItems(data.items || [], { accessToken: session?.access_token });
      await refresh();
      setStatus("Inbox updated with extracted candidates.");
    } catch {
      setError("Extract failed. Please try again.");
    }
    setExtracting(false);
  }

  async function runCheck() {
    const project = projectsById.get(checkProjectId);
    if (!project || !bundle) return;
    setChecking(true);
    setStatus("");
    setError("");
    try {
      const res = await fetch("/api/universe/canon-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ bundle, project }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => ""));
      await refresh();
      setStatus("Canon check complete.");
    } catch {
      setError("Canon check failed. Please try again.");
    }
    setChecking(false);
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
    const project = buildProjectFromUniverse({
      bundle,
      title,
      workflowType: createForm.workflowType,
      market: createForm.market,
      language: createForm.language,
      episodeCount: createForm.episodeCount,
      episodeDuration: createForm.episodeDuration,
      seasonNumber: createForm.seasonNumber,
      projectRole: createForm.projectRole,
      inheritanceSettings,
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

    router.push(routeForCreatedProject(project));
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
    { key: "assets", label: "Assets", count: bundle ? getAcceptedAssets(bundle).length : 0 },
    { key: "inbox", label: "Inbox", count: bundle?.inbox.filter((item) => item.status === "pending").length },
    { key: "projects", label: "Linked Projects", count: bundle?.links.length },
    { key: "checks", label: "Canon Checks", count: bundle?.reports.length },
  ], [bundle]);

  if (loading) {
    return (
      <main className="app-shell">
        <section className="empty-state">
          <Loader2 className="spin" size={28} />
          <h1>{t("universe.loading")}</h1>
        </section>
      </main>
    );
  }

  if (!bundle) {
    return (
      <main className="app-shell">
        <section className="empty-state">
          <h1>{t("universe.notFound")}</h1>
          <Link className="primary-button" href="/universes">Back to Universes</Link>
        </section>
      </main>
    );
  }

  const characters = bundle.entities.filter((item) => item.type === "character");
  const locations = bundle.entities.filter((item) => item.type === "location");
  const pendingInbox = bundle.inbox.filter((item) => item.status === "pending");
  const hasLinks = selectableLinks.length > 0;
  const acceptedAssets = getAcceptedAssets(bundle);

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
              <strong>{acceptedAssets.length}<span>Assets</span></strong>
              <strong>{pendingInbox.length}<span>Inbox</span></strong>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "characters" ? <ListSection items={characters} render={(item) => ({ title: item.name, body: formatCharacterBody(item.details_json, item.summary), meta: item.status })} /> : null}
      {activeTab === "relationships" ? <ListSection items={bundle.relationships} render={(item) => ({ title: item.relationship_type, body: item.summary, meta: item.status })} /> : null}
      {activeTab === "timeline" ? <ListSection items={bundle.timeline} render={(item) => ({ title: item.title, body: item.description, meta: item.date_label || item.status })} /> : null}
      {activeTab === "facts" ? <ListSection items={bundle.canonFacts} render={(item) => ({ title: item.fact_text, body: item.source_location_text || "", meta: `${item.importance}${item.is_locked ? " / locked" : ""}` })} /> : null}
      {activeTab === "assets" ? (
        <ListSection
          items={acceptedAssets}
          render={(item) => ({
            title: item.title,
            body: [item.prompt, item.url].filter(Boolean).join("\n"),
            meta: `${item.type}${item.source ? ` · ${item.source}` : ""}`,
          })}
        />
      ) : null}

      {activeTab === "projects" ? (
        <ListSection
          items={bundle.links}
          render={(item) => {
            const proj = projectsById.get(item.project_id);
            const enabledFlags = Object.entries(item.inheritance_settings)
              .filter(([, v]) => v)
              .map(([k]) => k.replace(/_/g, " "))
              .join(", ");
            return {
              title: proj?.title || item.project_id,
              body: enabledFlags || "No inheritance settings",
              meta: item.project_role + (item.season_number != null ? ` · S${item.season_number}` : ""),
            };
          }}
        />
      ) : null}

      {activeTab === "inbox" ? (
        <section className="universe-list">
          <div className="universe-action-bar">
            <select
              value={extractProjectId}
              onChange={(e) => setExtractProjectId(e.target.value)}
              disabled={!hasLinks}
            >
              <option value="">— Select project to extract from —</option>
              {selectableLinks.map((link) => {
                const proj = projectsById.get(link.project_id);
                return (
                  <option key={link.project_id} value={link.project_id}>
                    {proj?.title || link.project_id}
                  </option>
                );
              })}
            </select>
            <button
              className="secondary-button"
              onClick={extractFromProject}
              disabled={!hasLinks || !extractProjectId || extracting || !session}
            >
              {extracting ? <Loader2 size={15} className="spin" /> : null}
              Extract Updates
            </button>
          </div>
          {bundle.inbox.length === 0 ? (
            <div className="empty-state">
              <h2>Inbox is empty</h2>
              <p>Select a linked project above and click Extract Updates to review canon candidates here.</p>
            </div>
          ) : null}
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

      {activeTab === "checks" ? (
        <>
          <div className="universe-action-bar">
            <select
              value={checkProjectId}
              onChange={(e) => setCheckProjectId(e.target.value)}
              disabled={!hasLinks}
            >
              <option value="">— Select project to check —</option>
              {selectableLinks.map((link) => {
                const proj = projectsById.get(link.project_id);
                return (
                  <option key={link.project_id} value={link.project_id}>
                    {proj?.title || link.project_id}
                  </option>
                );
              })}
            </select>
            <button
              className="secondary-button"
              onClick={runCheck}
              disabled={!hasLinks || !checkProjectId || checking || !session}
            >
              {checking ? <Loader2 size={15} className="spin" /> : null}
              Run Canon Check
            </button>
          </div>
          <ListSection
            items={bundle.reports}
            render={(item) => ({
              title: `Score ${item.score}`,
              body: item.issues_json.map((issue) => `${issue.severity}: ${issue.title}`).join("\n"),
              meta: new Date(item.created_at).toLocaleString(),
            })}
          />
        </>
      ) : null}

      {locations.length > 0 && activeTab === "overview" ? (
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
            <h2>{t("universe.createProject.title")}</h2>
            <p>{t("universe.createProject.body")}</p>
            <div className="wizard-grid">
              <label>Title<input value={createForm.title} onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))} autoFocus /></label>
              <label>
                Workflow
                <select value={createForm.workflowType} onChange={(event) => setCreateForm((current) => ({ ...current, workflowType: event.target.value as UniverseCreateWorkflow }))}>
                  {UNIVERSE_CREATE_WORKFLOWS.map((workflow) => (
                    <option key={workflow.value} value={workflow.value}>{workflow.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Role
                <select value={createForm.projectRole} onChange={(event) => setCreateForm((current) => ({ ...current, projectRole: event.target.value as UniverseProjectRole }))}>
                  <option value="main_season">{t("universe.projectType.mainSeason")}</option>
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
            <label>{t("universe.episodeDuration.label")}<input value={createForm.episodeDuration} onChange={(event) => setCreateForm((current) => ({ ...current, episodeDuration: event.target.value }))} /></label>
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

function getAcceptedAssets(bundle: UniverseBundle): UniverseAssetRow[] {
  return bundle.snapshots.flatMap((snapshot) => {
    const assets = Array.isArray(snapshot.state_json.assets) ? snapshot.state_json.assets : [];
    return assets
      .filter((asset): asset is Record<string, unknown> => Boolean(asset) && typeof asset === "object" && !Array.isArray(asset))
      .map((asset, index) => ({
        title: stringValue(asset.title) || `${snapshot.title} asset ${index + 1}`,
        type: stringValue(asset.type) || "asset",
        url: stringValue(asset.url),
        prompt: stringValue(asset.prompt),
        source: snapshot.title,
      }));
  });
}

function buildProjectFromUniverse(input: {
  bundle: UniverseBundle;
  title: string;
  workflowType: UniverseCreateWorkflow;
  market: string;
  language: string;
  episodeCount: number;
  episodeDuration: string;
  seasonNumber: number;
  projectRole: UniverseProjectRole;
  inheritanceSettings: UniverseInheritanceSettings;
}): DramaProject {
  const bible = buildInheritedStoryBible(input.bundle, input.inheritanceSettings);
  const inheritanceSummary = buildUniverseInheritanceSummary(input.bundle);
  const shared = {
    title: input.title,
    market: input.market,
    targetLanguage: input.language,
    episodeCount: input.episodeCount,
    episodeDuration: input.episodeDuration,
    universeId: input.bundle.universe.id,
    seasonNumber: input.seasonNumber,
    projectRole: input.projectRole,
    inheritanceSettings: input.inheritanceSettings,
    storyBible: bible,
    idea: inheritanceSummary,
  };

  if (input.workflowType === "novel") {
    return createNovelProject({
      ...shared,
      novelBible: [
        `# ${input.bundle.universe.name}`,
        input.bundle.universe.description,
        "",
        "## Canon",
        input.bundle.canonFacts.slice(0, 20).map((fact) => `- ${fact.fact_text}`).join("\n"),
        "",
        "## Characters",
        input.bundle.entities.filter((entity) => entity.type === "character").slice(0, 12).map((entity) => `- ${entity.name}: ${entity.summary}`).join("\n"),
      ].join("\n"),
      novelBrief: inheritanceSummary,
      novelStyleGuide: input.bundle.universe.tone || bible.languageStyle,
      status: "draft",
    });
  }

  if (input.workflowType === "song") {
    return createProject({
      ...shared,
      workflowType: "song",
      genre: input.bundle.universe.genre || "OST",
      episodeCount: 1,
      episodeDuration: "",
      brief: buildUniverseSongMarkdown(input.bundle, input.title),
      deliveryPackage: buildUniverseSongMarkdown(input.bundle, input.title),
      status: "draft",
    });
  }

  if (input.workflowType === "storyboard") {
    const projectId = `storyboard-${crypto.randomUUID()}`;
    const storyboardState = buildUniverseStoryboardState(input.bundle, projectId, input.title);
    return createProject({
      ...shared,
      id: projectId,
      workflowType: "storyboard",
      genre: "分镜创作",
      importedScript: inheritanceSummary,
      storyboardScript: JSON.stringify(storyboardState, null, 2),
      storyboardEpisodes: storyboardState.scenes.map((scene, index) => ({
        id: scene.id,
        title: scene.title || `Scene ${index + 1}`,
        content: scene.shots.map((shot, shotIndex) => `Shot ${shotIndex + 1}: ${shot.text}`).join("\n"),
      })),
      deliveryPackage: inheritanceSummary,
      status: "draft",
    });
  }

  if (input.workflowType === "video") {
    return createProject({
      ...shared,
      id: `video-project-${crypto.randomUUID()}`,
      workflowType: "video",
      genre: "视频创作",
      storyboardScript: inheritanceSummary,
      deliveryPackage: JSON.stringify(buildUniverseVideoPayload(input.bundle, input.title), null, 2),
      status: "draft",
    });
  }

  return createContinuationProject(shared);
}

function routeForCreatedProject(project: DramaProject) {
  if (project.workflowType === "novel") return `/novel-workbench?projectId=${encodeURIComponent(project.id)}`;
  if (project.workflowType === "song") return `/song-workbench?projectId=${encodeURIComponent(project.id)}`;
  if (project.workflowType === "storyboard") return `/storyboard-workbench?projectId=${encodeURIComponent(project.id)}`;
  if (project.workflowType === "video") return `/video-workbench?projectId=${encodeURIComponent(project.id)}`;
  return `/projects/${project.id}`;
}

function buildUniverseInheritanceSummary(bundle: UniverseBundle) {
  return [
    `Inherited from Universe: ${bundle.universe.name}`,
    bundle.universe.description,
    "",
    "Canon inheritance summary:",
    bundle.canonFacts.slice(0, 12).map((fact) => `- ${fact.fact_text}`).join("\n"),
    "",
    "Characters:",
    bundle.entities.filter((entity) => entity.type === "character").slice(0, 10).map((entity) => `- ${entity.name}: ${entity.summary}`).join("\n"),
    "",
    "Locations:",
    bundle.entities.filter((entity) => entity.type === "location").slice(0, 8).map((entity) => `- ${entity.name}: ${entity.summary}`).join("\n"),
  ].filter(Boolean).join("\n");
}

function buildUniverseSongMarkdown(bundle: UniverseBundle, title: string) {
  const concept = [
    `${title} is an OST/theme song concept inherited from ${bundle.universe.name}.`,
    bundle.universe.description,
    bundle.canonFacts.slice(0, 8).map((fact) => `- ${fact.fact_text}`).join("\n"),
  ].filter(Boolean).join("\n");

  return [
    `# ${title}`,
    "",
    "## 创作设定",
    "- 项目类型：OST / Theme Song",
    `- 输出语言：${bundle.universe.default_language || "English"}`,
    `- 曲风：${bundle.universe.genre || "Not specified"}`,
    `- 情绪：${bundle.universe.tone || "Not specified"}`,
    "- 乐器：Not specified",
    "- 律动：Not specified",
    "- 调性：Not specified",
    "- 结构：Not specified",
    `- 关联 Universe：${bundle.universe.id}`,
    "",
    "## 歌曲概念",
    concept,
    "",
    "## 歌词",
    "未生成",
    "",
    "## Style Prompt",
    "未生成",
    "",
    "## Composition Prompt",
    "未生成",
    "",
    "## 歌词审查",
    "未审查",
  ].join("\n");
}

function buildUniverseStoryboardState(bundle: UniverseBundle, projectId: string, title: string) {
  const locations = bundle.entities.filter((entity) => entity.type === "location").slice(0, 3);
  const facts = bundle.canonFacts.slice(0, 6);
  const scenes = (locations.length ? locations : [{ id: "universe-scene", name: bundle.universe.name, summary: bundle.universe.description }]).map((location, index) => ({
    id: `scene-${index + 1}`,
    title: location.name || `Scene ${index + 1}`,
    location: location.name || "",
    intention: location.summary || bundle.universe.description || "",
    shots: [
      {
        id: `shot-${index + 1}-1`,
        text: facts[index]?.fact_text || location.summary || bundle.universe.description || "",
        frame: "Medium shot",
        action: "",
        camera: "Static camera",
        duration: "5s",
        continuity: "",
        visualPrompt: [bundle.universe.tone, location.summary].filter(Boolean).join(". "),
      },
    ],
  }));

  return {
    id: projectId,
    projectTitle: title,
    script: buildUniverseInheritanceSummary(bundle),
    visualStyle: bundle.universe.tone || "cinematic short drama, realistic lighting, high emotional tension",
    aspectRatio: "9:16" as const,
    scenes,
  };
}

function buildUniverseVideoPayload(bundle: UniverseBundle, title: string) {
  const prompt = [
    bundle.universe.tone || "cinematic short drama",
    bundle.universe.description,
    bundle.canonFacts[0]?.fact_text,
  ].filter(Boolean).join(". ");

  return {
    state: {
      model: "MiniMax-Hailuo-02",
      shots: [{
        id: `video-shot-${crypto.randomUUID()}`,
        sceneTitle: title,
        sourceText: bundle.universe.description || "",
        prompt,
        duration: "5s",
        aspectRatio: "9:16",
        status: "draft",
      }],
    },
    sourceStoryboardTitle: title,
    sourceStoryboardId: "",
    selectedUniverseId: bundle.universe.id,
    uploadedSourceName: "",
  };
}

function formatCharacterBody(details: Record<string, unknown>, summary: string) {
  const variants = Array.isArray(details.appearance_variants)
    ? details.appearance_variants.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
  const variantLines = variants.slice(0, 4).map((variant) => {
    const workflow = stringValue(variant.source_workflow) || "project";
    const title = stringValue(variant.title) || "appearance variant";
    const appearance = stringValue(variant.appearance);
    return `- ${workflow}: ${title}${appearance ? ` / ${appearance}` : ""}`;
  });

  return [
    summary,
    variants.length ? `Appearance variants: ${variants.length}` : "",
    ...variantLines,
  ].filter(Boolean).join("\n");
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
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

function mergeProjectsForUniverseDetail(localProjects: DramaProject[], cloudProjects: DramaProject[]) {
  const byId = new Map<string, DramaProject>();
  for (const project of [...localProjects, ...cloudProjects]) {
    const existing = byId.get(project.id);
    if (!existing || project.updatedAt.localeCompare(existing.updatedAt) > 0) {
      byId.set(project.id, project);
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function getUniverseSourceProjects(projects: DramaProject[]) {
  return projects.filter((project) => project.workflowType !== "viral");
}
