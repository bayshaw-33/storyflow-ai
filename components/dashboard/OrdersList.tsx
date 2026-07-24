"use client";

import { useI18n } from "@/lib/i18n/useI18n";
import type { Order } from "@/components/marketplace/types";
import { GrantTypeBadge } from "@/components/marketplace/GrantTypeBadge";
import styles from "./dashboard.module.css";

type OrdersListProps = {
  orders: Order[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
};

/**
 * 订单列表：每条显示演员名（缩略图+名）+ 买家名 + 价格 + 收益 + 时间 + 授权范围徽标。
 */
export function OrdersList({ orders, loading, hasMore, onLoadMore }: OrdersListProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  if (loading && orders.length === 0) {
    return (
      <div className={styles.loadingState}>
        <span className={styles.spinner} />
        {isZh ? "加载中…" : "Loading…"}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className={styles.emptyState}>
        <strong>{isZh ? "还没有订单" : "No orders yet"}</strong>
        <p>
          {isZh
            ? "当其他用户购买你的演员时，订单会显示在这里。"
            : "Orders will appear here when other users purchase your actors."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <ul className={styles.list}>
        {orders.map((order) => {
          const initials = (order.actor_name?.trim()?.slice(0, 2) || "·").toUpperCase();
          const buyerName = order.buyer_name?.trim() || (isZh ? "匿名买家" : "Anonymous buyer");
          const paidDate = order.paid_at
            ? new Date(order.paid_at).toLocaleDateString(isZh ? "zh-CN" : "en-US")
            : "—";
          return (
            <li key={order.id} className={styles.listRow}>
              <div className={styles.actorThumb}>
                {order.actor_thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={order.actor_thumbnail} alt={order.actor_name} loading="lazy" />
                ) : (
                  <span className={styles.actorThumbFallback}>{initials}</span>
                )}
              </div>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>{order.actor_name || (isZh ? "未命名演员" : "Untitled actor")}</p>
                <span className={styles.rowSub}>
                  <span>{isZh ? "买家" : "Buyer"}: {buyerName}</span>
                  <GrantTypeBadge
                    grantType={order.grant_type}
                    projectTitle={order.project_title ?? null}
                  />
                </span>
              </div>
              <div className={styles.rowValue}>
                <span className={styles.rowValueAmount}>{order.price_kk} KK</span>
                <span className={styles.rowValueLabel}>
                  {isZh ? "成交价" : "Price"}
                </span>
              </div>
              <div className={styles.rowValue}>
                <span className={`${styles.rowValueAmount} ${styles.rowValueAmountSuccess}`}>
                  +{order.seller_revenue_kk} KK
                </span>
                <span className={styles.rowValueLabel}>
                  {isZh ? "你的收益" : "Revenue"}
                </span>
              </div>
              <span className={styles.rowTime}>{paidDate}</span>
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
