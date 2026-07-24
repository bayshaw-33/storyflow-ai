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
 * 数据源：GET /api/actors/market（公开端点）
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

  const fetchPage = useCallback(
    async (nextCursor: string | null) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ limit: "12" });
        if (priceFilter !== "all") params.set("price", priceFilter);
        params.set("sort", sortKey);
        if (nextCursor) params.set("cursor", nextCursor);
        const headers: Record<string, string> = {};
        if (viewerToken) headers.Authorization = `Bearer ${viewerToken}`;
        const response = await fetch(`/api/actors/market?${params.toString()}`, { headers });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error || (isZh ? "市场加载失败" : "Failed to load marketplace"));
        }
        return json;
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : isZh ? "市场加载失败" : "Failed to load marketplace");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [priceFilter, sortKey, viewerToken, isZh],
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
