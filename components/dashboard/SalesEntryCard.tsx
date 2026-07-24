"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, LoaderCircle, TrendingUp } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";

type SalesSummary = {
  total_revenue_kk?: number;
  this_month_revenue_kk?: number;
  this_month_sales_count?: number;
  total_sales_count?: number;
  pending_revenue_kk?: number;
  settled_revenue_kk?: number;
  withdrawn_revenue_kk?: number;
  available_for_withdrawal_kk?: number;
};

type Props = {
  /** 当前访客的 access_token；未登录时本组件不渲染。 */
  accessToken?: string | null;
};

/**
 * Dashboard 销售面板入口卡片：
 * - 销售总览摘要（总收益 + 本月订单数）
 * - "进入销售面板"按钮 → /dashboard/sales
 * - 用客户端组件加载 /api/dashboard/sales/summary
 * - 失败 / 未登录时显示精简版入口（仅按钮）
 */
export function SalesEntryCard({ accessToken }: Props) {
  const { t } = useI18n();
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    setLoading(true);
    setFailed(false);
    void (async () => {
      try {
        const response = await fetch("/api/dashboard/sales/summary", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await response.json();
        if (!active) return;
        if (!response.ok || !json.success) {
          setFailed(true);
          return;
        }
        setSummary(json.summary || null);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [accessToken]);

  if (!accessToken) return null;

  const totalRevenue = Number(summary?.total_revenue_kk || 0);
  const thisMonthSales = Number(summary?.this_month_sales_count || 0);

  return (
    <section className="dashboard-sales-entry" aria-label={t("sales.title")}>
      <div className="dashboard-sales-entry-card">
        <div className="dashboard-sales-entry-head">
          <span className="dashboard-sales-entry-kicker">
            <TrendingUp size={14} aria-hidden="true" />
            {t("sales.title")}
          </span>
          {loading ? (
            <LoaderCircle size={14} className="dashboard-sales-entry-spin" aria-hidden="true" />
          ) : null}
        </div>

        {failed ? (
          <p className="dashboard-sales-entry-hint">
            {/* 失败时显示精简版入口，避免阻塞 dashboard */}
          </p>
        ) : (
          <div className="dashboard-sales-entry-stats">
            <div className="dashboard-sales-entry-stat">
              <span className="dashboard-sales-entry-stat-label">{t("sales.totalRevenue")}</span>
              <strong className="dashboard-sales-entry-stat-value">
                {totalRevenue.toLocaleString()} KK
              </strong>
            </div>
            <div className="dashboard-sales-entry-stat">
              <span className="dashboard-sales-entry-stat-label">{t("sales.thisMonthSales")}</span>
              <strong className="dashboard-sales-entry-stat-value">{thisMonthSales}</strong>
            </div>
          </div>
        )}

        <Link className="primary-button dashboard-sales-entry-cta" href="/dashboard/sales">
          {t("sales.enterPanel")}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
