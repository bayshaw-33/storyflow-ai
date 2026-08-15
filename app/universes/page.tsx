"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Loader2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import type { TeamRole } from "@/lib/actors";
import { readProjectsFromStorage, type DramaProject } from "@/lib/projects";
import { createUniverseFromProject } from "@/lib/universe";
import { UniverseImportWizard } from "@/components/v2/universe-import/UniverseImportWizard";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { readProjectsFromSupabase } from "@/lib/supabase/projects";
import { useOS } from "@/lib/os/uiState";
import { useI18n } from "@/lib/i18n/useI18n";
import { UniverseCard } from "@/components/universe/UniverseCard";
import {
  DEFAULT_UNIVERSE_FILTER,
  filterAndSortUniverses,
  getUniverseCopy,
  type UniverseListItem,
} from "@/components/universe/universe-view-model";
import styles from "@/components/universe/universe.module.css";

type CreateForm = {
  projectId: string;
  teamId: string;
  name: string;
  description: string;
  genre: string;
  default_language: string;
  target_markets: string;
  tone: string;
};

type TeamOption = {
  id: string;
  name: string;
  role?: TeamRole;
};

const EMPTY_FORM: CreateForm = {
  projectId: "",
  teamId: "",
  name: "",
  description: "",
  genre: "",
  default_language: "English",
  target_markets: "",
  tone: "",
};

const SCROLL_STORAGE_KEY = "storyflow-universe-list-scroll";

