"use client";

// Kiikis 2.0 Universe 工作台主容器
// 渲染 9 个交付物：概览 / Bible / 资产 / 作品 / Canon / Inbox / 关系时间线 / 健康度 / 影响分析。
// 数据来源：v2 fixture（默认）或真实 API（USE_FIXTURE=false）。
// 通过 URL ?view=v2 显式启用，?view=v1 回退到 1.0 详情页。

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Activity,
  BookOpen,
  Boxes,
  Film,
  Lock,
  Inbox as InboxIcon,
  GitBranch,
  HeartPulse,
  AlertCircle,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  fetchUniverseBundle,
  isUnauthenticatedError,
  type FetchUniverseBundleOptions,
} from "@/lib/client/v2/universe/api";
import type {
  UniverseBundleV2,
  UniverseBundleStatus,
} from "@/lib/client/v2/universe/types";
import styles from "./universe.module.css";
import { OverviewPanel } from "./OverviewPanel";
import { BiblePanel } from "./BiblePanel";
import { AssetsPanel } from "./AssetsPanel";
import { WorksPanel } from "./WorksPanel";
import { CanonPanel } from "./CanonPanel";
import { InboxPanel } from "./InboxPanel";
import { RelationshipsTimelinePanel } from "./RelationshipsTimelinePanel";
import { HealthPanel } from "./HealthPanel";
import { ImpactAnalysisPanel } from "./ImpactAnalysisPanel";

type TabKey =
  | "overview"
  | "bible"
  | "assets"
  | "works"
  | "canon"
  | "inbox"
  | "relationships"
  | "health"
  | "impact";

const VALID_TABS: TabKey[] = [
  "overview",
  "bible",
  "assets",
  "works",
  "canon",
  "inbox",
  "relationships",
  "health",
  "impact",
];

export function UniverseWorkbenchClient() {
  const params = useParams<{ universeId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  // fixture 预览模式：?fixture=universe 显式指定（默认即走 fixture）。
  const fixtureParam = searchParams.get("fixture") === "universe" ? "universe" : null;
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<TabKey>(
    initialTab && (VALID_TABS as string[]).includes(initialTab) ? (initialTab as TabKey) : "overview",
  );
  const [bundle, setBundle] = useState<UniverseBundleV2 | null>(null);
  const [status, setStatus] = useState<UniverseBundleStatus>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const options: FetchUniverseBundleOptions = fixtureParam ? { fixture: fixtureParam } : {};
      const result = await fetchUniverseBundle(params.universeId, null, options);
      setBundle(result);
      setStatus("ready");
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        setStatus("unauthenticated");
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : isZh ? "加载宇宙数据失败。" : "Failed to load universe.");
      setStatus("error");
    }
  }, [params.universeId, fixtureParam, isZh]);

  useEffect(() => {
    void load();
  }, [load]);

  // 切换 tab：同步到 URL ?tab=，replace 不污染历史。
  const switchTab = useCallback((next: TabKey) => {
    setActiveTab(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  const tabs = useMemo<Array<{ key: TabKey; label: string; icon: typeof Activity; count?: number }>>(() => {
    if (!bundle) return [];
    const pendingCount = bundle.proposals.filter((p) => p.status === "pending_review" || p.status === "draft").length;
    return [
      { key: "overview", label: isZh ? "概览" : "Overview", icon: Activity },
      { key: "bible", label: isZh ? "圣经" : "Bible", icon: BookOpen, count: bundle.rules.length },
      { key: "assets", label: isZh ? "资产" : "Assets", icon: Boxes, count: bundle.characters.length + bundle.locations.length + bundle.organizations.length + bundle.props.length + bundle.concepts.length },
      { key: "works", label: isZh ? "作品" : "Works", icon: Film, count: bundle.works.length },
      { key: "canon", label: isZh ? "Canon" : "Canon", icon: Lock, count: bundle.canonFacts.length },
      { key: "inbox", label: isZh ? "Inbox" : "Inbox", icon: InboxIcon, count: pendingCount },
      { key: "relationships", label: isZh ? "关系时间线" : "Relations", icon: GitBranch, count: bundle.relationships.length },
      { key: "health", label: isZh ? "健康度" : "Health", icon: HeartPulse },
      { key: "impact", label: isZh ? "影响分析" : "Impact", icon: AlertCircle },
    ];
  }, [bundle, isZh]);

  if (status === "loading") {
    return (
      <main className={styles.shell}>
        <div className={styles.loadingState}>
          <Loader2 size={28} className="spin" />
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
            {isZh ? "正在加载宇宙工作台…" : "Loading universe workbench…"}
          </span>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <div className={`${styles.notice} ${styles.noticeError}`}>
            <AlertCircle size={16} /> {errorMsg}
          </div>
          <button type="button" className={styles.button} onClick={() => void load()}>
            {isZh ? "重试" : "Retry"}
          </button>
        </div>
      </main>
    );
  }

  if (status === "unauthenticated" || !bundle) {
    return (
      <main className={styles.shell}>
        <div className={styles.emptyState}>
          <strong className={styles.emptyTitle}>
            {isZh ? "请登录后查看宇宙" : "Please sign in to view universe"}
          </strong>
          <Link className={styles.buttonPrimary} href="/login">
            {isZh ? "登录" : "Sign in"}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <Link
              href="/universes"
              className={styles.cardLink}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 6 }}
            >
              <ArrowLeft size={14} />
              {isZh ? "返回宇宙列表" : "Back to universes"}
            </Link>
            <p className={styles.eyebrow}>Kiikis 2.0 · Universe Engine</p>
            <h1 className={styles.title}>{bundle.universe.name}</h1>
            <p className={styles.subtitle}>{bundle.universe.summary}</p>
          </div>
          <div className={styles.headerActions}>
            {fixtureParam ? (
              <span className={styles.fixtureBadge}>FIXTURE PREVIEW</span>
            ) : null}
            <Link
              href={`/universes/${encodeURIComponent(params.universeId)}?view=v1`}
              className={`${styles.button} ${styles.buttonSmall}`}
            >
              {isZh ? "回到 1.0 视图" : "Back to 1.0 view"}
            </Link>
          </div>
        </header>

        <nav className={styles.tabs} aria-label="Universe workbench sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                className={`${styles.tabButton} ${activeTab === tab.key ? styles.tabButtonActive : ""}`}
                aria-selected={activeTab === tab.key}
                onClick={() => switchTab(tab.key)}
              >
                <Icon size={14} />
                {tab.label}
                {typeof tab.count === "number" ? (
                  <span className={styles.tabCount}>{tab.count}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {activeTab === "overview" ? <OverviewPanel bundle={bundle} onNavigate={switchTab} /> : null}
        {activeTab === "bible" ? <BiblePanel bundle={bundle} /> : null}
        {activeTab === "assets" ? <AssetsPanel bundle={bundle} /> : null}
        {activeTab === "works" ? <WorksPanel bundle={bundle} /> : null}
        {activeTab === "canon" ? <CanonPanel bundle={bundle} onNavigate={switchTab} /> : null}
        {activeTab === "inbox" ? <InboxPanel bundle={bundle} onNavigate={switchTab} /> : null}
        {activeTab === "relationships" ? <RelationshipsTimelinePanel bundle={bundle} /> : null}
        {activeTab === "health" ? <HealthPanel bundle={bundle} onNavigate={switchTab} /> : null}
        {activeTab === "impact" ? <ImpactAnalysisPanel bundle={bundle} /> : null}
      </div>
    </main>
  );
}
