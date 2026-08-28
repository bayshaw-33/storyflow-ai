"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Layers3, Sparkles } from "lucide-react";
import type { CommunityFeedProjection } from "@/lib/contracts/v2/community";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
import {
  COMMUNITY_SECTIONS,
  getCommunitySectionLabel,
  type CommunitySectionId,
} from "@/lib/client/v2/community/view-model";
import { useI18n } from "@/lib/i18n/useI18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PublicationCard } from "./PublicationCard";
import { CommunityEmptyState } from "./CommunityEmptyState";
import { CommunityFilters } from "./CommunityFilters";
import { CommunityNavigation } from "./CommunityNavigation";
import styles from "@/app/community/community.module.css";

interface DiscoveryFeedProps {
  initialItems: CommunityFeedProjection[];
  loadError: string | null;
  initialViewerId?: string | null;
  initialNextCursor?: string | null;
  initialHasMore?: boolean;
}

interface FeedResponse {
  success?: boolean;
  items?: CommunityFeedProjection[];
  nextOffset?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
  error?: string;
}

interface FollowItem {
  targetType?: string;
  targetId?: string;
}

interface BookmarkItem {
  publicationId?: string;
}

const REMOTE_SECTIONS = new Set<CommunitySectionId>(
  COMMUNITY_SECTIONS
    .filter(({ id }) => id !== "following" && id !== "saved")
    .map(({ id }) => id),
);

