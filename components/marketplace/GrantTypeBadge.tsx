"use client";

import { useI18n } from "@/lib/i18n/useI18n";
import type { GrantType } from "./types";
import styles from "./marketplace.module.css";

type GrantTypeBadgeProps = {
  grantType: GrantType;
  /** 项目专属授权时显示的项目标题。 */
  projectTitle?: string | null;
  className?: string;
};

/**
 * 授权范围徽标。
 * - free: "免费"
 * - global: "通用授权"
 * - project: "项目: {projectTitle}"
 */
export function GrantTypeBadge({ grantType, projectTitle, className }: GrantTypeBadgeProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  let label: string;
  let stateCls: string;

  if (grantType === "free") {
    label = isZh ? "免费" : "Free";
    stateCls = styles.grantFree;
  } else if (grantType === "global") {
    label = isZh ? "通用授权" : "Global license";
    stateCls = styles.grantGlobal;
  } else {
    const title = projectTitle?.trim() || (isZh ? "未命名项目" : "Untitled project");
    label = isZh ? `项目: ${title}` : `Project: ${title}`;
    stateCls = styles.grantProject;
  }

  const cls = [styles.grantBadge, stateCls, className ?? ""].filter(Boolean).join(" ");
  return <span className={cls}>{label}</span>;
}
