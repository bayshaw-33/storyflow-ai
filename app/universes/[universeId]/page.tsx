"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FilePlus2,
  Loader2,
  Palette,
  Share2,
  XCircle,
} from "lucide-react";
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
  upsertUniverseProjectLink,
  type UniverseBundle,
  type UniverseInboxItem,
  type UniverseInheritanceSettings,
  type UniverseProjectRole,
  type UniverseSyncResult,
} from "@/lib/universe";
import { createSongUniverseLink, type SongUniverseRole } from "@/lib/song/universe-links";
import { UniverseOverview } from "@/components/universe/UniverseOverview";
import { ShareConfigDialog, type SharePermissions } from "@/components/universe/ShareConfigDialog";
import { SharePasswordGate } from "@/components/universe/SharePasswordGate";
import { SharedUniverseView, type SharedUniverseViewProps } from "@/components/universe/SharedUniverseView";
import { UniverseAssets } from "@/components/universe/UniverseAssets";
import { UniverseWorks } from "@/components/universe/UniverseWorks";
import { UniverseCanon } from "@/components/universe/UniverseCanon";
import { UniverseInbox } from "@/components/universe/UniverseInbox";
import {
  getUniverseCopy,
  type UniverseOverviewData,
} from "@/components/universe/universe-view-model";
import styles from "@/components/universe/universe.module.css";

type TabKey = "overview" | "assets" | "works" | "canon" | "inbox";

type UniverseCreateWorkflow = Exclude<WorkflowType, "viral" | "creation">;

const UNIVERSE_CREATE_WORKFLOWS: Array<{ value: UniverseCreateWorkflow; label: string }> = [
  { value: "continuation", label: "Script Creation" },
  { value: "novel", label: "Novel Creation" },
  { value: "song", label: "Song Creation" },
  { value: "storyboard", label: "Storyboard Creation" },
  { value: "video", label: "Video Creation" },
];

const VALID_TABS: TabKey[] = ["overview", "assets", "works", "canon", "inbox"];

