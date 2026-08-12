"use client";

import { memo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  Check,
  CloudOff,
  Loader2,
  ListTodo,
  Globe,
  type LucideIcon,
} from "lucide-react";
import type { SaveStatus, UniverseBinding, WorkbenchProject } from "@/lib/client/v2/workbench/types";
import { getSaveStatusLabel } from "@/lib/client/v2/workbench/unsaved-guard";
import styles from "./workbench-shell.module.css";

export interface TopBarProps {
  project: WorkbenchProject;
  universeBinding: UniverseBinding;
  saveStatus: SaveStatus;
  locale: string;
  onOpenLeftPanel?: () => void;
  onOpenRightPanel?: () => void;
}

const SAVE_ICON: Record<SaveStatus, LucideIcon> = {
  saved: Check,
  saving: Loader2,
  unsaved: CloudOff,
};

const SAVE_BADGE_CLASS: Record<SaveStatus, string> = {
  saved: styles.badgeOk,
  saving: styles.badgeAccent,
  unsaved: styles.badgeWarn,
};

function TopBarComponent({
  project,
  universeBinding,
  saveStatus,
  locale,
  onOpenLeftPanel,
  onOpenRightPanel,
}: TopBarProps) {
  const isZh = locale === "zh-CN";
  const SaveIcon = SAVE_ICON[saveStatus];
  const saveBadgeClass = SAVE_BADGE_CLASS[saveStatus];
  const stageLabel = isZh ? "阶段" : "Stage";

  return (
    <header className={styles.topBar}>
      <div className={styles.topBarLeft}>
        {/* 移动端打开左侧栏 */}
        {onOpenLeftPanel && (
          <button type="button" className={styles.iconButton} aria-label={isZh ? "步骤" : "Steps"} onClick={onOpenLeftPanel}>
            <ListTodo size={16} />
          </button>
        )}
        <h1 className={styles.projectTitle} title={project.title}>{project.title}</h1>
        {/* Universe 绑定状态 */}
        {universeBinding.bound ? (
          <span className={`${styles.badge} ${styles.badgeAccent}`} title={universeBinding.universeName}>
            <Globe size={11} />
            {universeBinding.universeName ?? (isZh ? "已绑定" : "Bound")}
          </span>
        ) : (
          <span className={`${styles.badge} ${styles.badgeWarn}`}>
            <CloudOff size={11} />
            {universeBinding.suggestion === "bind_new"
              ? isZh ? "建议绑定新 Universe" : "Bind new universe"
              : universeBinding.suggestion === "bind_existing"
                ? isZh ? "建议绑定 Universe" : "Bind universe"
                : isZh ? "未绑定" : "Unbound"}
          </span>
        )}
        {/* 保存状态 */}
        <span className={`${styles.badge} ${saveBadgeClass}`}>
          <SaveIcon size={11} className={saveStatus === "saving" ? "tc-spin" : undefined} />
          {getSaveStatusLabel(saveStatus, locale)}
        </span>
        {/* 当前阶段 */}
        <span className={styles.stageBadge}>
          <Boxes size={12} />
          {stageLabel}: {project.currentStage}
        </span>
      </div>
      <div className={styles.topBarRight}>
        {/* 移动端打开右侧栏 */}
        {onOpenRightPanel && (
          <button type="button" className={styles.iconButton} aria-label={isZh ? "AI 面板" : "AI panel"} onClick={onOpenRightPanel}>
            <AlertTriangle size={16} />
          </button>
        )}
        <Link href="/job-center" className={styles.taskButton}>
          <ListTodo size={14} />
          {isZh ? "任务中心" : "Tasks"}
        </Link>
      </div>
    </header>
  );
}

export const TopBar = memo(TopBarComponent);
