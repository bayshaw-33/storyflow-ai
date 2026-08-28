"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Bell, Check, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { WorkType } from "@/lib/contracts/v2/work";
import type { UniverseCommunityData } from "@/lib/contracts/v2/community-universe";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
import { startProject } from "@/lib/client/v2/project-start/api";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { UniverseEntitiesSection } from "./UniverseEntitiesSection";
import { UniverseTimeline } from "./UniverseTimeline";
import { UniverseWorksSection } from "./UniverseWorksSection";
import styles from "@/app/community/community.module.css";

const WORK_OPTIONS: Array<{ value: WorkType; label: string }> = [
  { value: "script", label: "剧本" },
  { value: "song", label: "歌曲" },
  { value: "art", label: "美术" },
  { value: "storyboard", label: "分镜" },
  { value: "video", label: "视频" },
  { value: "voice", label: "配音" },
  { value: "editing", label: "剪辑" },
];

export function UniverseCommunityPage(props: { data: UniverseCommunityData | null; viewerId: string | null; error?: string | null }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "works" | "objects" | "timeline">("overview");
  const [followed, setFollowed] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [workType, setWorkType] = useState<WorkType>("script");
  const [title, setTitle] = useState("");
  const universeId = props.data?.universe.id ?? "";

  useEffect(() => {
    if (!props.viewerId || !universeId) {
      setFollowed(false);
      return;
    }
    let cancelled = false;
    void fetchWithAuthRetry(`/api/v2/community/follows?check=1&targetType=universe&targetId=${encodeURIComponent(universeId)}`)
      .then(async (response) => {
        const result = (await response.json().catch(() => ({}))) as { success?: boolean; following?: boolean };
        if (!cancelled && response.ok && result.success) setFollowed(result.following === true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [props.viewerId, universeId]);

  if (!props.data) {
    return (
      <main className={`cosmic-page ${styles.universeShell}`}>
        <section className={styles.universeEmptyState} role="status">
          <span className={styles.universeKicker}>UNIVERSE COMMUNITY</span>
          <h1>Universe 暂时无法加载</h1>
          <p>{props.error || "公开数据服务没有返回可用内容。不会使用演示数据替代。"}</p>
          <button type="button" className={styles.universeActionPrimary} onClick={() => window.location.reload()}><RefreshCw size={15} />重试</button>
        </section>
      </main>
    );
  }

  const data: UniverseCommunityData = props.data;

  async function toggleFollow() {
    if (!props.viewerId) {
      router.push("/login");
      return;
    }
    setFollowBusy(true);
    setActionError(null);
    try {
      const response = await fetchWithAuthRetry("/api/v2/community/follows", { method: "POST", body: JSON.stringify({ targetType: "universe", targetId: data.universe.id }) });
      const result = (await response.json().catch(() => ({}))) as { success?: boolean; following?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "关注操作失败，请稍后重试。");
      setFollowed(result.following === true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "关注操作失败，请稍后重试。");
    } finally {
      setFollowBusy(false);
    }
  }

  async function createWork() {
    if (!props.viewerId) {
      router.push("/login");
      return;
    }
    const client = getSupabaseBrowserClient();
    const session = await client?.auth.getSession();
    const authToken = session?.data.session?.access_token;
    if (!authToken) {
      router.push("/login");
      return;
    }
    setCreating(true);
    setActionError(null);
    const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `universe-${Date.now()}`;
    try {
      const result = await startProject({ workType, authToken, idempotencyKey, title: title.trim() || undefined, universeId: data.universe.id });
      const binding = await fetchWithAuthRetry(`/api/v2/projects/${encodeURIComponent(result.projectId)}/universe/bind`, {
        method: "POST",
        headers: { "idempotency-key": `community-universe:${data.universe.id}:${result.projectId}` },
        body: JSON.stringify({ universeId: data.universe.id }),
      });
      const bindingBody = (await binding.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!binding.ok || !bindingBody.success) throw new Error("Project 已创建，但 Universe 关联失败，请稍后重试。");
      router.push(result.workbenchRoute);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "创建失败，请稍后重试。");
    } finally {
      setCreating(false);
    }
  }

  const tabItems = [
    ["overview", "概览"],
    ["works", `作品 ${data.works.length}`],
    ["objects", `世界对象 ${data.entities.length}`],
    ["timeline", "时间线"],
  ] as const;

  return (
    <main className={`cosmic-page ${styles.universeShell}`}>
      <header className={styles.universeHeader}>
        <div className={styles.universeHeaderTop}>
          <Link href="/community" className={styles.backLink}><ArrowLeft size={15} />返回社区</Link>
          <span className={styles.universeContract}>UNIVERSE COMMUNITY / {data.access.toUpperCase()}</span>
        </div>
        <div className={styles.universeHeaderGrid}>
          <div>
            <span className={styles.universeKicker}>UNIVERSE · 世界母版</span>
            <h1 className={styles.universeTitle}>{data.universe.name}</h1>
            <p className={styles.universeSummary}>{data.universe.summary || "这个 Universe 还没有写下简介。"}</p>
            <div className={styles.universeMeta}><span>{data.universe.genre || "未分类"}</span><span>{data.universe.language || "语言未标注"}</span><span>更新于 {formatDate(data.universe.updatedAt)}</span></div>
            {data.universe.tags.length ? <div className={styles.universeTags}>{data.universe.tags.map((tag) => <span className={styles.universeTag} key={tag}>#{tag}</span>)}</div> : null}
          </div>
          <div className={styles.universeHeaderActions}>
            <button type="button" className={followed ? styles.universeActionActive : styles.universeAction} onClick={() => void toggleFollow()} disabled={followBusy}><Bell size={15} />{followed ? "已关注" : "关注 Universe"}</button>
            <Link href={`/universes/${encodeURIComponent(data.universe.id)}`} className={styles.universeActionPrimary}>打开工作台 <ExternalLink size={14} /></Link>
          </div>
        </div>
      </header>

      {data.degraded ? <div className={styles.degradedNotice} role="status"><Sparkles size={15} /><span>部分 Universe 数据暂时不可用：{data.degradedSources.join("、")}。</span><button type="button" onClick={() => window.location.reload()}>重试</button></div> : null}
      {actionError ? <div className={styles.universeActionError} role="alert">{actionError}</div> : null}

      <div className={styles.universeLayout}>
        <div className={styles.universeMain}>
          <nav className={styles.universeTabs} aria-label="Universe 社区内容">
            {tabItems.map(([value, label]) => <button type="button" key={value} className={activeTab === value ? styles.universeTabActive : styles.universeTab} onClick={() => setActiveTab(value)}>{label}</button>)}
          </nav>
          {activeTab === "overview" ? <><Overview data={data} onCreate={() => setCreateOpen(true)} /></> : null}
          {activeTab === "works" ? <UniverseWorksSection works={data.works} isOwner={data.isOwner} onCreate={() => setCreateOpen(true)} /> : null}
          {activeTab === "objects" ? <UniverseEntitiesSection entities={data.entities} actors={data.actors} voices={data.voices} assets={data.assets} localOverlays={data.localOverlays} candidates={data.candidates} isOwner={data.isOwner} /> : null}
          {activeTab === "timeline" ? <UniverseTimeline events={data.timeline} versions={data.versions} /> : null}
        </div>
        <aside className={styles.universeSideRail}>
          <section className={styles.universeSideCard}><span className={styles.universePanelKicker}>WORLD INDEX</span><strong>{data.entities.length}</strong><span>世界对象</span><div><b>{data.works.length}</b> 关联作品 <b>{data.actors.length}</b> 演员 <b>{data.assets.length}</b> 资产</div></section>
          <section className={styles.universeSideCard}><span className={styles.universePanelKicker}>CANON STATUS</span><div className={styles.canonSignal}><Check size={15} />{data.universe.status}</div><p>{data.isOwner ? "你正在查看完整的所有者视图，草稿和本地覆盖层不会混入公开投影。" : "你正在查看经过公开发布与权限过滤的 Canon 视图。"}</p></section>
          <Link className={styles.universeSideLink} href={data.universe.publicationId ? `/community/${encodeURIComponent(data.universe.publicationId)}` : "/community"}>查看发布记录 <ArrowUpRight size={14} /></Link>
        </aside>
      </div>

      {createOpen ? <div className={styles.createDialogBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}><section className={styles.createDialogCard} role="dialog" aria-modal="true" aria-labelledby="create-universe-work-title"><div className={styles.createDialogHeader}><div><span className={styles.universePanelKicker}>RETURN TO CREATION</span><h2 id="create-universe-work-title">从这个 Universe 开始一个 Work</h2></div><button type="button" className={styles.universeIconButton} onClick={() => setCreateOpen(false)} aria-label="关闭">×</button></div><label className={styles.createField}><span>Work 类型</span><select value={workType} onChange={(event) => setWorkType(event.target.value as WorkType)}>{WORK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className={styles.createField}><span>项目标题（可选）</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`未命名${WORK_OPTIONS.find((option) => option.value === workType)?.label || "创作"}`} maxLength={120} /></label><p className={styles.createHint}>会先创建 Project + Primary Work，再建立 Universe 绑定；任何一步失败都会明确提示，不会静默跳转。</p><div className={styles.createDialogActions}><button type="button" className={styles.universeAction} onClick={() => setCreateOpen(false)} disabled={creating}>取消</button><button type="button" className={styles.universeActionPrimary} onClick={() => void createWork()} disabled={creating}>{creating ? "创建中…" : "创建并打开工作台"}</button></div></section></div> : null}
    </main>
  );
}

function Overview(props: { data: UniverseCommunityData; onCreate: () => void }) {
  return (
    <>
      <section className={styles.universePanel}>
        <div className={styles.universePanelHeader}><div><span className={styles.universePanelKicker}>THE WORLD</span><h2 className={styles.universePanelTitle}>一个可继续进入的世界</h2></div><span className={styles.universePanelKicker}>CANON / WORK / LOCAL</span></div>
        <p className={styles.universeDescription}>{props.data.universe.description || "这个 Universe 还没有写下完整描述。"}</p>
        <div className={styles.universeOverviewStats}><div><strong>{props.data.works.length}</strong><span>关联作品</span></div><div><strong>{props.data.entities.length}</strong><span>世界对象</span></div><div><strong>{props.data.timeline.length}</strong><span>时间线事件</span></div><div><strong>{props.data.versions.length}</strong><span>版本记录</span></div></div>
      </section>
      <UniverseWorksSection works={props.data.works.slice(0, 3)} isOwner={props.data.isOwner} onCreate={props.onCreate} />
      <UniverseTimeline events={props.data.timeline.slice(0, 4)} versions={props.data.versions.slice(0, 3)} />
    </>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(date);
}