export default function UniverseDetailPage() {
  const params = useParams<{ universeId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const isZh = locale === "zh-CN";
  const copy = getUniverseCopy(isZh);

  const [session, setSession] = useState<Session | null>(null);
  const [bundle, setBundle] = useState<UniverseBundle | null>(null);
  const [overview, setOverview] = useState<UniverseOverviewData | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [syncWarning, setSyncWarning] = useState("");
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
    // §7.2 歌曲角色：仅在 workflowType === "song" 时使用
    songRole: "theme_song" as SongUniverseRole,
  });

  // Local projects (for extract / canon-check project selector)
  const [projects, setProjects] = useState<DramaProject[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [checking, setChecking] = useState(false);

  // §阶段 B 分享：身份判断 + 分享配置 + 访客视图
  // TRAE-V2-00 P0 修复：universeMeta 改为只承载 { isOwner, shareStatus }，
  // 不再依赖浏览器 RLS 返回 user_id（RLS 可能过滤该列导致所有者被误判为访客）。
  // isOwner 由服务端 /api/universes/[id]/me 权威返回。
  const [universeMeta, setUniverseMeta] = useState<{
    isOwner: boolean;
    shareStatus: "private" | "shared" | "removed" | null;
  } | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [shareConfig, setShareConfig] = useState<{
    share_status: "private" | "shared";
    share_permissions: SharePermissions;
    has_password: boolean;
  } | null>(null);
  const [shareConfigVersion, setShareConfigVersion] = useState(0);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [sharedData, setSharedData] = useState<Record<string, unknown> | null>(null);
  const [sharedDataLoading, setSharedDataLoading] = useState(false);

  // Sync ?tab=... searchParam
  useEffect(() => {
    const fromUrl = searchParams?.get("tab");
    if (fromUrl && (VALID_TABS as string[]).includes(fromUrl)) {
      setActiveTab(fromUrl as TabKey);
    }
  }, [searchParams]);

  // Update ?tab=... when changing tabs (no history spam; replace)
  const switchTab = useCallback((next: TabKey) => {
    setActiveTab(next);
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === next) return;
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.toString());
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      setSessionResolved(true);
      void refresh(data.session || null);
    });

    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        void refresh(nextSession);
      }) || {};

    if (!supabase) void refresh(null);
    return () => listener?.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (!cancelled) {
        setProjects(getUniverseSourceProjects(mergeProjectsForUniverseDetail(localProjects, cloudProjects)));
      }
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

  // §阶段 B 判断当前访问者是否为宇宙所有者
  // TRAE-V2-00 P0 修复：isOwner 直接使用服务端 /api/universes/[id]/me 的返回值，
  // 不再比较 session.user.id 与 universeMeta.userId（后者依赖浏览器 RLS，不可靠）。
  const isOwner = Boolean(universeMeta?.isOwner);

  // §阶段 B 访客 share token 从 localStorage 初始化
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(`share_token_${params.universeId}`);
    if (stored) setShareToken(stored);
  }, [params.universeId]);

  // §阶段 B 获取宇宙基本信息（isOwner + share_status）用于身份判断
  // TRAE-V2-00 P0 修复：改用服务端 /api/universes/[id]/me 判断所有者身份，
  // 不再依赖浏览器 RLS 返回 user_id 列（RLS 可能过滤该列，导致所有者被误判为访客）。
  // 服务端用 service role 绕过 RLS 读取 user_id 并与 session.user.id 比较。
  useEffect(() => {
    let cancelled = false;
    async function loadMeta() {
      // 未登录：直接标记为非所有者，shareStatus 未知
      if (!session?.access_token) {
        if (!cancelled) {
          setUniverseMeta({ isOwner: false, shareStatus: null });
          setMetaLoading(false);
        }
        return;
      }
      try {
        const res = await fetch(
          `/api/universes/${encodeURIComponent(params.universeId)}/me`,
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        );
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data?.success) {
          setUniverseMeta({ isOwner: false, shareStatus: null });
        } else {
          setUniverseMeta({
            isOwner: Boolean(data.isOwner),
            shareStatus:
              (data.shareStatus as "private" | "shared" | "removed" | null) || null,
          });
        }
      } catch {
        if (!cancelled) setUniverseMeta({ isOwner: false, shareStatus: null });
      }
      if (!cancelled) setMetaLoading(false);
    }
    void loadMeta();
    return () => {
      cancelled = true;
    };
  }, [params.universeId, session?.access_token]);

  // §阶段 B 创作者获取本人宇宙的分享配置
  useEffect(() => {
    if (!isOwner || !session?.access_token) return;
    let cancelled = false;
    async function loadShareConfig() {
      try {
        const res = await fetch(
          `/api/universes/${encodeURIComponent(params.universeId)}/share`,
          {
            headers: { Authorization: `Bearer ${session!.access_token}` },
          },
        );
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.success && data?.config) {
          const cfg = data.config as {
            share_status: string;
            permissions: SharePermissions;
            has_password: boolean;
          };
          setShareConfig({
            share_status: cfg.share_status === "shared" ? "shared" : "private",
            share_permissions: cfg.permissions,
            has_password: Boolean(cfg.has_password),
          });
        }
      } catch {
        // 分享配置是可选项，加载失败不影响主流程
      }
    }
    void loadShareConfig();
    return () => {
      cancelled = true;
    };
  }, [isOwner, session?.access_token, params.universeId, shareConfigVersion]);

  // §阶段 B 访客加载分享内容（根据 share token 验证并获取过滤后的内容）
  useEffect(() => {
    if (isOwner) return;
    if (!universeMeta || universeMeta.shareStatus !== "shared") return;

    const tokenToUse = shareToken;
    if (!tokenToUse) {
      setSharedData(null);
      setSharedDataLoading(false);
      return;
    }

    let cancelled = false;
    setSharedDataLoading(true);
    async function loadShared() {
      try {
        const res = await fetch(
          `/api/universes/${encodeURIComponent(params.universeId)}/shared`,
          {
            headers: { Authorization: `Bearer ${tokenToUse}` },
          },
        );
        if (!res.ok) {
          if (!cancelled) {
            setSharedData(null);
            if (res.status === 401 || res.status === 403) {
              // token 无效或过期，清除 localStorage
              if (typeof window !== "undefined") {
                window.localStorage.removeItem(`share_token_${params.universeId}`);
              }
              setShareToken(null);
            }
          }
          return;
        }
        const data = await res.json().catch(() => null);
        if (!cancelled && data) {
          setSharedData(data);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setSharedDataLoading(false);
      }
    }
    void loadShared();
    return () => {
      cancelled = true;
    };
  }, [isOwner, universeMeta, params.universeId, shareToken]);

  // Load overview via /api/universe/:id/overview (PRD §6.1)
  useEffect(() => {
    let cancelled = false;
    async function loadOverview() {
      if (!session?.access_token) {
        setOverview(null);
        setOverviewError("");
        return;
      }
      try {
        const res = await fetch(`/api/universe/${encodeURIComponent(params.universeId)}/overview`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.universe) {
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
        if (!cancelled) {
          setOverview(payload as UniverseOverviewData);
          setOverviewError("");
        }
      } catch (err) {
        if (!cancelled) {
          setOverview(null);
          setOverviewError(err instanceof Error ? err.message : "Failed to load overview");
        }
      }
    }
    void loadOverview();
    return () => { cancelled = true; };
  }, [params.universeId, session?.access_token]);

  function reportWriteSync(result: UniverseSyncResult, successMessage: string) {
    if (result.synced) {
      setSyncWarning("");
      setStatus(successMessage);
      return;
    }
    setSyncWarning(
      isZh
        ? `已保存在本机，但云端未同步：${result.error || "未知错误"}`
        : `Saved locally, but cloud sync failed: ${result.error || "unknown error"}`,
    );
  }

  async function refresh(nextSession: Session | null = session) {
    setLoading(true);
    const accessToken = nextSession?.access_token || null;
    const [nextBundle, nextEntitlement] = await Promise.all([
      getUniverseBundle(params.universeId, { accessToken }),
      readUniverseEntitlement({ accessToken }).catch(() =>
        canUseUniverseEngine({ email: nextSession?.user.email || "" }),
      ),
    ]);
    setBundle(nextBundle);
    setEntitlement(nextEntitlement);
    setLoading(false);
  }

  async function acceptItem(item: UniverseInboxItem, editedPayload?: Record<string, unknown>) {
    const result = await acceptInboxItem(item, editedPayload, { accessToken: session?.access_token });
    reportWriteSync(result.sync, isZh ? "Inbox 候选项已接受写入 canon。" : "Inbox item accepted into canon.");
    await refresh();
  }

  async function rejectItem(item: UniverseInboxItem) {
    const result = await rejectInboxItem(item, { accessToken: session?.access_token });
    reportWriteSync(result.sync, isZh ? "Inbox 候选项已拒绝。" : "Inbox item rejected.");
    await refresh();
  }

  async function extractFromProject(projectId: string) {
    const project = projectsById.get(projectId);
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
      const sync = await saveInboxItems(data.items || [], { accessToken: session?.access_token });
      reportWriteSync(sync, isZh ? "已从项目抽取候选项进入 Inbox。" : "Inbox updated with extracted candidates.");
      await refresh();
    } catch {
      setError(isZh ? "抽取失败，请稍后重试。" : "Extract failed. Please try again.");
    }
    setExtracting(false);
  }

  async function runCheck(projectId: string) {
    const project = projectsById.get(projectId);
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
      setStatus(isZh ? "Canon Check 完成。" : "Canon check complete.");
    } catch {
      setError(isZh ? "Canon Check 失败，请稍后重试。" : "Canon check failed. Please try again.");
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
      setError(isZh ? "请填写项目标题。" : "Project title is required.");
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
    try {
      await upsertProjectToSupabase(project, { accessToken: session?.access_token });
      const linkSync = await upsertUniverseProjectLink(link, { accessToken: session?.access_token });
      reportWriteSync(linkSync, isZh ? "项目已关联到宇宙。" : "Project linked to Universe.");

      // §7.2 路径一：从 Universe 创建歌曲时，额外建立 song_universe_links 草稿关联
      // 记录歌曲角色（主题曲/片尾曲/角色歌/插曲/BGM/宣传曲），与项目-Universe 通用关联互补
      if (createForm.workflowType === "song") {
        try {
          await createSongUniverseLink(
            {
              universe_id: bundle.universe.id,
              song_project_id: project.id,
              song_role: createForm.songRole,
              source_project_id: null,
              inheritance_scope: {},
              notes: isZh ? `从 Universe 创建：${title}` : `Created from Universe: ${title}`,
            },
            { accessToken: session?.access_token },
          );
        } catch (songLinkError) {
          // song_universe_links 创建失败不阻塞主流程（通用 project_link 已建立）
          console.warn("[universe] create song link failed", songLinkError);
        }
      }
    } catch (linkError) {
      const message = linkError instanceof Error ? linkError.message : String(linkError);
      setError(
        isZh
          ? `项目已保存在本机，但宇宙关联失败：${message}`
          : `Project saved locally, but Universe linking failed: ${message}`,
      );
      return;
    }

    router.push(routeForCreatedProject(project));
  }

  function exportBundle(format: "json" | "md") {
    if (!bundle) return;
    const content = format === "json" ? createUniverseJsonExport(bundle) : exportUniverseMarkdown(bundle);
    downloadBlob(
      `${safeFileName(bundle.universe.name)}-universe.${format === "json" ? "json" : "md"}`,
      content,
      format === "json" ? "application/json" : "text/markdown",
    );
  }

  const tabs = useMemo<Array<{ key: TabKey; label: string; count?: number }>>(() => [
    { key: "overview", label: copy.detail.overview },
    { key: "assets", label: copy.detail.assets, count: bundle?.entities.length },
    { key: "works", label: copy.detail.works, count: bundle?.links.length },
    {
      key: "canon",
      label: copy.detail.canon,
      count: bundle ? bundle.canonFacts.length + bundle.relationships.length + bundle.timeline.length + bundle.reports.length : 0,
    },
    {
      key: "inbox",
      label: copy.detail.inbox,
      count: bundle?.inbox.filter((item) => item.status === "pending").length,
    },
  ], [bundle, copy]);

  // §阶段 B 访客身份分流：等待 session 和 meta 都加载完毕后再判断身份
  if (!sessionResolved || metaLoading) {
    return (
      <main className={styles.page}>
        <section className={styles.loadingState}>
          <Loader2 size={28} className="spin" />
          <span>{copy.list.loading}</span>
        </section>
      </main>
    );
  }

  if (!isOwner) {
    // 访客视图
    if (!universeMeta || universeMeta.shareStatus !== "shared") {
      // 未分享或不存在（出于安全不区分两种情况）
      return (
        <main className={styles.page}>
          <section className={styles.emptyState}>
            <strong>{t("share.notShared")}</strong>
            <Link className={styles.primaryButton} href="/universes">
              {copy.detail.back}
            </Link>
          </section>
        </main>
      );
    }
    // 已分享 — 检查 share token
    if (sharedDataLoading) {
      return (
        <main className={styles.page}>
          <section className={styles.loadingState}>
            <Loader2 size={28} className="spin" />
            <span>{copy.list.loading}</span>
          </section>
        </main>
      );
    }
    if (!shareToken || !sharedData) {
      // 无 token 或 token 无效 → 显示密码输入页
      return (
        <main className={styles.page}>
          <SharePasswordGate
            universeId={params.universeId}
            universe={{
              name: bundle?.universe.name || "",
            }}
            onVerified={(token: string) => {
              if (typeof window !== "undefined") {
                window.localStorage.setItem(
                  `share_token_${params.universeId}`,
                  token,
                );
              }
              setShareToken(token);
            }}
          />
        </main>
      );
    }
    // token 有效 → 显示访客视图
    // sharedData 来自 /api/universes/[id]/shared，形状为 { universe, permissions, sections, owner }
    const shared = sharedData as {
      universe: {
        id: string;
        name: string;
        cover_url?: string;
        tagline?: string;
        description?: string;
      };
      permissions: SharePermissions;
      sections: SharedUniverseViewProps["sections"];
      owner?: {
        username?: string | null;
        display_name?: string | null;
        avatar_url?: string | null;
      } | null;
    };
    return (
      <main className={styles.page}>
        <SharedUniverseView
          universe={{
            id: shared.universe.id,
            name: shared.universe.name,
            cover_url: shared.universe.cover_url,
            tagline: shared.universe.tagline,
            description: shared.universe.description,
            owner_username: shared.owner?.username ?? undefined,
            owner_display_name: shared.owner?.display_name ?? undefined,
            owner_avatar_url: shared.owner?.avatar_url ?? undefined,
          }}
          permissions={shared.permissions}
          sections={shared.sections}
        />
      </main>
    );
  }

  // 以下为创作者（owner）视图
  if (loading) {
    return (
      <main className={styles.page}>
        <section className={styles.loadingState}>
          <Loader2 size={28} className="spin" />
          <span>{copy.list.loading}</span>
        </section>
      </main>
    );
  }

  if (!bundle) {
    return (
      <main className={styles.page}>
        <section className={styles.emptyState}>
          <strong>{isZh ? "未找到宇宙" : "Universe not found"}</strong>
          <Link className={styles.primaryButton} href="/universes">
            {copy.detail.back}
          </Link>
        </section>
      </main>
    );
  }

  const fallbackLinks = bundle.links.map((link) => ({
    projectId: link.project_id,
    projectRole: link.project_role,
    updatedAt: link.updated_at,
    title: projectsById.get(link.project_id)?.title || link.project_id,
  }));

  const inboxSelectableLinks = selectableLinks.map((link) => ({
    projectId: link.project_id,
    title: projectsById.get(link.project_id)?.title || link.project_id,
  }));

  return (
    <main className={`${styles.page} ${styles.detailShell}`}>
      <header className={styles.detailHeader}>
        <div className={styles.titleBrand}>
          <Link className={styles.iconButton} href="/universes" title={copy.detail.back} aria-label={copy.detail.back}>
            <ArrowLeft size={18} />
          </Link>
          <div className={styles.titleCopy}>
            <span className={styles.kicker}>{isZh ? "宇宙" : "Universe"}</span>
            <h1 className={styles.detailTitle}>{bundle.universe.name}</h1>
          </div>
        </div>
        <div className={styles.headerActions}>
          {shareConfig?.share_status === "shared" ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                background: "rgba(109, 231, 223, 0.15)",
                color: "#6de7df",
                border: "1px solid rgba(109, 231, 223, 0.3)",
              }}
            >
              {t("share.status.sharedBadge")}
            </span>
          ) : null}
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setShareDialogOpen(true)}
            title={t("share.button")}
          >
            <Share2 size={15} /> {t("share.button")}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => exportBundle("json")}>
            <Download size={15} /> JSON
          </button>
          <button type="button" className={styles.secondaryButton} onClick={() => exportBundle("md")}>
            <Download size={15} /> MD
          </button>
          <Link
            className={styles.secondaryButton}
            href={`/production?mode=art&setup=1&universeId=${encodeURIComponent(params.universeId)}`}
          >
            <Palette size={15} /> {isZh ? "美术工作台" : "Art workbench"}
          </Link>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setCreateOpen(true)}
            disabled={!entitlement.canUse}
          >
            <FilePlus2 size={15} /> {isZh ? "创建项目" : "Create Project"}
          </button>
        </div>
      </header>

      {status ? (
        <div className={`${styles.notice} ${styles.noticeSuccess}`}>
          <CheckCircle2 size={15} /> {status}
        </div>
      ) : null}
      {error ? (
        <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div>
      ) : null}
      {syncWarning ? (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          <XCircle size={15} /> {syncWarning}
        </div>
      ) : null}
      {overviewError ? (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          {isZh ? `概览加载失败：${overviewError}` : `Overview failed to load: ${overviewError}`}
        </div>
      ) : null}

      <nav className={styles.tabs} aria-label="Universe sections">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.tabButton} ${activeTab === tab.key ? "active" : ""}`}
            aria-selected={activeTab === tab.key}
            onClick={() => switchTab(tab.key)}
          >
            {tab.label}
            {typeof tab.count === "number" ? <span className={styles.tabCount}>{tab.count}</span> : null}
          </button>
        ))}
      </nav>

      <section className={styles.tabPanel}>
        {activeTab === "overview" ? (
          overview ? (
            <UniverseOverview overview={overview} isZh={isZh} />
          ) : (
            <div className={styles.loadingState}>
              <Loader2 size={20} className="spin" />
              <span>{isZh ? "正在加载概览…" : "Loading overview…"}</span>
            </div>
          )
        ) : null}

        {activeTab === "assets" ? (
          <UniverseAssets
            entities={bundle.entities}
            links={bundle.links}
            projectsById={projectsById}
            isZh={isZh}
          />
        ) : null}

        {activeTab === "works" ? (
          <UniverseWorks
            universeId={params.universeId}
            accessToken={session?.access_token || null}
            isZh={isZh}
            fallbackLinks={fallbackLinks}
          />
        ) : null}

        {activeTab === "canon" ? (
          <UniverseCanon
            canonFacts={bundle.canonFacts}
            relationships={bundle.relationships}
            timeline={bundle.timeline}
            reports={bundle.reports}
            isZh={isZh}
          />
        ) : null}

        {activeTab === "inbox" ? (
          <UniverseInbox
            inbox={bundle.inbox}
            entitlement={entitlement}
            isZh={isZh}
            projectsById={projectsById}
            onAccept={acceptItem}
            onReject={rejectItem}
            onExtract={extractFromProject}
            selectableLinks={inboxSelectableLinks}
            extracting={extracting}
          />
        ) : null}
      </section>

      {/* Canon Check runner — accessible from Canon tab toolbar */}
      {activeTab === "canon" && selectableLinks.length ? (
        <CanonCheckRunner
          isZh={isZh}
          selectableLinks={inboxSelectableLinks}
          onRun={runCheck}
          checking={checking}
        />
      ) : null}

      {shareDialogOpen && shareConfig ? (
        <ShareConfigDialog
          open={shareDialogOpen}
          onClose={() => setShareDialogOpen(false)}
          universeId={params.universeId}
          initialConfig={shareConfig}
          onSaved={() => {
            setShareDialogOpen(false);
            setShareConfigVersion((v) => v + 1);
          }}
        />
      ) : null}

      {createOpen ? (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <h2 className={styles.panelTitle}>
              {isZh ? "从宇宙创建项目" : "Create Project from Universe"}
            </h2>
            <p className={styles.panelBody}>
              {isZh
                ? "项目会继承宇宙的角色、世界观与 Canon。可在工作台里继续修改。"
                : "Project inherits Universe characters, world and canon. You can keep editing in the workbench."}
            </p>
            <div className={styles.titleBar}>
              <label>
                {isZh ? "标题" : "Title"}
                <input
                  value={createForm.title}
                  onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))}
                  autoFocus
                />
              </label>
              <label>
                {isZh ? "工作流" : "Workflow"}
                <select
                  value={createForm.workflowType}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, workflowType: event.target.value as UniverseCreateWorkflow }))
                  }
                >
                  {UNIVERSE_CREATE_WORKFLOWS.map((workflow) => (
                    <option key={workflow.value} value={workflow.value}>
                      {workflow.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {isZh ? "角色" : "Role"}
                <select
                  value={createForm.projectRole}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, projectRole: event.target.value as UniverseProjectRole }))
                  }
                >
                  <option value="main_season">{isZh ? "主线季" : "Main season"}</option>
                  <option value="spin_off">{isZh ? "衍生" : "Spin-off"}</option>
                  <option value="prequel">{isZh ? "前传" : "Prequel"}</option>
                  <option value="adaptation">{isZh ? "改编" : "Adaptation"}</option>
                  <option value="localization">{isZh ? "本地化" : "Localization"}</option>
                  <option value="other">{isZh ? "其他" : "Other"}</option>
                </select>
              </label>
              {createForm.workflowType === "song" && (
                <label>
                  {isZh ? "歌曲角色" : "Song Role"}
                  <select
                    value={createForm.songRole}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, songRole: event.target.value as SongUniverseRole }))
                    }
                  >
                    <option value="theme_song">{isZh ? "主题曲" : "Theme song"}</option>
                    <option value="ending_song">{isZh ? "片尾曲" : "Ending song"}</option>
                    <option value="character_song">{isZh ? "角色歌" : "Character song"}</option>
                    <option value="insert_song">{isZh ? "插曲" : "Insert song"}</option>
                    <option value="bgm">BGM</option>
                    <option value="promo_song">{isZh ? "宣传曲" : "Promo song"}</option>
                  </select>
                </label>
              )}
              <label>
                {isZh ? "季" : "Season"}
                <input
                  type="number"
                  value={createForm.seasonNumber}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, seasonNumber: Number(event.target.value) || 1 }))
                  }
                />
              </label>
              <label>
                {isZh ? "市场" : "Market"}
                <input
                  value={createForm.market}
                  onChange={(event) => setCreateForm((current) => ({ ...current, market: event.target.value }))}
                />
              </label>
              <label>
                {isZh ? "语言" : "Language"}
                <input
                  value={createForm.language}
                  onChange={(event) => setCreateForm((current) => ({ ...current, language: event.target.value }))}
                />
              </label>
              <label>
                {isZh ? "集数" : "Episodes"}
                <input
                  type="number"
                  value={createForm.episodeCount}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, episodeCount: Number(event.target.value) || 12 }))
                  }
                />
              </label>
              <label>
                {isZh ? "单集时长" : "Episode duration"}
                <input
                  value={createForm.episodeDuration}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, episodeDuration: event.target.value }))
                  }
                />
              </label>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setCreateOpen(false)}>
                {isZh ? "取消" : "Cancel"}
              </button>
              <button type="button" className={styles.primaryButton} onClick={() => void createProjectFromUniverse()}>
                {isZh ? "创建" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

/**
 * Canon Check runner — kept inline because PRD §6.4 allows a project selector + run button
 * anchored under the Canon tab. Uses local project list (no cross-table client fetch).
 */
function CanonCheckRunner({
  isZh,
  selectableLinks,
  onRun,
  checking,
}: {
  isZh: boolean;
  selectableLinks: Array<{ projectId: string; title: string }>;
  onRun: (projectId: string) => Promise<void>;
  checking: boolean;
}) {
  const [projectId, setProjectId] = useState("");
  return (
    <div className={styles.actionBar} style={{ marginTop: 12 }}>
      <select
        className={styles.select}
        value={projectId}
        onChange={(event) => setProjectId(event.target.value)}
        disabled={!selectableLinks.length}
      >
        <option value="">{isZh ? "选择要检查的项目" : "Select a project to check"}</option>
        {selectableLinks.map((link) => (
          <option key={link.projectId} value={link.projectId}>
            {link.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={styles.secondaryButton}
        onClick={() => projectId && void onRun(projectId)}
        disabled={!projectId || checking}
      >
        {checking ? <Loader2 size={14} className="spin" /> : null}
        {isZh ? "运行 Canon Check" : "Run Canon Check"}
      </button>
    </div>
  );
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
        input.bundle.entities
          .filter((entity) => entity.type === "character")
          .slice(0, 12)
          .map((entity) => `- ${entity.name}: ${entity.summary}`)
          .join("\n"),
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
  if (project.workflowType === "storyboard") return `/production?projectId=${encodeURIComponent(project.id)}&mode=planning`;
  if (project.workflowType === "video") return `/production?projectId=${encodeURIComponent(project.id)}&mode=editor`;
  return `/novel-workbench?projectId=${encodeURIComponent(project.id)}`;
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
    bundle.entities
      .filter((entity) => entity.type === "character")
      .slice(0, 10)
      .map((entity) => `- ${entity.name}: ${entity.summary}`)
      .join("\n"),
    "",
    "Locations:",
    bundle.entities
      .filter((entity) => entity.type === "location")
      .slice(0, 8)
      .map((entity) => `- ${entity.name}: ${entity.summary}`)
      .join("\n"),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildUniverseSongMarkdown(bundle: UniverseBundle, title: string) {
  const concept = [
    `${title} is an OST/theme song concept inherited from ${bundle.universe.name}.`,
    bundle.universe.description,
    bundle.canonFacts.slice(0, 8).map((fact) => `- ${fact.fact_text}`).join("\n"),
  ]
    .filter(Boolean)
    .join("\n");

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
  ]
    .filter(Boolean)
    .join(". ");

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
