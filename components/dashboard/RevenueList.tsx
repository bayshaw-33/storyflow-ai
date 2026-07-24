"use client";

import { useI18n } from "@/lib/i18n/useI18n";
import type { RevenueItem } from "@/components/marketplace/types";
import styles from "./dashboard.module.css";

type RevenueListProps = {
  items: RevenueItem[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
};

/**
 * 收益明细列表：每条显示类型(sale/refund) + 金额 + 状态徽标(pending/settled/withdrawn)
 * + 演员 + 时间 + 结算周期。
 */
export function RevenueList({ items, loading, hasMore, onLoadMore }: RevenueListProps) {
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
        <strong>{isZh ? "还没有收益记录" : "No revenue records yet"}</strong>
        <p>
          {isZh
            ? "你的演员销售收益会记录在这里，按月结算后可提现。"
            : "Sales revenue for your actors will be tracked here, settled monthly before withdrawal."}
        </p>
      </div>
    );
  }

  function typeLabel(type: RevenueItem["type"]): string {
    if (isZh) {
      switch (type) {
        case "sale": return "销售";
        case "refund": return "退款";
        case "settlement": return "结算";
        case "withdrawal": return "提现";
      }
    }
    switch (type) {
      case "sale": return "Sale";
      case "refund": return "Refund";
      case "settlement": return "Settlement";
      case "withdrawal": return "Withdrawal";
    }
  }

  function typeCls(type: RevenueItem["type"]): string {
    switch (type) {
      case "sale": return styles.typeSale;
      case "refund": return styles.typeRefund;
      case "settlement": return styles.typeSettlement;
      case "withdrawal": return styles.typeWithdrawal;
    }
  }

  function statusLabel(status: RevenueItem["status"]): string {
    if (isZh) {
      switch (status) {
        case "pending": return "待结算";
        case "settled": return "已结算";
        case "withdrawn": return "已提现";
      }
    }
    switch (status) {
      case "pending": return "Pending";
      case "settled": return "Settled";
      case "withdrawn": return "Withdrawn";
    }
  }

  function statusCls(status: RevenueItem["status"]): string {
    switch (status) {
      case "pending": return styles.statusPending;
      case "settled": return styles.statusSettled;
      case "withdrawn": return styles.statusWithdrawn;
    }
  }

  return (
    <div>
      <ul className={styles.list}>
        {items.map((item) => {
          const createdDate = item.created_at
            ? new Date(item.created_at).toLocaleDateString(isZh ? "zh-CN" : "en-US")
            : "—";
          const isNegative = item.type === "refund" || item.type === "withdrawal";
          return (
            <li key={item.id} className={styles.listRow}>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>
                  <span className={`${styles.typeBadge} ${typeCls(item.type)}`}>
                    {typeLabel(item.type)}
                  </span>
                  <span style={{ marginLeft: 8 }}>{item.actor_name || (isZh ? "未命名演员" : "Untitled actor")}</span>
                </p>
                <span className={styles.rowSub}>
                  <span className={`${styles.statusBadge} ${statusCls(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                  {item.settlement_period ? (
                    <span>
                      {isZh ? "结算周期" : "Period"}: {item.settlement_period}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className={styles.rowValue}>
                <span
                  className={`${styles.rowValueAmount} ${
                    isNegative ? styles.rowValueAmountMuted : styles.rowValueAmountSuccess
                  }`}
                >
                  {isNegative ? "-" : "+"}{item.amount_kk} KK
                </span>
                {item.fee_kk > 0 ? (
                  <span className={styles.rowValueLabel}>
                    {isZh ? `抽成 ${item.fee_kk} KK` : `Fee ${item.fee_kk} KK`}
                  </span>
                ) : null}
              </div>
              <span className={styles.rowTime}>{createdDate}</span>
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
