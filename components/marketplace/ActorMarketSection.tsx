"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Store, TriangleAlert } from "lucide-react";
import { ActorMarketCard } from "@/components/marketplace/ActorMarketCard";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "@/components/actors/actors.module.css";
import marketStyles from "./marketplace.module.css";
import type { MarketActorCard } from "./types";

type SortKey = "latest" | "popular";
type PriceFilter = "all" | "free" | "paid";

type Props = {
  /** 当前访客的 access_token；未登录传 null，市场区块仍可浏览（公开端点）。 */
  viewerToken?: string | null;
};

/**
 * 演员市场区块（在 /actors 列表页下半部分使用）
 *
 * - 标题 + 副标题
 * - 筛选条：免费 / 付费 / 最新 / 热门
 * - ActorMarketCard 网格（4 列）
 * - 加载更多按钮
 *
 * Phase 0 Task 0.5：数据源改为 GET /api/actors/platform（真实端点）。
 * 旧 /api/actors/market 端点不存在，会被 [actorId] 动态路由误命中（actorId=market）。
 * platform 端点返回 {actors, total}（page/pageSize 分页），此处做响应映射。
 */
export function ActorMarketSection({ viewerToken }: Props) {
  const { locale, t } = useI18n();
  const isZh = locale === "zh-CN";

  const [items, setItems] = useState<MarketActorCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("latest");

  const PAGE_SIZE = 12;

  const fetchPage = useCallback(
    async (nextCursor: string | null) => {
      setLoading(true);
      setError("");
      try {
        // Phase 0 Task 0.5：使用真实 /api/actors/platform 端点（page/pageSize 分页）。
        // cursor 存储下一页页码（字符串）；首页为 null → page=1。
        const page = nextCursor ? Number(nextCursor) : 1;
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        if (sortKey === "popular") params.set("sort", "popular");
        const headers: Record<string, string> = {};
        if (viewerToken) headers.Authorization = `Bearer ${viewerToken}`;
        const response = await fetch(`/api/actors/platform?${params.toString()}`, { headers });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error || (isZh ? "市场加载失败" : "Failed to load marketplace"));
        }
        // 映射 platform 响应 → MarketActorCard 列表
        const platformActors: Array<{
          actor: { id: string; name: string; bio?: string | null; avatar_url?: string | null };
          creator_display_name: string | null;
          usage_count: number;
        }> = json.actors || [];
        const mapped: MarketActorCard[] = platformActors.map((entry) => ({
          id: entry.actor.id,
          name: entry.actor.name,
          tagline: entry.actor.bio ?? null,
          primary_asset_url: entry.actor.avatar_url ?? null,
          // platform 共享演员目前免费使用，无上架价格
          listing_price_kk: null,
          owner: {
            user_id: "",
            username: null,
            display_name: entry.creator_display_name,
            avatar_url: null,
          },
        }));
        const total: number = json.total ?? mapped.length;
        const nextPage = page * PAGE_SIZE < total ? String(page + 1) : null;
        return { items: mapped, nextCursor: nextPage, hasMore: nextPage !== null };
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : isZh ? "市场加载失败" : "Failed to load marketplace");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [sortKey, viewerToken, isZh],
  );

  // 首屏 + 切筛选时重新拉取
  useEffect(() => {
    let active = true;
    void (async () => {
      const json = await fetchPage(null);
      if (!active || !json) return;
      setItems(json.items || []);
      setCursor(json.nextCursor || null);
      setHasMore(Boolean(json.hasMore));
    })();
    return () => {
      active = false;
    };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || !cursor) return;
    const json = await fetchPage(cursor);
    if (!json) return;
    setItems((current) => [...current, ...(json.items || [])]);
    setCursor(json.nextCursor || null);
    setHasMore(Boolean(json.hasMore));
  }, [hasMore, loading, cursor, fetchPage]);

  const showEmpty = !loading && !error && items.length === 0;
  const showInitial = loading && items.length === 0;

  return (
    <section className={marketStyles.section} aria-label={t("marketplace.title")}>
      <header className={marketStyles.sectionHeader}>
        <div className={marketStyles.sectionTitles}>
          <p className={styles.kicker}>{isZh ? "KIikis Market" : "KIikis Market"}</p>
          <h2 className={marketStyles.sectionTitle}>{t("marketplace.title")}</h2>
          <p className={marketStyles.sectionSubtitle}>{t("marketplace.subtitle")}</p>
        </div>
        <span className={marketStyles.sectionSpacer} />
        <Store size={18} aria-hidden="true" />
      </header>

      <div className={marketStyles.filterBar} role="group" aria-label="marketplace filter">
        <div className={marketStyles.filterGroup}>
          {(["all", "free", "paid"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={priceFilter === value ? `${styles.chipBtn} ${styles.chipBtnActive}` : styles.chipBtn}
              aria-pressed={priceFilter === value}
              onClick={() => setPriceFilter(value)}
            >
              {value === "all"
                ? isZh ? "全部" : "All"
                : value === "free"
                  ? t("marketplace.filter.free")
                  : t("marketplace.filter.paid")}
            </button>
          ))}
        </div>
        <div className={marketStyles.filterGroup}>
          {(["latest", "popular"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={sortKey === value ? `${styles.chipBtn} ${styles.chipBtnActive}` : styles.chipBtn}
              aria-pressed={sortKey === value}
              onClick={() => setSortKey(value)}
            >
              {value === "latest" ? t("marketplace.filter.latest") : t("marketplace.filter.popular")}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className={styles.noticeBar} role="alert">
          <TriangleAlert size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          {error}
        </div>
      ) : null}

      {showInitial ? (
        <ul className={styles.grid} aria-busy="true">
          {Array.from({ length: 8 }, (_, index) => (
            <li key={index}>
              <div className={styles.skeletonCard} />
            </li>
          ))}
        </ul>
      ) : showEmpty ? (
        <div className={marketStyles.emptyPanel}>
          <p>{isZh ? "暂无演员上架" : "No actors listed yet"}</p>
        </div>
      ) : (
        <ul className={styles.grid}>
          {items.map((item) => (
            <ActorMarketCard key={item.id} actor={item} />
          ))}
        </ul>
      )}

      {hasMore ? (
        <div className={marketStyles.loadMoreRow}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void loadMore()}
            disabled={loading}
          >
            {loading ? <LoaderCircle size={14} className={styles.spin} /> : null}
            {isZh ? "加载更多" : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
