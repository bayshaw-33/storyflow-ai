"use client";

import { memo, type ReactNode } from "react";
import { Lock, PlayCircle, CheckCircle2, type LucideIcon } from "lucide-react";
import type { ShortDramaStageStatus } from "@/lib/client/v2/short-drama/types";
import styles from "../short-drama-flow.module.css";

export interface StageHeaderProps {
  title: string;
  status: ShortDramaStageStatus;
  locale: string;
  children?: ReactNode;
}

const STATUS_ICON: Record<ShortDramaStageStatus, LucideIcon | null> = {
  current: PlayCircle,
  completed: CheckCircle2,
  locked: Lock,
  available: PlayCircle,
};

const STATUS_CLASS: Record<ShortDramaStageStatus, string> = {
  current: styles.stageStatusCurrent,
  completed: styles.stageStatusCompleted,
  locked: styles.stageStatusLocked,
  available: styles.stageStatusCurrent,
};

function StageHeaderComponent({ title, status, locale, children }: StageHeaderProps) {
  const isZh = locale === "zh-CN";
  const statusLabel = isZh
    ? status === "current"
      ? "进行中"
      : status === "completed"
        ? "已完成"
        : status === "locked"
          ? "未解锁"
          : "可进入"
    : status;
  const Icon = STATUS_ICON[status];
  return (
    <header className={styles.stageHeader}>
      <h2 className={styles.stageTitle}>
        {Icon && <Icon size={16} style={{ color: status === "locked" ? "rgba(255,255,255,0.4)" : "#6de7df" }} />}
        {title}
      </h2>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {children}
        <span className={`${styles.stageStatusBadge} ${STATUS_CLASS[status]}`}>{statusLabel}</span>
      </div>
    </header>
  );
}

export const StageHeader = memo(StageHeaderComponent);
