"use client";

import type { ReactNode } from "react";
import {
  Check,
  CircleAlert,
  ExternalLink,
  FileClock,
  FileText,
  Link2,
  MoreHorizontal,
  Palette,
  PanelsTopLeft,
  Plus,
  ShieldCheck,
  Video,
  type LucideIcon,
} from "lucide-react";

import {
  UNIFIED_PRODUCTION_STAGES,
  type UnifiedProductionStage,
  type UnifiedWorkbenchContextV1,
} from "@/lib/contracts/v2/unified-workbench";
import styles from "./ProductionWorkbench.module.css";

export interface UnifiedProductionHeaderProps {
  context: UnifiedWorkbenchContextV1;
  activeStage: UnifiedProductionStage;
  saveStatus: "saved" | "saving" | "unsaved";
  primaryActions?: ReactNode;
  onStageChange: (stage: UnifiedProductionStage) => void;
  onCreateUniverse?: () => void;
  onBindUniverse?: () => void;
  onOpenUniverse?: () => void;
  onVersionClick?: () => void;
  onEvidenceClick?: () => void;
  onMoreClick?: () => void;
}

const STAGE_META: Record<UnifiedProductionStage, { label: string; icon: LucideIcon }> = {
  script: { label: "剧本", icon: FileText },
  art: { label: "美术", icon: Palette },
  storyboard: { label: "分镜", icon: PanelsTopLeft },
  video: { label: "视频", icon: Video },
};

function SaveStatus({ status }: { status: UnifiedProductionHeaderProps["saveStatus"] }) {
  if (status === "saving") return <span className={styles.saveStatus}>保存中…</span>;
  if (status === "unsaved") {
    return <span className={`${styles.saveStatus} ${styles.saveStatusUnsaved}`}>未保存</span>;
  }
  return <span className={styles.saveStatus}><Check size={13} aria-hidden="true" /> 已保存</span>;
}

export function UnifiedProductionHeader({
  context,
  activeStage,
  saveStatus,
  primaryActions,
  onStageChange,
  onCreateUniverse,
  onBindUniverse,
  onOpenUniverse,
  onVersionClick,
  onEvidenceClick,
  onMoreClick,
}: UnifiedProductionHeaderProps) {
  const universe = context.universe;
  const activeTabId = `production-stage-${activeStage}`;

  return (
    <header className={styles.unifiedHeader}>
      <div className={styles.unifiedTitleBlock}>
        <h1>{context.project.title || "未命名项目"}</h1>
        <div className={styles.unifiedContextLine}>
          {universe ? (
            <button type="button" className={styles.universeBadge} onClick={onOpenUniverse}>
              <ShieldCheck size={13} aria-hidden="true" />
              <span>{universe.name}</span>
              {universe.hasUpdate ? <CircleAlert size={13} aria-label="Universe 有更新" /> : null}
              {onOpenUniverse ? <ExternalLink size={12} aria-hidden="true" /> : null}
            </button>
          ) : (
            <span className={styles.universeActions} aria-label="Universe 未绑定">
              <button type="button" className={styles.universeCreateButton} onClick={onCreateUniverse} disabled={!onCreateUniverse}>
                <Plus size={12} aria-hidden="true" /> 创建 Universe
              </button>
              <button type="button" className={styles.universeBindButton} onClick={onBindUniverse} disabled={!onBindUniverse}>
                <Link2 size={12} aria-hidden="true" /> 绑定已有
              </button>
            </span>
          )}
          <SaveStatus status={saveStatus} />
        </div>
      </div>

      <div className={styles.unifiedHeaderActions}>
        <div className={styles.compactStageTabs} role="tablist" aria-label="制作阶段">
          {UNIFIED_PRODUCTION_STAGES.map((stage) => {
            const meta = STAGE_META[stage];
            const StageIcon = meta.icon;
            return (
              <button
                key={stage}
                id={`production-tab-${stage}`}
                type="button"
                role="tab"
                aria-label={meta.label}
                title={meta.label}
                aria-selected={activeStage === stage}
                aria-controls={activeTabId}
                className={`${styles.stageIconButton} ${activeStage === stage ? styles.stageIconButtonActive : ""}`}
                onClick={() => onStageChange(stage)}
              >
                <StageIcon size={15} aria-hidden="true" />
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>

        <span className={styles.headerDivider} aria-hidden="true" />
        {primaryActions}
        <button type="button" className={styles.headerActionButton} onClick={onVersionClick} aria-label="Version">
          <FileClock size={15} aria-hidden="true" /><span>版本</span>
        </button>
        <button type="button" className={styles.headerActionButton} onClick={onEvidenceClick} aria-label="Evidence">
          <ShieldCheck size={15} aria-hidden="true" /><span>证据</span>
        </button>
        <button type="button" className={styles.headerIconButton} onClick={onMoreClick} aria-label="More" title="更多">
          <MoreHorizontal size={17} aria-hidden="true" />
        </button>
      </div>

      <div
        id={activeTabId}
        role="tabpanel"
        aria-labelledby={`production-tab-${activeStage}`}
        className={styles.unifiedStagePanelMarker}
      >
        当前阶段：{STAGE_META[activeStage].label}
      </div>
    </header>
  );
}
