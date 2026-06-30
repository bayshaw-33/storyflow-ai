"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { readProjectsFromStorage, type DramaProject } from "@/lib/projects";
import {
  createUniverseFromProject,
  getUniverseBundle,
  listUniverses,
  type Universe,
  type UniverseBundle,
  type UniverseEntityType,
} from "@/lib/universe";
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
  characterCount: number;
  locationCount: number;
  organizationCount: number;
  ruleCount: number;
  relationshipCount: number;
  canonCount: number;
  lockedCanonCount: number;
  pendingInbox: number;
  linkedProjects: number;
  linkedWorkflowCount: number;
  timelineCount: number;
  productionAssetCount: number;
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
        setProjects(getUniverseSourceProjects(mergeProjectsForUniverse(readProjectsFromStorage(), cloudProjects)));

        const summaryPairs = await Promise.all(
          rows.map(async (universe) => {
            const bundle = await getUniverseBundle(universe.id, { accessToken }).catch(() => null);
            return [universe.id, summarizeUniverse(bundle)] as const;
          }),
        );
        setUniverseSummaries(Object.fromEntries(summaryPairs));
      } catch (loadIssue) {
        setLoadError(loadIssue instanceof Error ? loadIssue.message : "Universe load failed.");
        setProjects(getUniverseSourceProjects(readProjectsFromStorage()));
      } finally {
        setLoading(false);
      }
    };

    void supabase?.auth.getSession().then(({ data }) => {
      const nextSession = data.session ?? null;
      setSession(nextSession);
      void load(nextSession);
    });

    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        void load(nextSession);
      }) ?? {};

    if (!supabase) void load(null);

    return () => listener?.subscription.unsubscribe();
  }, []);

  const signedOut = !session;
  const universeAccessPending = Boolean(session) && !os.planReady;
  const noUniverseAccess = Boolean(session) && os.planReady && !os.access.universe;
  const canWriteUniverse = Boolean(session) && os.planReady && os.access.universe;

  const totals = useMemo(() => {
    const values = Object.values(universeSummaries);
    return {
      active: universes.filter((universe) => universe.status === "active").length,
      characters: sum(values, "characterCount"),
      locations: sum(values, "locationCount"),
      organizations: sum(values, "organizationCount"),
      relationships: sum(values, "relationshipCount"),
      rules: sum(values, "ruleCount"),
      canon: sum(values, "canonCount"),
      lockedCanon: sum(values, "lockedCanonCount"),
      inbox: sum(values, "pendingInbox"),
      linkedProjects: sum(values, "linkedProjects"),
      linkedWorkflows: sum(values, "linkedWorkflowCount"),
      timelines: sum(values, "timelineCount"),
      productionAssets: sum(values, "productionAssetCount"),
    };
  }, [universes, universeSummaries]);

  const stateLabel = signedOut
    ? isZh ? "预览模式" : "Preview Mode"
    : universeAccessPending
      ? isZh ? "校验中" : "Checking"
      : noUniverseAccess
        ? isZh ? "锁定 — 升级解锁" : "Locked — Upgrade to Unlock"
        : isZh ? "准备建造" : "Ready to Build";

  const assetCards = [
    {
      title: isZh ? "角色资产" : "Character assets",
      body: isZh
        ? "展示角色完整设定、关系定位和未来可扩展的项目形象版本。"
        : "Full character sheets, relationship role, and future project-specific appearance variants.",
      value: totals.characters,
      meta: isZh ? `${totals.relationships} 条关系` : `${totals.relationships} relationships`,
    },
    {
      title: isZh ? "世界与场景" : "World and locations",
      body: isZh
        ? "保存地点、组织、世界规则和可复用场景，让剧本、分镜和视频继承同一空间逻辑。"
        : "Locations, organizations, world rules, and reusable scenes that keep every workflow spatially consistent.",
      value: totals.locations + totals.organizations + totals.rules,
      meta: isZh ? `${totals.locations} 地点 · ${totals.rules} 规则` : `${totals.locations} locations · ${totals.rules} rules`,
    },
    {
      title: isZh ? "正史与时间线" : "Canon and timeline",
      body: isZh
        ? "只展示用户确认后的事实；locked canon 不允许被后续项目自动覆盖。"
        : "Only user-confirmed facts belong here; locked canon cannot be overwritten by downstream projects.",
      value: totals.canon,
      meta: isZh ? `${totals.lockedCanon} 条 locked` : `${totals.lockedCanon} locked`,
    },
    {
      title: isZh ? "生产资产" : "Production assets",
      body: isZh
        ? "分镜包、视频片段、歌曲/OST、参考图等交付资产保留在项目中，同时可作为 Universe 可调用资产。"
        : "Storyboard packs, video clips, songs, OSTs, reference images, and other deliverables stay project-owned while callable from Universe.",
      value: totals.productionAssets,
      meta: isZh ? `${totals.linkedProjects} 个来源项目` : `${totals.linkedProjects} source projects`,
    },
    {
      title: "Inbox",
      body: isZh
        ? "AI 抽取出的角色、地点、关系、事件和规则先进入 Inbox，由你确认、编辑确认或拒绝。"
        : "AI-extracted characters, places, relations, events, and rules enter Inbox before canon.",
      value: totals.inbox,
      meta: isZh ? "待审候选项" : "pending candidates",
    },
  ];

  const flowCards = [
    {
      title: isZh ? "项目接入" : "Project Intake",
      body: isZh
        ? "从剧本、小说、歌曲、分镜或视频项目中创建宇宙，保留来源链接。"
        : "Create Universes from script, novel, song, storyboard, or video projects while keeping source links.",
    },
    {
      title: isZh ? "Inbox 审核" : "Inbox Review",
      body: isZh
        ? "AI 提取的角色、地点、关系与规则，必须先进入 Inbox。"
        : "AI-extracted characters, places, relations, and rules must enter Inbox first.",
    },
    {
      title: isZh ? "正史库" : "Canon Memory",
      body: isZh
        ? "经用户批准的事实成为 Canon，用于长期 IP 复用与一致性校验。"
        : "User-approved facts become Canon for long-term IP reuse and consistency checks.",
    },
  ];

  function openCreate() {
    setError("");
    setCreateForm(EMPTY_FORM);
    setCreateOpen(true);
  }

  function handleProjectSelect(projectId: string) {
    const project = projects.find((p) => p.id === projectId);
    setCreateForm((current) => ({
      ...current,
      projectId,
      name: current.name || project?.title || "",
      genre: current.genre || project?.genre || "",
      default_language: current.default_language || project?.targetLanguage || "English",
      target_markets: current.target_markets || project?.market || "",
    }));
  }

  async function submitCreate() {
    if (!os.planReady || !os.access.universe) {
      setError(isZh ? "Ultra 会员才能创建和写入宇宙。" : "Ultra is required to create and write Universes.");
      return;
    }
    const project = projects.find((p) => p.id === createForm.projectId);
    if (!project) {
      setError(isZh ? "请选择一个项目。" : "Select a project first.");
      return;
    }
    if (!createForm.name.trim()) {
      setError(isZh ? "宇宙名称不能为空。" : "Universe name is required.");
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
            .map((item) => item.trim())
            .filter(Boolean),
          tone: createForm.tone.trim(),
        },
        accessToken: session?.access_token ?? null,
      });
      router.push(`/universes/${universe.id}`);
    } catch {
      setError(isZh ? "创建失败，请重试。" : "Creation failed. Please try again.");
      setCreating(false);
    }
  }

  return (
    <main className="cosmic-page universe-page">
      <section className="cosmic-title-band universe-title-band">
        <Link className="universe-brand-inline" href="/" aria-label="Home">
          <KiikisLogo compact />
        </Link>
        <div>
          <span>{isZh ? "核心 · 宇宙引擎" : "THE CORE · UNIVERSE ENGINE"}</span>
          <h1>{isZh ? "一个宇宙。所有工作流自动继承。" : "One Universe. Every Workflow Inherits It."}</h1>
          <p>
            {isZh
              ? "你的角色。你的世界观。你的正史。一次定义，到处继承。所有小说、剧本、分镜、视频、歌曲都源自同一份唯一真源。"
              : "Your characters. Your worlds. Your canon. Define once. Inherit everywhere. Every novel, script, storyboard, video, and song draws from the same source of truth."}
          </p>
          {loadError ? <small className="universe-load-warning">{loadError}</small> : null}
        </div>
      </section>

      <section className="universe-module-layout">
        <section className="dashboard-panel universe-overview-card">
          <div className="dashboard-panel-head">
            <div>
              <span>{isZh ? "你的宇宙一目了然" : "Your Universe At A Glance"}</span>
              <h2>{isZh ? "实时资产状态" : "Live asset status"}</h2>
            </div>
          </div>
          <div className="universe-status-grid">
            <strong>{universes.length}<span>{isZh ? "宇宙" : "Universes"}</span></strong>
            <strong>{totals.active}<span>{isZh ? "活跃中" : "Active Now"}</span></strong>
            <strong>{projects.length}<span>{isZh ? "源项目" : "Source Projects"}</span></strong>
            <strong>{totals.inbox}<span>{isZh ? "待审 Inbox" : "Inbox Items"}</span></strong>
            <strong>{totals.linkedWorkflows}<span>{isZh ? "联动工作流" : "Linked Workflows"}</span></strong>
            <strong>{stateLabel}<span>{isZh ? "状态" : "State"}</span></strong>
          </div>
        </section>

        {(signedOut || universeAccessPending || noUniverseAccess) ? (
          <section className="dashboard-panel universe-access-banner">
            <div>
              <span>{isZh ? "预览模式" : "PREVIEW MODE"}</span>
              <h2>{isZh ? "可浏览。如要建造，请升级。" : "You Can Browse. Upgrade to Build."}</h2>
              <p>
                {signedOut
                  ? isZh
                    ? "登录后可以读取你的云端宇宙。当前页面展示 Universe 如何管理角色、正史、项目和 Inbox。"
                    : "Sign in to load your cloud Universes. This page previews how Universe manages characters, canon, projects, and Inbox."
                  : universeAccessPending
                    ? isZh
                      ? "正在读取账号套餐。校验完成前不会开放创建、Inbox 写入或 canon 确认操作。"
                      : "Reading account plan. Create, Inbox write, and canon confirmation stay disabled while checking."
                    : isZh
                      ? "当前为预览模式。你可以阅读所有宇宙、追溯正史决策，并理解继承如何跨工作流流动。要创建自己的宇宙、写入 Inbox 或确认正史 — 请升级至 ULTRA。"
                      : "You are in preview. You can read every Universe, trace canon decisions, and understand how inheritance flows across workflows. To create your own Universe, write to Inbox, or confirm canon — upgrade to ULTRA."}
              </p>
            </div>
            <Link className="primary-button" href={signedOut ? "/login" : "/subscription"}>
              {signedOut ? (isZh ? "登录" : "Sign In") : (isZh ? "升级 ULTRA" : "Upgrade to ULTRA")}
            </Link>
          </section>
        ) : null}

        <section className="dashboard-panel universe-asset-card">
          <div className="dashboard-panel-head">
            <div>
              <span>{isZh ? "资产规划" : "Asset Map"}</span>
              <h2>{isZh ? "Universe 应该展示哪些资产" : "What belongs in Universe"}</h2>
            </div>
          </div>
          <div className="universe-asset-grid">
            {assetCards.map((card) => (
              <article key={card.title}>
                <strong>{card.value}</strong>
                <div>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                  <small>{card.meta}</small>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="dashboard-panel universe-action-card">
          <div className="dashboard-panel-head">
            <div>
              <span>{isZh ? "开启新宇宙" : "Start A New Universe"}</span>
              <h2>{isZh ? "从现有项目提取第一批资产" : "Lift the first assets from a project"}</h2>
            </div>
          </div>
          <p className="subtle">
            {isZh
              ? "从你已有的任意小说、剧本、分镜、视频或歌曲中选一个。系统会将其角色、世界观和正史提取到全新宇宙，等待你审核后再写入 canon。"
              : "Pick any novel, script, storyboard, video, or song you already started. We will lift its characters, world, and canon into a fresh Universe, then route candidates through Inbox before canon."}
          </p>
          <div className="universe-module-actions">
            {!canWriteUniverse ? (
              <Link className="primary-button" href={signedOut ? "/login" : "/subscription"}>
                {signedOut ? (isZh ? "登录" : "Sign In") : (isZh ? "查看套餐" : "See Plans")}
              </Link>
            ) : (
              <button className="primary-button" onClick={openCreate} disabled={projects.length === 0}>
                {isZh ? "挑选项目" : "Pick A Project"}
              </button>
            )}
            <Link className="secondary-button" href="/dashboard">
              {isZh ? "打开工作台" : "Open Workspace"}
            </Link>
          </div>
        </section>

        <section className="dashboard-panel universe-workflow-card">
          <div className="dashboard-panel-head">
            <div>
              <span>{isZh ? "一个宇宙如何诞生" : "How A Universe Is Born"}</span>
              <h2>{isZh ? "三步完成。从原始项目到可复用正史。" : "Three steps. From raw project to reusable canon."}</h2>
            </div>
          </div>
          <div className="universe-flow-grid">
            {flowCards.map((card, index) => (
              <article key={card.title}>
                <strong>{String(index + 1).padStart(2, "0")}</strong>
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
              <h2>{isZh ? "已创建的唯一真源" : "Existing sources of truth"}</h2>
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
                <strong>{isZh ? "还没有宇宙" : "No Universe yet"}</strong>
                <p>{isZh ? "已创建的宇宙会出现在这里，含题材、语言、目标市场和更新时间。" : "Created Universes will appear here with genre, language, market, and update time."}</p>
              </article>
            ) : (
              universes.map((universe) => {
                const summary = universeSummaries[universe.id] || summarizeUniverse(null);
                return (
                  <Link className="universe-record-card" href={`/universes/${universe.id}`} key={universe.id}>
                    <span>{universe.status === "active" ? (isZh ? "活跃中" : "Active") : (isZh ? "已归档" : "Archived")}</span>
                    <h3>{universe.name}</h3>
                    <p>{universe.description || (isZh ? "暂无简介。" : "No description yet.")}</p>
                    <div className="universe-record-metrics">
                      <strong>{summary.characterCount}<span>{isZh ? "角色" : "Cast"}</span></strong>
                      <strong>{summary.canonCount}<span>Canon</span></strong>
                      <strong>{summary.pendingInbox}<span>Inbox</span></strong>
                      <strong>{summary.productionAssetCount}<span>{isZh ? "资产" : "Assets"}</span></strong>
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
                );
              })
            )}
          </div>
        </section>

        <section className="dashboard-panel universe-source-card">
          <div className="dashboard-panel-head">
            <div>
              <span>{isZh ? "来源项目" : "Source projects"}</span>
              <h2>{isZh ? "可以转化为 Universe 的创作" : "Projects available for Universe"}</h2>
            </div>
          </div>
          <div className="universe-source-list">
            {projects.slice(0, 8).map((project) => (
              <article key={project.id}>
                <span>{workflowLabel(project, isZh)}</span>
                <strong>{project.title || project.id}</strong>
                <small>{[project.genre, project.targetLanguage, project.projectGroup].filter(Boolean).join(" · ") || (isZh ? "本地草稿" : "Local draft")}</small>
              </article>
            ))}
            {projects.length === 0 ? (
              <article className="universe-module-empty">
                <strong>{isZh ? "还没有本地项目" : "No local projects"}</strong>
                <p>{isZh ? "已保存到项目列表的歌曲会出现在这里；登录用户还会合并云端项目。" : "Songs saved to the project list will appear here; signed-in users also merge cloud projects."}</p>
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
                <select value={createForm.projectId} onChange={(event) => handleProjectSelect(event.target.value)}>
                  <option value="">{isZh ? "— 选择项目 —" : "— Select project —"}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title || project.id}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {isZh ? "宇宙名称" : "Universe name"}
                <input
                  value={createForm.name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder={isZh ? "例：复仇千金宇宙" : "e.g. Revenge Heiress Universe"}
                  autoFocus
                />
              </label>

              <label>
                {isZh ? "简介" : "Description"}
                <input
                  value={createForm.description}
                  onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder={isZh ? "一句话描述宇宙核心设定" : "One-line world premise"}
                />
              </label>

              <label>
                {isZh ? "类型" : "Genre"}
                <input
                  value={createForm.genre}
                  onChange={(event) => setCreateForm((current) => ({ ...current, genre: event.target.value }))}
                  placeholder={isZh ? "例：商战·复仇·逆袭" : "e.g. Romance / Revenge"}
                />
              </label>

              <label>
                {isZh ? "主要语言" : "Default language"}
                <input
                  value={createForm.default_language}
                  onChange={(event) => setCreateForm((current) => ({ ...current, default_language: event.target.value }))}
                />
              </label>

              <label>
                {isZh ? "目标市场（逗号分隔）" : "Target markets (comma-separated)"}
                <input
                  value={createForm.target_markets}
                  onChange={(event) => setCreateForm((current) => ({ ...current, target_markets: event.target.value }))}
                  placeholder={isZh ? "例：北美,东南亚" : "e.g. North America, Southeast Asia"}
                />
              </label>

              <label>
                {isZh ? "基调" : "Tone"}
                <input
                  value={createForm.tone}
                  onChange={(event) => setCreateForm((current) => ({ ...current, tone: event.target.value }))}
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
      characterCount: 0,
      locationCount: 0,
      organizationCount: 0,
      ruleCount: 0,
      relationshipCount: 0,
      canonCount: 0,
      lockedCanonCount: 0,
      pendingInbox: 0,
      linkedProjects: 0,
      linkedWorkflowCount: 0,
      timelineCount: 0,
      productionAssetCount: 0,
    };
  }

  const entityCounts = countEntities(bundle);
  return {
    characterCount: entityCounts.character,
    locationCount: entityCounts.location,
    organizationCount: entityCounts.organization,
    ruleCount: entityCounts.rule + entityCounts.concept,
    relationshipCount: bundle.relationships.length,
    canonCount: bundle.canonFacts.length,
    lockedCanonCount: bundle.canonFacts.filter((fact) => fact.is_locked).length,
    pendingInbox: bundle.inbox.filter((item) => item.status === "pending").length,
    linkedProjects: bundle.links.length,
    linkedWorkflowCount: new Set(bundle.links.map((link) => link.project_role)).size,
    timelineCount: bundle.timeline.length,
    productionAssetCount: bundle.snapshots.reduce((count, snapshot) => {
      return count + countSnapshotAssets(snapshot.state_json);
    }, 0),
  };
}

function countSnapshotAssets(state: Record<string, unknown>) {
  const assets = Array.isArray(state.assets) ? state.assets.length : 0;
  const productionAssets = Array.isArray(state.production_assets) ? state.production_assets.length : 0;
  return assets + productionAssets;
}

function countEntities(bundle: UniverseBundle) {
  const counts: Record<UniverseEntityType, number> = {
    character: 0,
    location: 0,
    organization: 0,
    object: 0,
    rule: 0,
    concept: 0,
  };
  for (const entity of bundle.entities) {
    counts[entity.type] += 1;
  }
  return counts;
}

function sum(items: UniverseSummary[], key: keyof UniverseSummary) {
  return items.reduce((total, item) => total + item[key], 0);
}

function workflowLabel(project: DramaProject, isZh: boolean) {
  if (project.workflowType === "song") return isZh ? "歌曲" : "Song";
  if (project.workflowType === "novel") return isZh ? "小说" : "Novel";
  if (project.workflowType === "storyboard") return isZh ? "分镜" : "Storyboard";
  if (project.workflowType === "video") return isZh ? "视频" : "Video";
  if (project.workflowType === "continuation") return isZh ? "续写剧本" : "Continuation Script";
  return isZh ? "剧本" : "Script";
}

function getUniverseSourceProjects(projects: DramaProject[]) {
  return projects.filter((project) => project.workflowType !== "viral");
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
