"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useI18n } from "@/lib/i18n/useI18n";
import type { SalesTab } from "@/components/marketplace/types";
import styles from "./dashboard.module.css";

type SalesTabsProps = {
  activeTab: SalesTab;
  /** 各 Tab 的计数（可选，显示在 Tab 名右侧）。 */
  counts?: Partial<Record<SalesTab, number>>;
  children: React.ReactNode;
};

/**
 * 销售 Tab 容器：订单 / 收益明细 / 我的上架。
 * 用 URL query param `?tab=xxx` 作为单一数据源同步（与 ProfileTabs 一致）。
 */
export function SalesTabs({ activeTab, counts, children }: SalesTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const tabs: Array<{ key: SalesTab; label: string }> = [
    { key: "orders", label: isZh ? "订单" : "Orders" },
    { key: "revenue", label: isZh ? "收益明细" : "Revenue" },
    { key: "listings", label: isZh ? "我的上架" : "Listings" },
  ];

  const handleSelect = useCallback(
    (key: SalesTab) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", key);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <div>
      <nav className={styles.tabs} role="tablist" aria-label={isZh ? "销售面板分区" : "Sales sections"}>
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          const count = counts?.[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tabButton}${isActive ? ` ${styles.tabActive}` : ""}`}
              onClick={() => handleSelect(tab.key)}
            >
              <span>{tab.label}</span>
              {typeof count === "number" ? (
                <span className={styles.tabCount}>{count}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
      <div className={styles.tabBody}>{children}</div>
    </div>
  );
}
