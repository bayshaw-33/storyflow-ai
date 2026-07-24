"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "./settings.module.css";

export type SettingsTab = "profile" | "api" | "subscription";

type SettingsTabsProps = {
  activeTab: SettingsTab;
  children: React.ReactNode;
};

/**
 * /settings 多 Tab 容器：Profile / API / Subscription。
 * 用 Link 切换（/settings/profile, /settings/api, /settings/subscription）。
 */
export function SettingsTabs({ activeTab, children }: SettingsTabsProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const tabs: Array<{ key: SettingsTab; label: string; href: string }> = [
    { key: "profile", label: isZh ? "个人资料" : "Profile", href: "/settings/profile" },
    { key: "api", label: isZh ? "API" : "API", href: "/settings/api" },
    { key: "subscription", label: isZh ? "套餐" : "Subscription", href: "/settings/subscription" },
  ];

  return (
    <div>
      <nav className={styles.tabs} aria-label="Settings sections">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={`${styles.tabLink}${tab.key === activeTab ? ` ${styles.tabActive}` : ""}`}
            aria-current={tab.key === activeTab ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className={styles.tabBody}>{children}</div>
    </div>
  );
}
