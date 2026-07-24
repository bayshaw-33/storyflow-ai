"use client";

import { useState } from "react";
import { Wallet, TrendingUp, Clock, CheckCircle2, ArrowDownToLine } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import type { SalesSummary } from "@/components/marketplace/types";
import styles from "./dashboard.module.css";

type SalesOverviewProps = {
  summary: SalesSummary;
};

/**
 * 收益总览卡：5 个数字卡片网格（总收益 / 待结算 / 可提现 / 已提现 / 本月）。
 * "可提现"卡片加"提现"按钮，点击提示"提现功能即将开放"。
 */
export function SalesOverview({ summary }: SalesOverviewProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [withdrawNotice, setWithdrawNotice] = useState(false);

  const cards: Array<{
    key: string;
    label: string;
    value: number;
    hint?: string;
    icon: typeof TrendingUp;
    valueCls?: string;
    highlight?: boolean;
    action?: { label: string; onClick: () => void };
  }> = [
    {
      key: "total",
      label: isZh ? "总收益" : "Total revenue",
      value: summary.total_revenue_kk,
      hint: isZh
        ? `${summary.total_sales_count} 笔订单`
        : `${summary.total_sales_count} orders`,
      icon: TrendingUp,
      valueCls: styles.overviewValueAccent,
    },
    {
      key: "pending",
      label: isZh ? "待结算" : "Pending",
      value: summary.pending_revenue_kk,
      hint: isZh ? "每月 1 号月结" : "Settled on the 1st",
      icon: Clock,
    },
    {
      key: "available",
      label: isZh ? "可提现" : "Available",
      value: summary.available_for_withdrawal_kk,
      hint: isZh ? "已结算，可申请提现" : "Settled, ready to withdraw",
      icon: Wallet,
      valueCls: styles.overviewValueSuccess,
      highlight: true,
      action: {
        label: isZh ? "提现" : "Withdraw",
        onClick: () => {
          setWithdrawNotice(true);
          setTimeout(() => setWithdrawNotice(false), 3000);
        },
      },
    },
    {
      key: "withdrawn",
      label: isZh ? "已提现" : "Withdrawn",
      value: summary.withdrawn_revenue_kk,
      icon: ArrowDownToLine,
      valueCls: styles.overviewValueMuted,
    },
    {
      key: "month",
      label: isZh ? "本月" : "This month",
      value: summary.this_month_revenue_kk,
      hint: isZh
        ? `${summary.this_month_sales_count} 笔订单`
        : `${summary.this_month_sales_count} orders`,
      icon: CheckCircle2,
    },
  ];

  return (
    <div className={styles.overview}>
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className={`${styles.overviewCard} ${card.highlight ? styles.overviewCardHighlight : ""}`}
          >
            <span className={styles.overviewLabel}>
              <Icon size={12} style={{ verticalAlign: "-1px", marginRight: 4 }} />
              {card.label}
            </span>
            <span className={`${styles.overviewValue} ${card.valueCls ?? ""}`}>
              {card.value} KK
            </span>
            {card.hint ? <span className={styles.overviewHint}>{card.hint}</span> : null}
            {card.action ? (
              <button
                type="button"
                className={styles.overviewAction}
                onClick={card.action.onClick}
              >
                {card.action.label}
              </button>
            ) : null}
            {card.key === "available" && withdrawNotice ? (
              <span className={styles.overviewHint} style={{ color: "var(--warning)" }}>
                {isZh ? "提现功能即将开放" : "Withdrawal coming soon"}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
