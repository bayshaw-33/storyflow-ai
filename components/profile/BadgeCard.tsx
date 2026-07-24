"use client";

import { Lock, Trophy } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import type { Badge } from "./types";
import styles from "./profile.module.css";

type BadgeCardProps = {
  badge: Badge;
};

/**
 * 单个徽章卡：圆形图标 + 名称 + 授予日期。
 * locked=true 时显示灰色锁定态（未获得）。
 */
export function BadgeCard({ badge }: BadgeCardProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const locked = badge.locked === true;
  const name = isZh ? badge.name_zh : badge.name_en;
  const description = isZh ? badge.description_zh : badge.description_en;
  const dateLabel = badge.awarded_at
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(badge.awarded_at))
    : null;

  return (
    <div className={`${styles.badgeCard}${locked ? ` ${styles.badgeLocked}` : ""}`}>
      <div className={styles.badgeIcon}>
        {locked ? <Lock size={18} /> : <Trophy size={18} />}
      </div>
      <div className={styles.badgeName}>{name}</div>
      {description ? <p className={styles.badgeDesc}>{description}</p> : null}
      <div className={styles.badgeDate}>
        {locked ? (isZh ? "未获得" : "Locked") : dateLabel ?? (isZh ? "未获得" : "Locked")}
      </div>
    </div>
  );
}