export function DiscoveryFeed({ initialItems, loadError, initialViewerId = null, initialNextCursor = null, initialHasMore = false }: DiscoveryFeedProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [activeSection, setActiveSection] = useState<CommunitySectionId>("recommended");
  const [items, setItems] = useState<CommunityFeedProjection[]>(initialItems);
  const [error, setError] = useState<string | null>(loadError);
  const [loading, setLoading] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(initialViewerId);
  const [viewerReady, setViewerReady] = useState(false);
  const [query, setQuery] = useState("");
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const requestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const client = getSupabaseBrowserClient();
    if (!client) {
      setViewerReady(true);
      return;
    }

    void client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setViewerId(data.session?.user?.id ?? null);
      setViewerReady(true);
    }).catch(() => {
      if (!cancelled) setViewerReady(true);
    });

    const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
      setViewerId(session?.user?.id ?? null);
      setViewerReady(true);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const loadRemoteSection = useCallback(async (section: CommunitySectionId, append = false, searchQuery = "") => {
    if (!REMOTE_SECTIONS.has(section)) return;
    const currentRequestId = ++requestIdRef.current;
    const params = new URLSearchParams({ section, limit: "20" });
    if (append && nextCursor) params.set("cursor", nextCursor);
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuthRetry(
        `/api/v2/community/feed?${params.toString()}`,
      );
      const json = (await response.json().catch(() => ({}))) as FeedResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.error || (isZh ? "社区内容加载失败。" : "Community feed failed to load."));
      }
      if (currentRequestId !== requestIdRef.current) return;
      const nextItems = json.items ?? [];
      setItems((current) => append ? [...current, ...nextItems] : nextItems);
      setNextCursor(json.nextCursor ?? null);
      setHasMore(json.hasMore === true);
    } catch (cause) {
      if (currentRequestId !== requestIdRef.current) return;
      setError(cause instanceof Error ? cause.message : isZh ? "社区内容加载失败。" : "Community feed failed to load.");
      if (!append) setItems([]);
      setHasMore(false);
    } finally {
      if (currentRequestId === requestIdRef.current) setLoading(false);
    }
  }, [isZh, nextCursor]);

  const loadPersonalSection = useCallback(async (section: "following" | "saved") => {
    if (!viewerId) {
      setItems([]);
      setHasMore(false);
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [feedResponse, relationResponse] = await Promise.all([
        fetchWithAuthRetry("/api/v2/community/feed?section=recommended&limit=100&offset=0"),
        fetchWithAuthRetry(section === "following"
          ? "/api/v2/community/follows?limit=200"
          : "/api/v2/community/bookmarks?limit=200"),
      ]);
      const feedJson = (await feedResponse.json().catch(() => ({}))) as FeedResponse;
      const relationJson = (await relationResponse.json().catch(() => ({}))) as {
        success?: boolean;
        items?: FollowItem[] | BookmarkItem[];
        error?: string;
      };
      if (!feedResponse.ok || !feedJson.success || !relationResponse.ok || !relationJson.success) {
        throw new Error(relationJson.error || (isZh ? "个人内容加载失败。" : "Personal feed failed to load."));
      }
      if (currentRequestId !== requestIdRef.current) return;

      const publicItems = feedJson.items ?? [];
      const personalItems = section === "following"
        ? filterFollowedItems(publicItems, relationJson.items as FollowItem[] | undefined)
        : filterSavedItems(publicItems, relationJson.items as BookmarkItem[] | undefined);
      setItems(personalItems);
      setNextCursor(null);
      setHasMore(false);
    } catch (cause) {
      if (currentRequestId !== requestIdRef.current) return;
      setError(cause instanceof Error ? cause.message : isZh ? "个人内容加载失败。" : "Personal feed failed to load.");
      setItems([]);
      setHasMore(false);
    } finally {
      if (currentRequestId === requestIdRef.current) setLoading(false);
    }
  }, [isZh, viewerId]);

  useEffect(() => {
    if (!viewerReady || (activeSection !== "following" && activeSection !== "saved")) return;
    void loadPersonalSection(activeSection);
  }, [activeSection, loadPersonalSection, viewerReady]);

  function changeSection(section: CommunitySectionId) {
    setActiveSection(section);
    setQuery("");
    setNextCursor(null);
    if (section === "following" || section === "saved") {
      setItems([]);
      setHasMore(false);
      return;
    }
    void loadRemoteSection(section, false, "");
  }

  function retryCurrentSection() {
    if (activeSection === "following" || activeSection === "saved") {
      void loadPersonalSection(activeSection);
    } else {
      void loadRemoteSection(activeSection, false, query);
    }
  }

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      [item.title, item.summary, item.sourceType, item.sourceVersion ?? ""]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [items, query]);

  const universeItems = useMemo(
    () => items.filter((item) => item.contentKind === "universe").slice(0, 3),
    [items],
  );

  const currentLabel = getCommunitySectionLabel(activeSection, locale);
  const personalNeedsLogin = (activeSection === "following" || activeSection === "saved") && viewerReady && !viewerId;

  return (
    <main className={`cosmic-page ${styles.feedShell}`}>
      <header className={styles.feedHeader}>
        <div className={styles.headerCopy}>
          <p className={styles.feedKicker}>KIIKIS 2.0 · CREATOR NETWORK</p>
          <h1 className={styles.feedTitle}>{isZh ? "让创作继续生长" : "Keep the creation moving"}</h1>
          <p className={styles.feedSubtitle}>
            {isZh
              ? "发现真实作品、Universe 与可复用资产，带着灵感回到你的工作台。"
              : "Discover real works, Universes, and reusable assets—then take the idea back to your workbench."}
          </p>
        </div>
        <div className={styles.headerSignal} aria-label={isZh ? "社区实时状态" : "Community status"}>
          <span className={styles.signalDot} aria-hidden="true" />
          <span>{isZh ? "公开创作流" : "Public creation stream"}</span>
          <strong>{items.length.toString().padStart(2, "0")}</strong>
        </div>
      </header>

      <div className={styles.communityLayout}>
        <CommunityNavigation activeSection={activeSection} locale={locale} onChange={changeSection} />

        <section className={styles.feedColumn} aria-label={currentLabel}>
          <CommunityFilters
            locale={locale}
            section={activeSection}
            query={query}
            onQueryChange={setQuery}
            onQuerySubmit={() => {
              if (REMOTE_SECTIONS.has(activeSection)) void loadRemoteSection(activeSection, false, query);
            }}
          />

          {error ? (
            <CommunityEmptyState
              title={isZh ? "社区暂时没有回应" : "The community is quiet right now"}
              body={`${error}${isZh ? " 可以重试，或稍后再来。" : " Retry now, or come back in a moment."}`}
              actionLabel={isZh ? "重试" : "Retry"}
              onAction={retryCurrentSection}
              error
            />
          ) : personalNeedsLogin ? (
            <CommunityEmptyState
              title={isZh ? "登录后查看你的内容" : "Sign in to see your space"}
              body={isZh ? "关注和收藏会在这里汇总，方便你继续创作。" : "Your follows and saves will collect here for the next creative move."}
              actionLabel={isZh ? "去登录" : "Sign in"}
              onAction={() => window.location.assign("/login")}
            />
          ) : loading && items.length === 0 ? (
            <div className={styles.cardSkeletonGrid} aria-busy="true" aria-label={isZh ? "正在加载社区内容" : "Loading community"}>
              {Array.from({ length: 4 }, (_, index) => <div key={index} className={styles.cardSkeleton} />)}
            </div>
          ) : visibleItems.length === 0 ? (
            <CommunityEmptyState
              title={query ? (isZh ? "没有找到匹配内容" : "No matching creations") : activeSection === "saved" ? (isZh ? "还没有收藏" : "Nothing saved yet") : activeSection === "following" ? (isZh ? "还没有关注更新" : "No updates from follows yet") : (isZh ? "这里还没有公开内容" : "No public creations here yet")}
              body={query ? (isZh ? "换个关键词，或者浏览其他内容分区。" : "Try another keyword or explore a different section.") : (isZh ? "从一个 Universe 开始，作品会在这里留下可继续的线索。" : "Start with a Universe. Every work can leave a trail back here.")}
              actionLabel={query ? (isZh ? "清除搜索" : "Clear search") : undefined}
              onAction={query ? () => setQuery("") : undefined}
            />
          ) : (
            <>
              <div className={styles.feedGrid}>
                {visibleItems.map((publication) => (
                  <PublicationCard key={publication.id} publication={publication} viewerId={viewerId} />
                ))}
              </div>
              {hasMore ? (
                <button type="button" className={styles.loadMoreBtn} onClick={() => void loadRemoteSection(activeSection, true)} disabled={loading}>
                  {loading ? (isZh ? "加载中…" : "Loading…") : isZh ? "继续探索" : "Load more"}
                </button>
              ) : null}
            </>
          )}
        </section>

        <aside className={styles.sideRail} aria-label={isZh ? "Universe 动态" : "Universe context"}>
          <section className={styles.pulsePanel}>
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.panelKicker}>{isZh ? "Universe 动态" : "Universe pulse"}</span>
                <h2>{isZh ? "从一个世界开始" : "Start with a world"}</h2>
              </div>
              <Layers3 size={18} strokeWidth={1.5} aria-hidden="true" />
            </div>
            {universeItems.length > 0 ? (
              <div className={styles.pulseList}>
                {universeItems.map((item, index) => (
                  <a className={styles.pulseItem} href={`/community/${encodeURIComponent(item.id)}`} key={item.id}>
                    <span className={styles.pulseIndex}>0{index + 1}</span>
                    <span className={styles.pulseTitle}>{item.title}</span>
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </a>
                ))}
              </div>
            ) : (
              <p className={styles.pulseEmpty}>{isZh ? "新的 Universe 会在这里留下第一束光。" : "New Universes will leave the first signal here."}</p>
            )}
          </section>

          <section className={styles.nextMovePanel}>
            <Sparkles size={17} aria-hidden="true" />
            <div>
              <span className={styles.panelKicker}>{isZh ? "下一步" : "Next move"}</span>
              <p>{isZh ? "找到一个让你想继续做下去的世界，然后打开它。" : "Find a world you want to keep building, then open it."}</p>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function filterFollowedItems(items: CommunityFeedProjection[], follows: FollowItem[] | undefined) {
  const relations = follows ?? [];
  return items.filter((item) => relations.some((relation) =>
    (relation.targetType === "publication" && relation.targetId === item.id) ||
    (relation.targetType === "universe" && relation.targetId === item.sourceId && item.sourceType === "universe") ||
    (relation.targetType === "user" && relation.targetId === item.publisherId),
  ));
}

function filterSavedItems(items: CommunityFeedProjection[], bookmarks: BookmarkItem[] | undefined) {
  const ids = new Set((bookmarks ?? []).map((item) => item.publicationId).filter(Boolean));
  return items.filter((item) => ids.has(item.id));
}

export default DiscoveryFeed;
