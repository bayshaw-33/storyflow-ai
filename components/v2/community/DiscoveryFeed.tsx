"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import type { PublicationProjection } from "@/lib/contracts/v2/community";
import { useI18n } from "@/lib/i18n/useI18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PublicationCard } from "./PublicationCard";
import styles from "@/app/community/community.module.css";

interface DiscoveryFeedProps {
  initialItems: PublicationProjection[];
  loadError: string | null;
}

interface FeedResponse {
  success?: boolean;
  items?: PublicationProjection[];
  error?: string;
  correlationId?: string;
}

/**
 * 发现页 Feed (Phase 5, CM-002)
 *
 * - CM-002: 只查询 public publication 投影，不查私有资源表
 * - 服务端预取首屏 (initialItems)，客户端懒加载更多
 * - 匿名可浏览；认证用户可互动 (CM-009)
 */
export function DiscoveryFeed({ initialItems, loadError }: DiscoveryFeedProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [items, setItems] = useState<PublicationProjection[]>(initialItems);
  const [error, setError] = useState<string | null>(loadError);
  const [loading, setLoading] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(initialItems.length >= 20);
  const offsetRef = useRef(initialItems.length);

  async function reloadFeed() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/community/discover?limit=20&offset=0", {
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as FeedResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error || (isZh ? "加载失败" : "Failed to load"));
      }
      const next = json.items ?? [];
      setItems(next);
      offsetRef.current = next.length;
      setHasMore(next.length >= 20);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  // 加载当前 viewer (匿名则 null)
  // P0-01 修复：原实现裸 fetch /api/v2/kk（无 Bearer，Bearer-only 鉴权下恒失败），
  // 改为直接读浏览器 supabase session —— 与其他页面同一认证事实源。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = getSupabaseBrowserClient();
        if (!client) return;
        const { data } = await client.auth.getSession();
        const userId = data.session?.user?.id;
        if (!cancelled && userId) {
          setViewerId(userId);
        }
      } catch {
        // 匿名访问
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      const offset = offsetRef.current;
      const res = await fetch(`/api/v2/community/discover?limit=20&offset=${offset}`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as FeedResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error || (isZh ? "加载失败" : "Failed to load"));
      }
      const next = json.items ?? [];
      setItems((prev) => [...prev, ...next]);
      offsetRef.current = offset + next.length;
      setHasMore(next.length >= 20);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={`cosmic-page ${styles.feedShell}`}>
      <header className={styles.feedHeader}>
        <h1 className={styles.feedTitle}>
          {isZh ? "IP 资产社区" : "IP Asset Community"}
        </h1>
        <p className={styles.feedSubtitle}>
          {isZh
            ? "发现公开的宇宙、角色和资产。关注、点赞、收藏你喜欢的作品。"
            : "Discover public universes, characters, and assets. Follow, like, and bookmark."}
        </p>
      </header>

      {error ? (
        <div className={styles.feedError} role="alert">
          {error}
          <button
            type="button"
            className={styles.loadMoreBtn}
            onClick={() => void reloadFeed()}
            disabled={loading}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {loading ? isZh ? "重新加载中…" : "Reloading…" : isZh ? "重新加载" : "Reload"}
          </button>
        </div>
      ) : null}

      {items.length === 0 && !error ? (
        <div className={styles.feedEmpty}>
          <Sparkles size={20} style={{ marginBottom: 8, opacity: 0.5 }} />
          {isZh ? "暂无公开的 publication。" : "No public publications yet."}
        </div>
      ) : (
        <div className={styles.feedGrid}>
          {items.map((p) => (
            <PublicationCard key={p.id} publication={p} viewerId={viewerId} />
          ))}
        </div>
      )}

      {hasMore && items.length > 0 ? (
        <button
          type="button"
          className={styles.loadMoreBtn}
          onClick={loadMore}
          disabled={loading}
        >
          {loading
            ? isZh ? "加载中…" : "Loading…"
            : isZh ? "加载更多" : "Load more"}
        </button>
      ) : null}
    </main>
  );
}

export default DiscoveryFeed;
