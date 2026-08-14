"use client";

// Phase 2 Task 2.5 — Universe 常驻状态组件。
//
// 在所有工作台 TopBar 中复用同一组件，显示 Work 与 Universe 的继承关系。
// - standalone Work（未绑定）：显示"创建 Universe / 绑定已有 Universe"两个入口。
// - bound Work：显示 Universe 名称、真实版本号（vN）、关系、stale 标记，
//   以及"打开 / 查看继承 / 同步"三个动作。
//
// 设计约束（PRD Task 2.5 Step 2）：
//   - 不自动弹窗、不自动创建空 Universe。
//   - 七类 Work 都复用同一组件。
//   - stale 状态由服务端 Manifest vs 最新 Universe Version 决定，非前端臆造。

import { memo } from "react";
import {
  Globe,
  CloudOff,
  GitBranch,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Plus,
  Link2,
  type LucideIcon,
} from "lucide-react";
import type { UniverseBinding } from "@/lib/client/v2/workbench/types";
import { V22_WORK_RELATIONS } from "@/lib/client/v2/universe/types";
import styles from "./workbench-shell.module.css";

export interface UniverseStatusProps {
  binding: UniverseBinding;
  locale: string;
  // standalone 时的两个入口回调。
  onCreateUniverse?: () => void;
  onBindExisting?: () => void;
  // bound 时的三个动作回调。
  onOpenUniverse?: () => void;
  onViewInheritance?: () => void;
  onSync?: () => void;
}

// 关系标签中英映射。
const RELATION_LABELS: Record<string, { zh: string; en: string }> = {
  canon_continuation: { zh: "正史续作", en: "Canon continuation" },
  prequel: { zh: "前传", en: "Prequel" },
  sequel: { zh: "续作", en: "Sequel" },
  spinoff: { zh: "衍生", en: "Spinoff" },
  adaptation: { zh: "改编", en: "Adaptation" },
  parallel: { zh: "平行", en: "Parallel" },
};

function UniverseStatusComponent({
  binding,
  locale,
  onCreateUniverse,
  onBindExisting,
  onOpenUniverse,
  onViewInheritance,
  onSync,
}: UniverseStatusProps) {
  const isZh = locale === "zh-CN";

  // standalone Work：未绑定，显示创建 / 绑定入口。
  if (!binding.bound) {
    return (
      <span className={styles.universeStatusGroup} data-bound="false">
        <button
          type="button"
          className={`${styles.badge} ${styles.badgeAccent} ${styles.universeAction}`}
          onClick={onCreateUniverse}
          disabled={!onCreateUniverse}
          aria-label={isZh ? "创建 Universe" : "Create universe"}
        >
          <Plus size={11} />
          {isZh ? "创建 Universe" : "Create universe"}
        </button>
        <button
          type="button"
          className={`${styles.badge} ${styles.badgeWarn} ${styles.universeAction}`}
          onClick={onBindExisting}
          disabled={!onBindExisting}
          aria-label={isZh ? "绑定已有 Universe" : "Bind existing universe"}
        >
          <Link2 size={11} />
          {isZh ? "绑定已有" : "Bind existing"}
        </button>
      </span>
    );
  }

  // bound Work：显示名称 + 版本 + 关系 + stale + 动作。
  const relationLabel = binding.relation
    ? (isZh ? RELATION_LABELS[binding.relation]?.zh : RELATION_LABELS[binding.relation]?.en) ?? binding.relation
    : "";
  const isStale = Boolean(binding.isStale);
  const versionText = binding.boundVersionNo
    ? `v${binding.boundVersionNo}`
    : "";
  const staleHint = isStale && binding.latestVersionNo
    ? (isZh ? `v${binding.latestVersionNo} 可用` : `v${binding.latestVersionNo} available`)
    : "";

  return (
    <span className={styles.universeStatusGroup} data-bound="true" data-stale={isStale}>
      <span
        className={`${styles.badge} ${styles.badgeAccent}`}
        title={binding.universeName ?? ""}
      >
        <Globe size={11} />
        {binding.universeName ?? (isZh ? "已绑定" : "Bound")}
      </span>
      {versionText && (
        <span className={`${styles.badge} ${styles.universeVersionBadge}`}>
          {versionText}
        </span>
      )}
      {relationLabel && (
        <span className={`${styles.badge} ${styles.universeRelationBadge}`}>
          <GitBranch size={10} />
          {relationLabel}
        </span>
      )}
      {isStale && (
        <span
          className={`${styles.badge} ${styles.badgeWarn}`}
          title={staleHint}
        >
          <AlertTriangle size={11} />
          {isZh ? "有更新" : "Stale"}
        </span>
      )}
      {/* 动作按钮 */}
      {onOpenUniverse && (
        <button
          type="button"
          className={`${styles.iconButton} ${styles.universeAction}`}
          onClick={onOpenUniverse}
          aria-label={isZh ? "打开 Universe" : "Open universe"}
          title={isZh ? "打开 Universe" : "Open universe"}
        >
          <ExternalLink size={13} />
        </button>
      )}
      {onViewInheritance && (
        <button
          type="button"
          className={`${styles.iconButton} ${styles.universeAction}`}
          onClick={onViewInheritance}
          aria-label={isZh ? "查看继承" : "View inheritance"}
          title={isZh ? "查看继承" : "View inheritance"}
        >
          <GitBranch size={13} />
        </button>
      )}
      {onSync && (
        <button
          type="button"
          className={`${styles.iconButton} ${styles.universeAction}`}
          onClick={onSync}
          disabled={!isStale}
          aria-label={isZh ? "同步" : "Sync"}
          title={isZh ? "同步到最新版本" : "Sync to latest"}
        >
          <RefreshCw size={13} className={isStale ? "tc-spin-pending" : undefined} />
        </button>
      )}
    </span>
  );
}

// 导出关系枚举供测试与 Dialog 复用。
export { V22_WORK_RELATIONS };

export const UniverseStatus = memo(UniverseStatusComponent);
