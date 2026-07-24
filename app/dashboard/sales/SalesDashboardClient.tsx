"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { SalesOverview } from "@/components/dashboard/SalesOverview";
import { SalesTabs } from "@/components/dashboard/SalesTabs";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "./sales.module.css";
import type {
  SellerOrderItem,
  RevenueLedgerItem,
  SellerListingItem,
} from "@/lib/supabase/marketplace-queries";
import type { SalesSummary } from "@/components/marketplace/types";
import { ZERO_SUMMARY } from "@/lib/marketplace/revenue-stats";

export type InitialSalesPayload = {
  summary: SalesSummary | null;
  initialTab: "orders" | "revenue" | "listings";
  ordersInitial: {
    items: SellerOrderItem[];
    nextCursor: string | null;
    hasMore: boolean;
  };
};

type Props = {
  initial: InitialSalesPayload;
};

type Tab = "orders" | "revenue" | "listings";

/**
 * 创作者销售面板客户端组件：
 * - SalesOverview 卡（总收益/待结算/可提现/已提现/本月）
 * - SalesTabs：3 个 Tab（订单 / 收益明细 / 我的上架）
 * - 各 Tab 客户端分页加载：调用 /api/dashboard/sales/{orders,revenue,listings}
 */
export function SalesDashboardClient({ initial }: Props) {
  const { locale, t } = useI18n();
  const isZh = locale === "zh-CN";

  const [activeTab, setActiveTab] = useState<Tab>(initial.initialTab);

  const [orders, setOrders] = useState<SellerOrderItem[]>(initial.ordersInitial.items);
  const [ordersCursor, setOrdersCursor] = useState<string | null>(initial.ordersInitial.nextCursor);
  const [ordersHasMore, setOrdersHasMore] = useState<boolean>(initial.ordersInitial.hasMore);

  const [revenue, setRevenue] = useState<RevenueLedgerItem[]>([]);
  const [revenueCursor, setRevenueCursor] = useState<string | null>(null);
  const [revenueHasMore, setRevenueHasMore] = useState<boolean>(false);
  const [revenueLoaded, setRevenueLoaded] = useState<boolean>(false);

  const [listings, setListings] = useState<SellerListingItem[]>([]);
  const [listingsCursor, setListingsCursor] = useState<string | null>(null);
  const [listingsHasMore, setListingsHasMore] = useState<boolean>(false);
  const [listingsLoaded, setListingsLoaded] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchTab = useCallback(
    async (tab: Tab, cursor: string | null) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ limit: "12" });
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(`/api/dashboard/sales/${tab}?${params.toString()}`, {
          credentials: "include",
        });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error || (isZh ? "加载失败" : "Failed to load"));
        }
        return json;
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : isZh ? "加载失败" : "Failed to load");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [isZh],
  );

  // 切 Tab：revenue / listings 首次进入时按需加载
  useEffect(() => {
    if (activeTab === "revenue" && !revenueLoaded) {
      void (async () => {
        const json = await fetchTab("revenue", null);
        if (json) {
          setRevenue(json.items || []);
          setRevenueCursor(json.nextCursor || null);
          setRevenueHasMore(Boolean(json.hasMore));
          setRevenueLoaded(true);
        }
      })();
    } else if (activeTab === "listings" && !listingsLoaded) {
      void (async () => {
        const json = await fetchTab("listings", null);
        if (json) {
          setListings(json.items || []);
          setListingsCursor(json.nextCursor || null);
          setListingsHasMore(Boolean(json.hasMore));
          setListingsLoaded(true);
        }
      })();
    }
  }, [activeTab, revenueLoaded, listingsLoaded, fetchTab]);

  const loadMore = useCallback(async () => {
    if (loading) return;
    if (activeTab === "orders" && ordersHasMore && ordersCursor) {
      const json = await fetchTab("orders", ordersCursor);
      if (json) {
        setOrders((current) => [...current, ...(json.items || [])]);
        setOrdersCursor(json.nextCursor || null);
        setOrdersHasMore(Boolean(json.hasMore));
      }
    } else if (activeTab === "revenue" && revenueHasMore && revenueCursor) {
      const json = await fetchTab("revenue", revenueCursor);
      if (json) {
        setRevenue((current) => [...current, ...(json.items || [])]);
        setRevenueCursor(json.nextCursor || null);
        setRevenueHasMore(Boolean(json.hasMore));
      }
    } else if (activeTab === "listings" && listingsHasMore && listingsCursor) {
      const json = await fetchTab("listings", listingsCursor);
      if (json) {
        setListings((current) => [...current, ...(json.items || [])]);
        setListingsCursor(json.nextCursor || null);
        setListingsHasMore(Boolean(json.hasMore));
      }
    }
  }, [
    activeTab,
    loading,
    ordersCursor,
    ordersHasMore,
    revenueCursor,
    revenueHasMore,
    listingsCursor,
    listingsHasMore,
    fetchTab,
  ]);

  const hasMore =
    activeTab === "orders"
      ? ordersHasMore
      : activeTab === "revenue"
        ? revenueHasMore
        : listingsHasMore;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.topbarBrand} href="/">
          <KiikisLogo compact />
        </Link>
        <div className={styles.topbarTitles}>
          <p className={styles.kicker}>{isZh ? "KIikis Sales" : "KIikis Sales"}</p>
          <h1 className={styles.title}>{t("sales.title")}</h1>
          <p className={styles.subtitle}>
            {isZh ? "管理你的演员销售订单与收益" : "Manage your actor sales and revenue"}
          </p>
        </div>
        <span className={styles.topbarSpacer} />
        <Link className={styles.backLink} href="/dashboard">
          <ArrowLeft size={14} />
          {isZh ? "返回工作台" : "Back to dashboard"}
        </Link>
      </header>

      {error ? <div className={styles.noticeBar} role="alert">{error}</div> : null}

      <section className={styles.overviewWrap}>
        <SalesOverview summary={initial.summary ?? ZERO_SUMMARY} />
      </section>

      <section className={styles.tabsWrap}>
        <SalesTabs activeTab={activeTab}>{null}</SalesTabs>
        {hasMore ? (
          <div className={styles.loadMoreRow}>
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

      {loading ? (
        <span style={{ position: "fixed", right: 20, bottom: 20, color: "#8f999b" }} aria-hidden="true">
          <LoaderCircle className={styles.spin} size={16} />
        </span>
      ) : null}
    </main>
  );
}
