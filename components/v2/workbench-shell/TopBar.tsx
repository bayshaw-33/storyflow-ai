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
  type LucideIcon,
} from "lucide-react";
import type { SaveStatus, UniverseBinding, WorkbenchProject } from "@/lib/client/v2/workbench/types";
import { getSaveStatusLabel } from "@/lib/client/v2/workbench/unsaved-guard";
import { UniverseStatus } from "./UniverseStatus";
import styles from "./workbench-shell.module.css";

export interface TopBarProps {
  project: WorkbenchProject;
  universeBinding: UniverseBinding;
  saveStatus: SaveStatus;
  locale: string;
  onOpenLeftPanel?: () => void;
  onOpenRightPanel?: () => void;
  // Phase 2 Task 2.5: Universe 常驻动作回调。
  onCreateUniverse?: () => void;
  onBindExisting?: () => void;
  onOpenUniverse?: () => void;
  onViewInheritance?: () => void;
  onSyncUniverse?: () => void;
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
  onCreateUniverse,
  onBindExisting,
  onOpenUniverse,
  onViewInheritance,
  onSyncUniverse,
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
        {/* Phase 2 Task 2.5: Universe 常驻状态（七类 Work 复用同一组件） */}
        <UniverseStatus
          binding={universeBinding}
          locale={locale}
          onCreateUniverse={onCreateUniverse}
          onBindExisting={onBindExisting}
          onOpenUniverse={onOpenUniverse}
          onViewInheritance={onViewInheritance}
          onSync={onSyncUniverse}
        />
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
