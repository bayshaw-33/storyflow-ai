"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { TabDef, TabKey } from "./types";
import styles from "./profile.module.css";

type ProfileTabsProps = {
  tabs: TabDef[];
  activeTab: TabKey;
  onTabChange: (key: TabKey) => void;
};

/**
 * 主页 Tab 切换容器。
 * 用 URL query param ?tab=xxx 作为单一数据源：点击时更新 URL，
 * 父组件从 useSearchParams 读出 activeTab 传入即可保持同步。
 */
export function ProfileTabs({ tabs, activeTab, onTabChange }: ProfileTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSelect = useCallback(
    (key: TabKey) => {
      onTabChange(key);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", key);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [onTabChange, router, searchParams],
  );

  return (
    <nav className={styles.tabs} role="tablist" aria-label="Profile sections">
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
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
            {typeof tab.count === "number" ? (
              <span className={styles.tabCount}>{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