export default function UniversesPage() {
  const router = useRouter();
  const os = useOS();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const copy = getUniverseCopy(isZh);

  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<UniverseListItem[]>([]);
  const [projects, setProjects] = useState<DramaProject[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 滚动位置恢复（详情返回时）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (saved && scrollRef.current) {
      const top = Number(saved);
      if (Number.isFinite(top)) {
        requestAnimationFrame(() => {
          window.scrollTo({ top, behavior: "auto" });
          window.sessionStorage.removeItem(SCROLL_STORAGE_KEY);
        });
      }
    }
  }, [loading]);

  // 记录滚动位置（点击卡片前）
  function rememberScroll() {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY));
    }
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const load = async (nextSession: Session | null) => {
      const accessToken = nextSession?.access_token ?? null;
      setLoading(true);
      setLoadError("");
      try {
        // KIIKIS-TR-ACTOR-P0-009: 三个独立请求并发（之前是串行 3 段链路）
        const [cloudProjects, teamResult, universeItems] = await Promise.all([
          accessToken
            ? readProjectsFromSupabase({ accessToken }).catch(() => [])
            : Promise.resolve([]),
          accessToken
            ? fetch("/api/teams", {
                headers: { Authorization: `Bearer ${accessToken}` },
              }).catch(() => null)
            : Promise.resolve(null),
          loadUniverseItems(accessToken),
        ]);
        const teamPayload = teamResult?.ok ? await teamResult.json().catch(() => null) : null;
        setTeams(Array.isArray(teamPayload?.teams) ? teamPayload.teams : []);
        setProjects(getUniverseSourceProjects(mergeProjectsForUniverse(readProjectsFromStorage(), cloudProjects)));
        setItems(universeItems);
      } catch (loadIssue) {
        setLoadError(loadIssue instanceof Error ? loadIssue.message : "Universe load failed.");
        setProjects(getUniverseSourceProjects(readProjectsFromStorage()));
        setTeams([]);
        setItems([]);
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
  const canWriteUniverse = Boolean(session) && os.planReady && os.access.universe;

  const filtered = useMemo(
    () => filterAndSortUniverses(items, { ...DEFAULT_UNIVERSE_FILTER, search }),
    [items, search],
  );

  const totals = useMemo(() => ({
    total: items.length,
    active: items.filter((item) => item.status === "active").length,
    inbox: items.reduce((sum, item) => sum + item.pendingInboxCount, 0),
  }), [items]);

  function openCreate() {
    setError("");
    setCreateForm(EMPTY_FORM);
    setCreateOpen(true);
  }

  // Phase 4: 上传站外原作建立 Universe（无 Project 也可用）
  const [importOpen, setImportOpen] = useState(false);

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
        teamId: createForm.teamId || null,
        accessToken: session?.access_token ?? null,
      });
      router.push(`/universes/${universe.id}`);
    } catch {
      setError(isZh ? "创建失败，请重试。" : "Creation failed. Please try again.");
      setCreating(false);
    }
  }

  const showEmpty = !loading && filtered.length === 0;

  return (
    <main className={`${styles.page} universe-library-page`} ref={scrollRef}>
      <section className={styles.titleBar}>
        <Link className={styles.titleBrand} href="/" aria-label="Home">
          <KiikisLogo compact />
        </Link>
        <div className={styles.titleCopy}>
          <span className={styles.kicker}>{isZh ? "核心 · 宇宙引擎" : "THE CORE · UNIVERSE ENGINE"}</span>
          <h1 className={styles.title}>{copy.list.title}</h1>
          <p className={styles.subtitle}>{copy.list.subtitle}</p>
          {loadError ? <span style={{ color: "#ff8a8a", fontSize: 12 }}>{loadError}</span> : null}
        </div>
        <div className={styles.titleActions}>
          <div className={styles.compactSearch}>
            <span className={styles.searchIcon}><Search size={14} /></span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={copy.list.searchPlaceholder}
              aria-label={copy.list.searchPlaceholder}
            />
          </div>
          {canWriteUniverse ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className={styles.primaryButton} onClick={openCreate} disabled={projects.length === 0}>
                <Plus size={15} />
                {copy.list.create}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => setImportOpen(true)}
                data-testid="entry-external-upload"
                title={isZh ? "上传完整剧本或三件套，审核后建立 Universe U1（无需项目）" : "Import an out-of-band original into a new Universe (no project required)"}
              >
                <Plus size={15} />
                {isZh ? "上传站外原作" : "Import original"}
              </button>
            </div>
          ) : (
            <Link className={styles.primaryButton} href={signedOut ? "/login" : "/subscription"}>
              {signedOut ? (isZh ? "登录" : "Sign In") : (isZh ? "升级 ULTRA" : "Upgrade to ULTRA")}
            </Link>
          )}
        </div>
      </section>

      <section className={styles.countsStrip}>
        <span><strong>{totals.total}</strong> {copy.list.countsUniverses}</span>
        <span><strong>{totals.active}</strong> {copy.list.countsActive}</span>
        <span><strong>{totals.inbox}</strong> {copy.list.countsInbox}</span>
      </section>

      <section className={styles.content}>
        {loading ? (
          <div className={styles.loadingState}>
            <Loader2 size={16} className="spin" />
            {copy.list.loading}
          </div>
        ) : showEmpty ? (
          <div className={styles.emptyState}>
            <strong>{copy.list.empty}</strong>
            <p>{copy.list.emptyHint}</p>
            {canWriteUniverse ? (
              <button type="button" className={styles.primaryButton} onClick={openCreate} disabled={projects.length === 0} style={{ marginTop: 8 }}>
                <Plus size={14} />
                {copy.list.create}
              </button>
            ) : null}
          </div>
        ) : (
          <div className={styles.cardGrid} onClick={rememberScroll}>
            {filtered.map((item) => (
              <UniverseCard
                key={item.id}
                universe={item}
                isZh={isZh}
                onArchive={(target) => {
                  // PRD §5.3 本轮提供归档入口；归档实现走 PATCH 端点，本期仅占位提示
                  setError(isZh ? `归档功能即将开放：${target.name}` : `Archive coming soon: ${target.name}`);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {createOpen ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h2>{isZh ? "从项目创建宇宙" : "Create Universe from Project"}</h2>
            <p>
              {isZh
                ? "选择一个现有项目作为宇宙的起点。创建后可继续扩展角色、时间线和世界规则。"
                : "Pick an existing project as the foundation. Add characters, timeline, and world rules after creation."}
            </p>

            <div className="wizard-grid" style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
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

              <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
                {isZh ? "共享团队" : "Shared team"}
                <select value={createForm.teamId} onChange={(event) => setCreateForm((current) => ({ ...current, teamId: event.target.value }))}>
                  <option value="">{isZh ? "仅自己可见" : "Private to me"}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name} {team.role ? `(${team.role})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
                {isZh ? "宇宙名称" : "Universe name"}
                <input
                  value={createForm.name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder={isZh ? "例：复仇千金宇宙" : "e.g. Revenge Heiress Universe"}
                  autoFocus
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
                {isZh ? "简介" : "Description"}
                <input
                  value={createForm.description}
                  onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder={isZh ? "一句话描述宇宙核心设定" : "One-line world premise"}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {isZh ? "类型" : "Genre"}
                <input
                  value={createForm.genre}
                  onChange={(event) => setCreateForm((current) => ({ ...current, genre: event.target.value }))}
                  placeholder={isZh ? "例：商战·复仇·逆袭" : "e.g. Romance / Revenge"}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {isZh ? "主要语言" : "Default language"}
                <input
                  value={createForm.default_language}
                  onChange={(event) => setCreateForm((current) => ({ ...current, default_language: event.target.value }))}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
                {isZh ? "目标市场（逗号分隔）" : "Target markets (comma-separated)"}
                <input
                  value={createForm.target_markets}
                  onChange={(event) => setCreateForm((current) => ({ ...current, target_markets: event.target.value }))}
                  placeholder={isZh ? "例：北美,东南亚" : "e.g. North America, Southeast Asia"}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1 / -1" }}>
                {isZh ? "基调" : "Tone"}
                <input
                  value={createForm.tone}
                  onChange={(event) => setCreateForm((current) => ({ ...current, tone: event.target.value }))}
                  placeholder={isZh ? "例：紧张·戏剧性" : "e.g. Dramatic, high-stakes"}
                />
              </label>
            </div>

            {error ? <p className={styles.formError}>{error}</p> : null}

            <div className={styles.modalActions}>
              <button className={styles.secondaryButton} onClick={() => setCreateOpen(false)} disabled={creating}>
                {isZh ? "取消" : "Cancel"}
              </button>
              <button className={styles.primaryButton} onClick={submitCreate} disabled={creating || !canWriteUniverse}>
                {creating ? (isZh ? "创建中…" : "Creating…") : isZh ? "创建宇宙" : "Create Universe"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div className={styles.modalOverlay} onClick={() => setImportOpen(false)} role="presentation">
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" data-testid="import-dialog">
            <UniverseImportWizard onSessionCreated={() => setImportOpen(false)} />
            <div className={styles.modalActions}>
              <button className={styles.secondaryButton} onClick={() => setImportOpen(false)}>
                {isZh ? "关闭" : "Close"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

/**
 * PRD §5 列表页：调用阶段 B 的 /api/universe/summaries 获取 UniverseListItem[]。
 * 不得对完整 description 做前端全文扫描；cardSummary 已由服务端截断/去标记。
 */
async function loadUniverseItems(accessToken: string | null): Promise<UniverseListItem[]> {
  if (!accessToken) return [];
  try {
    const response = await fetch("/api/universe/summaries", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.universes && Array.isArray(payload.universes)) {
      return payload.universes as UniverseListItem[];
    }
    console.error(`[universes] summaries API returned ${response.status}; falling back to empty list.`);
    return [];
  } catch (error) {
    console.error("[universes] summaries API failed.", error);
    return [];
  }
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
