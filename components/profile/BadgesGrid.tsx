"use client";

import { useI18n } from "@/lib/i18n/useI18n";
import { BadgeCard } from "./BadgeCard";
import type { Badge } from "./types";
import styles from "./profile.module.css";

type BadgesGridProps = {
  badges: Badge[];
};

/**
 * 徽章网格：6 列（auto-fill minmax 150px）。
 * 已授予徽章按 awarded_at 排序在前；未授予（locked）徽章灰色锁定态在后。
 */
export function BadgesGrid({ badges }: BadgesGridProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  if (badges.length === 0) {
    return (
      <div className={styles.emptyState}>
        <strong>{isZh ? "暂无成就" : "No achievements yet"}</strong>
        <p>{isZh ? "完成创作里程碑后会在这里点亮徽章。" : "Complete milestones to unlock badges here."}</p>
      </div>
    );
  }

  const ordered = [...badges].sort((a, b) => {
    // 已获得在前，未获得在后；同组内按 sort_order
    const aLocked = a.locked === true ? 1 : 0;
    const bLocked = b.locked === true ? 1 : 0;
    if (aLocked !== bLocked) return aLocked - bLocked;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  return (
    <div className={`${styles.grid} ${styles.badgesGrid}`}>
      {ordered.map((badge) => (
        <BadgeCard key={badge.id} badge={badge} />
      ))}
    </div>
  );
}
