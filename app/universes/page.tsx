"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { readProjectsFromStorage, type DramaProject } from "@/lib/projects";
import { listUniverses, createUniverseFromProject, getUniverseBundle, type Universe, type UniverseBundle } from "@/lib/universe";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { readProjectsFromSupabase } from "@/lib/supabase/projects";
import { useOS } from "@/lib/os/uiState";
import { useI18n } from "@/lib/i18n/useI18n";

type CreateForm = {
  projectId: string;
  name: string;
  description: string;
  genre: string;
  default_language: string;
  target_markets: string;
  tone: string;
};

type UniverseSummary = {
  entityCount: number;
  canonCount: number;
  pendingInbox: number;
  linkedProjects: number;
  timelineCount: number;
  reportCount: number;
};

const EMPTY_FORM: CreateForm = {
  projectId: "",
  name: "",
  description: "",
  genre: "",
  default_language: "English",
  target_markets: "",
  tone: "",
};

export default function UniversesPage() {
  const router = useRouter();
  const os = useOS();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [session, setSession] = useState<Session | null>(null);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [universeSummaries, setUniverseSummaries] = useState<Record<string, UniverseSummary>>({});
  const [projects, setProjects] = useState<DramaProject[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const load = async (nextSession: Session | null) => {
      const accessToken = nextSession?.access_token ?? null;
      setLoading(true);
      setLoadError("");
      try {
        const [rows, cloudProjects] = await Promise.all([
          listUniverses({ accessToken }),
          accessToken ? readProjectsFromSupabase({ accessToken }).catch(() => []) : Promise.resolve([]),
        ]);
        setUniverses(rows);
        setProjects(mergeProjectsForUniverse(readProjectsFromStorage(), cloudProjects));

        const summaryPairs = await Promise.all(
          rows.map(async (universe) => {
            const bundle = await getUniverseBundle(universe.id, { accessToken }).catch(() => null);
            return [universe.id, summarizeUniverse(bundle)] as const;
          }),
        );
        setUniverseSummaries(Object.fromEntries(summaryPairs));
      } catch (loadIssue) {
        setLoadError(loadIssue instanceof Error ? loadIssue.message : "Universe load failed.");
        setProjects(readProjectsFromStorage());
      } finally {
        setLoading(false);
      }
    };

    void supabase?.auth.getSession().then(({ data }) => {
      const s = data.session ?? null;
      setSession(s);
      void load(s);
    });

    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        void load(nextSession);
      }) ?? {};

    if (!supabase) void load(null);

    return () => listener?.subscription.unsubscribe();
  }, []);

  function openCreate() {
    setError("");
    setCreateForm(EMPTY_FORM);
    setCreateOpen(true);
  }

  function handleProjectSelect(projectId: string) {
    const project = projects.find((p) => p.id === projectId);
    setCreateForm((f) => ({
      ...f,
      projectId,
      name: f.name || project?.title || "",
      genre: f.genre || project?.genre || "",
      default_language: f.default_language || project?.targetLanguage || "English",
      target_markets: f.target_markets || (project?.market ? project.market : ""),
    }));
  }

  async function submitCreate() {
    if (!os.planReady || !os.access.universe) {
      setError(isZh ? "Ultra 会员才能创建和写入宇宙。" : "Ultra is required to create and write Universes.");
      return;
    }
    const project = projects.find((p) => p.id === createForm.projectId);
    if (!project) {
      setError(isZh ? "请选择一个项目" : "Select a project first.");
      return;
    }
    if (!createForm.name.trim()) {
      setError(isZh ? "宇宙名称不能为空" : "Universe name is required.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const { universe } = await createUniverseFromProject({
        project,
        form: {
          name: createForm.name.trim(),
          description: createForm.description.trim(),
          genre: createForm.genre.trim(),
          default_language: createForm.default_language.trim() || "English",
          target_markets: createForm.target_markets
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          tone: createForm.tone.trim(),
        },
        accessToken: session?.access_token ?? null,
      });
      router.push(`/universes/${universe.id}`);
    } catch {
      setError(isZh ? "创建失败，请重试" : "Creation failed. Please try again.");
      setCreating(false);
    }
  }

  const universeAccessPending = !os.planReady;
  const noUniverseAccess = os.planReady && !os.access.universe;
  const canWriteUniverse = os.planReady && os.access.universe;
  const activeCount = universes.filter((u) => u.status === "active").length;
  const totalPendingInbox = Object.values(universeSummaries).reduce((sum, item) => sum + item.pendingInbox, 0);
  const totalCanonFacts = Object.values(universeSummaries).reduce((sum, item) => sum + item.canonCount, 0);
  const totalLinkedProjects = Object.values(universeSummaries).reduce((sum, item) => sum + item.linkedProjects, 0);
  const healthState = universeAccessPending
    ? isZh ? "校验中" : "Checking"
    : noUniverseAccess
    ? isZh ? "待开通" : "Locked"
    : universes.length === 0
      ? isZh ? "待创建" : "Setup"
      : totalPendingInbox > 0
        ? isZh ? "待审查" : "Review"
        : isZh ? "可用" : "Ready";
  const workflowCards = [
    {
      title: isZh ? "1. 项目接入" : "1. Project intake",
      body: isZh ? "从短剧、小说、歌曲或爆款项目创建宇宙，保留来源项目关系。" : "Create Universes from drama, novel, song, or viral projects while keeping source links.",
      value: projects.length,
    },
    {
      title: isZh ? "2. Inbox 审查" : "2. Inbox review",
      body: isZh ? "AI 抽取角色、地点、关系和规则后，必须先进入 Inbox。" : "AI-extracted characters, places, relations, and rules must enter Inbox first.",
      value: totalPendingInbox,
    },
    {
      title: isZh ? "3. Canon 沉淀" : "3. Canon memory",
      body: isZh ? "用户确认后再写入 canon，用于长期 IP 复用和一致性检查。" : "User-approved facts become canon for long-term IP reuse and consistency checks.",
      value: totalCanonFacts,
    },
  ];

  return (
    <main className="cosmic-page universe-page">
      <section className="cosmic-title-band universe-title-band">
        <Link className="universe-brand-inline" href="/" aria-label="Home">
          <KiikisLogo compact />
        </Link>
        <div>
          <span>{isZh ? "Universe Engine" : "Universe Engine"}</span>
          <h1>{isZh ? "宇宙工作台" : "Universe Workspace"}</h1>
          <p>
            {isZh
              ? "用项目沉淀长期 IP、角色关系、世界规则和 canon。当前先以模块化信息面板呈现。"
              : "Organize long-running IP, character relations, world rules, and canon through modular panels."}
          </p>
          {loadError ? <small className="universe-load-warning">{loadError}</small> : null}
        </div>
      </section>

      <section className="universe-module-layout">
        {universeAccessPending || noUniverseAccess ? (
          <section className="dashboard-panel universe-access-banner">
            <div>
              <span>{isZh ? "Ultra 功能" : "Ultra feature"}</span>
              <h2>{universeAccessPending ? (isZh ? "正在校验会员权限" : "Checking membership") : (isZh ? "当前为只读预览模式" : "Read-only preview mode")}</h2>
              <p>
                {universeAccessPending
                  ? isZh
                    ? "正在读取账号套餐。校验完成前不会开放创建、Inbox 写入或 canon 确认操作。"
                    : "Reading account plan. Create, Inbox write, and canon confirmation stay disabled while checking."
                  : isZh
                  ? "非 Ultra 会员可以看到 Universe Engine 的工作流、来源项目和升级入口，但不能创建宇宙、写入 Inbox 或确认 canon。升级后可从项目建立长期 IP 资产。"
                  : "Non-Ultra users can preview the workflow, source projects, and upgrade entry, but cannot create Universes, write Inbox items, or confirm canon."}
              </p>
            </div>
            <Link className="primary-button" href="/subscription">
              {isZh ? "升级 Ultra" : "Upgrade to Ultra"}
            </Link>
          </section>
        ) : null}

        <section className="dashboard-panel universe-overview-card">
          <div className="dashboard-panel-head">
            <div>
              <span>{isZh ? "状态" : "Status"}</span>
              <h2>{isZh ? "宇宙状态" : "Universe status"}</h2>
            </div>
          </div>
          <div className="nebula-stat-grid">
            <strong>
              {universes.length}
              <span>{isZh ? "宇宙" : "universes"}</span>
            </strong>
            <strong>
              {activeCount}
              <span>{isZh ? "活跃" : "active"}</span>
            </strong>
            <strong>
              {projects.length}
              <span>{isZh ? "来源项目" : "sources"}</span>
            </strong>
            <strong>
              {totalPendingInbox}
              <span>Inbox</span>
            </strong>
            <strong>
              {totalLinkedProjects}
              <span>{isZh ? "已关联" : "linked"}</span>
            </strong>
          </div>
          <div className="universe-health-row">
            <span>{isZh ? "当前状态" : "Current state"}</span>
            <strong>{loading ? (isZh ? "加载中" : "Loading") : healthState}</strong>
          </div>
        </section>

        <section className="dashboard-panel universe-action-card">
          <div className="dashboard-panel-head">
            <div>
              <span>{isZh ? "创建" : "Create"}</span>
              <h2>{isZh ? "从项目建立宇宙" : "Create from a project"}</h2>
            </div>
          </div>
          <p className="subtle">
            {noUniverseAccess
              ? isZh
                ? "当前账号暂未开通宇宙功能。"
                : "Universe is not enabled for this account."
              : projects.length === 0
                ? isZh
                  ? "项目列表为空。先保存歌曲或短剧项目，再回来创建宇宙。"
                  : "Your project list is empty. Save a drama, novel, song, or viral project first."
                : isZh
                  ? "选择一个现有项目作为宇宙起点，后续抽取内容先进入 Inbox，再确认写入 canon。"
                  : "Use an existing project as the foundation. Extracted items should enter Inbox before canon."}
          </p>
          <div className="universe-module-actions">
            {!canWriteUniverse ? (
              <Link className="primary-button" href="/subscription">
                {universeAccessPending ? (isZh ? "校验中" : "Checking") : (isZh ? "查看套餐" : "View plans")}
              </Link>
            ) : (
              <button className="primary-button" onClick={openCreate} disabled={projects.length === 0}>
                {isZh ? "从项目创建宇宙" : "Create Universe"}
              </button>
            )}
            <Link className="secondary-button" href="/dashboard">
              {isZh ? "查看项目列表" : "Open projects"}
            </Link>
          </div>
        </section>

        <section className="dashboard-panel universe-workflow-card">
          <div className="dashboard-panel-head">
            <div>
              <span>{isZh ? "工作流" : "Workflow"}</span>
              <h2>{isZh ? "Universe 生产链路" : "Universe operating flow"}</h2>
            </div>
          </div>
          <div className="universe-workflow-grid">
            {workflowCards.map((card) => (
              <article key={card.title}>
                <strong>{card.value}</strong>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="dashboard-panel universe-list-card">
          <div className="dashboard-panel-head">
            <div>
              <span>{isZh ? "宇宙列表" : "Universe list"}</span>
              <h2>{isZh ? "已有宇宙" : "Existing Universes"}</h2>
            </div>
          </div>
          <div className="universe-card-grid">
            {loading ? (
              <article className="universe-module-empty">
                <strong>{isZh ? "加载中" : "Loading"}</strong>
                <p>{isZh ? "正在读取宇宙和项目状态。" : "Reading Universe and project status."}</p>
              </article>
            ) : universes.length === 0 ? (
              <article className="universe-module-empty">
                <strong>{isZh ? "暂无宇宙" : "No Universe yet"}</strong>
                <p>
                  {isZh
                    ? "创建后会在这里以列表模块显示，包含类型、语言、市场和更新时间。"
                    : "Created Universes will appear here with genre, language, market, and update time."}
                </p>
              </article>
            ) : (
              universes.map((universe) => (
                <Link className="universe-record-card" href={`/universes/${universe.id}`} key={universe.id}>
                  <span>{universe.status === "active" ? (isZh ? "活跃" : "Active") : (isZh ? "归档" : "Archived")}</span>
                  <h3>{universe.name}</h3>
                  <p>{universe.description || (isZh ? "未填写简介" : "No description")}</p>
                  <div className="universe-record-metrics">
                    <strong>{universeSummaries[universe.id]?.pendingInbox ?? 0}<span>Inbox</span></strong>
                    <strong>{universeSummaries[universe.id]?.canonCount ?? 0}<span>Canon</span></strong>
                    <strong>{universeSummaries[universe.id]?.linkedProjects ?? 0}<span>{isZh ? "项目" : "Projects"}</span></strong>
                  </div>
                  <dl>
                    <div>
                      <dt>{isZh ? "类型" : "Genre"}</dt>
                      <dd>{universe.genre || "—"}</dd>
                    </div>
                    <div>
                      <dt>{isZh ? "语言" : "Language"}</dt>
                      <dd>{universe.default_language || "—"}</dd>
                    </div>
                    <div>
                      <dt>{isZh ? "市场" : "Markets"}</dt>
                      <dd>{universe.target_markets?.join(", ") || "—"}</dd>
                    </div>
                  </dl>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="dashboard-panel universe-source-card">
          <div className="dashboard-panel-head">
            <div>
              <span>{isZh ? "来源项目" : "Source projects"}</span>
              <h2>{isZh ? "可用于创建宇宙的项目" : "Projects available for Universe"}</h2>
            </div>
          </div>
          <div className="universe-source-list">
            {projects.slice(0, 6).map((project) => (
              <article key={project.id}>
                <span>{project.workflowType === "song" ? (isZh ? "歌曲" : "Song") : project.workflowType === "viral" ? (isZh ? "爆款" : "Viral") : project.workflowType === "novel" ? (isZh ? "小说" : "Novel") : (isZh ? "短剧" : "Drama")}</span>
                <strong>{project.title || project.id}</strong>
                <small>{[project.genre, project.targetLanguage, project.projectGroup].filter(Boolean).join(" · ")}</small>
              </article>
            ))}
            {projects.length === 0 ? (
              <article className="universe-module-empty">
                <strong>{isZh ? "没有本地项目" : "No local projects"}</strong>
                <p>{isZh ? "歌曲创作保存到项目列表后，会出现在这里；登录状态下也会合并云端项目。" : "Songs saved to the project list will appear here; signed-in users also merge cloud projects."}</p>
              </article>
            ) : null}
          </div>
        </section>
      </section>

      {createOpen ? (
        <div className="modal-backdrop">
          <div className="modal wizard-modal">
            <h2>{isZh ? "从项目创建宇宙" : "Create Universe from Project"}</h2>
            <p>
              {isZh
                ? "选择一个现有项目作为宇宙的起点。创建后可继续扩展角色、时间线和世界规则。"
                : "Pick an existing project as the foundation. Add characters, timeline, and world rules after creation."}
            </p>

            <div className="wizard-grid">
              <label>
                {isZh ? "来源项目" : "Source project"}
                <select
                  value={createForm.projectId}
                  onChange={(e) => handleProjectSelect(e.target.value)}
                >
                  <option value="">{isZh ? "— 选择项目 —" : "— Select project —"}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title || p.id}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {isZh ? "宇宙名称" : "Universe name"}
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={isZh ? "例：复仇千金宇宙" : "e.g. Revenge Heiress Universe"}
                  autoFocus
                />
              </label>

              <label>
                {isZh ? "简介" : "Description"}
                <input
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={isZh ? "一句话描述宇宙核心设定" : "One-line world premise"}
                />
              </label>

              <label>
                {isZh ? "类型" : "Genre"}
                <input
                  value={createForm.genre}
                  onChange={(e) => setCreateForm((f) => ({ ...f, genre: e.target.value }))}
                  placeholder={isZh ? "例：商战·复仇·逆袭" : "e.g. Romance / Revenge"}
                />
              </label>

              <label>
                {isZh ? "主要语言" : "Default language"}
                <input
                  value={createForm.default_language}
                  onChange={(e) => setCreateForm((f) => ({ ...f, default_language: e.target.value }))}
                />
              </label>

              <label>
                {isZh ? "目标市场（逗号分隔）" : "Target markets (comma-separated)"}
                <input
                  value={createForm.target_markets}
                  onChange={(e) => setCreateForm((f) => ({ ...f, target_markets: e.target.value }))}
                  placeholder={isZh ? "例：北美,东南亚" : "e.g. North America, Southeast Asia"}
                />
              </label>

              <label>
                {isZh ? "基调" : "Tone"}
                <input
                  value={createForm.tone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, tone: e.target.value }))}
                  placeholder={isZh ? "例：紧张·戏剧性" : "e.g. Dramatic, high-stakes"}
                />
              </label>
            </div>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setCreateOpen(false)} disabled={creating}>
                {isZh ? "取消" : "Cancel"}
              </button>
              <button className="primary-button" onClick={submitCreate} disabled={creating || !canWriteUniverse}>
                {creating ? (isZh ? "创建中…" : "Creating…") : isZh ? "创建宇宙" : "Create Universe"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function summarizeUniverse(bundle: UniverseBundle | null): UniverseSummary {
  if (!bundle) {
    return {
      entityCount: 0,
      canonCount: 0,
      pendingInbox: 0,
      linkedProjects: 0,
      timelineCount: 0,
      reportCount: 0,
    };
  }

  return {
    entityCount: bundle.entities.length,
    canonCount: bundle.canonFacts.length,
    pendingInbox: bundle.inbox.filter((item) => item.status === "pending").length,
    linkedProjects: bundle.links.length,
    timelineCount: bundle.timeline.length,
    reportCount: bundle.reports.length,
  };
}

function mergeProjectsForUniverse(localProjects: DramaProject[], cloudProjects: DramaProject[]) {
  const byId = new Map<string, DramaProject>();

  for (const project of [...localProjects, ...cloudProjects]) {
    const existing = byId.get(project.id);
    if (!existing || project.updatedAt.localeCompare(existing.updatedAt) > 0) {
      byId.set(project.id, project);
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
