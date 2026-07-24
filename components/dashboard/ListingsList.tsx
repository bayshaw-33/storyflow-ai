"use client";

import { Pencil } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import type { ListingItem } from "@/components/marketplace/types";
import styles from "./dashboard.module.css";

type ListingsListProps = {
  items: ListingItem[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onEditListing?: (actorId: string) => void;
};

/**
 * 我的上架列表：每条显示演员名 + 状态徽标(listed/delisted/removed) + 价格 + 销量 + 总收益 + 编辑按钮。
 */
export function ListingsList({ items, loading, hasMore, onLoadMore, onEditListing }: ListingsListProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  if (loading && items.length === 0) {
    return (
      <div className={styles.loadingState}>
        <span className={styles.spinner} />
        {isZh ? "加载中…" : "Loading…"}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.emptyState}>
        <strong>{isZh ? "还没有上架演员" : "No listed actors yet"}</strong>
        <p>
          {isZh
            ? "在你的演员详情页设置价格并上架，让其他创作者购买使用。"
            : "Set a price and list your actors from their detail page so other creators can purchase them."}
        </p>
      </div>
    );
  }

  function statusLabel(status: ListingItem["listing_status"]): string {
    if (isZh) {
      switch (status) {
        case "listed": return "已上架";
        case "delisted": return "已下架";
        case "removed": return "平台下架";
        case "unlisted": return "未上架";
      }
    }
    switch (status) {
      case "listed": return "Listed";
      case "delisted": return "Delisted";
      case "removed": return "Removed";
      case "unlisted": return "Unlisted";
    }
  }

  function statusCls(status: ListingItem["listing_status"]): string {
    switch (status) {
      case "listed": return styles.statusListed;
      case "delisted": return styles.statusDelisted;
      case "removed": return styles.statusRemoved;
      case "unlisted": return styles.statusUnlisted;
    }
  }

  return (
    <div>
      <ul className={styles.list}>
        {items.map((item) => {
          const initials = (item.actor_name?.trim()?.slice(0, 2) || "·").toUpperCase();
          const isFree = item.listing_price_kk === null || item.listing_price_kk === 0;
          return (
            <li key={item.actor_id} className={styles.listRow}>
              <div className={styles.actorThumb}>
                {item.actor_thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.actor_thumbnail} alt={item.actor_name} loading="lazy" />
                ) : (
                  <span className={styles.actorThumbFallback}>{initials}</span>
                )}
              </div>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>
                  {item.actor_name || (isZh ? "未命名演员" : "Untitled actor")}
                </p>
                <span className={styles.rowSub}>
                  <span className={`${styles.statusBadge} ${statusCls(item.listing_status)}`}>
                    {statusLabel(item.listing_status)}
                  </span>
                  <span>
                    {isFree
                      ? isZh ? "免费" : "Free"
                      : `${item.listing_price_kk} KK`}
                  </span>
                </span>
              </div>
              <div className={styles.rowValue}>
                <span className={styles.rowValueAmount}>{item.sales_count}</span>
                <span className={styles.rowValueLabel}>{isZh ? "销量" : "Sales"}</span>
              </div>
              <div className={styles.rowValue}>
                <span className={`${styles.rowValueAmount} ${styles.rowValueAmountSuccess}`}>
                  {item.total_revenue_kk} KK
                </span>
                <span className={styles.rowValueLabel}>{isZh ? "总收益" : "Revenue"}</span>
              </div>
              {onEditListing ? (
                <button
                  type="button"
                  className={styles.rowEditBtn}
                  onClick={() => onEditListing(item.actor_id)}
                >
                  <Pencil size={12} />
                  {isZh ? "编辑" : "Edit"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {hasMore ? (
        <div className={styles.loadMoreRow}>
          <button
            type="button"
            className={styles.loadMoreButton}
            onClick={onLoadMore}
            disabled={loading}
          >
            {loading ? (isZh ? "加载中…" : "Loading…") : (isZh ? "加载更多" : "Load more")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
