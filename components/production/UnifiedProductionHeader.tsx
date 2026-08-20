"use client";

import { Check, CircleAlert, FileClock, MoreHorizontal, ShieldCheck } from "lucide-react";

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
  onStageChange: (stage: UnifiedProductionStage) => void;
  onVersionClick?: () => void;
  onEvidenceClick?: () => void;
  onMoreClick?: () => void;
}

const STAGE_LABELS: Record<UnifiedProductionStage, string> = {
  script: "剧本",
  art: "美术",
  storyboard: "分镜",
  video: "视频",
};

function SaveStatus({ status }: { status: UnifiedProductionHeaderProps["saveStatus"] }) {
  if (status === "saving") {
    return <span className={styles.saveStatus}>保存中…</span>;
  }
  if (status === "unsaved") {
    return <span className={`${styles.saveStatus} ${styles.saveStatusUnsaved}`}>未保存</span>;
  }
  return (
    <span className={styles.saveStatus}>
      <Check size={13} aria-hidden="true" /> 已保存
    </span>
  );
}

export function UnifiedProductionHeader({
  context,
  activeStage,
  saveStatus,
  onStageChange,
  onVersionClick,
  onEvidenceClick,
  onMoreClick,
}: UnifiedProductionHeaderProps) {
  const universe = context.universe;
  const activeTabId = `production-stage-${activeStage}`;

  return (
    <header className={styles.unifiedHeader}>
      <div className={styles.unifiedTitleBlock}>
        <p className={styles.eyebrow}>KIIKIS Production Workbench</p>
        <h1>{context.project.title || "未命名项目"}</h1>
        <div className={styles.unifiedContextLine}>
          {universe ? (
            <span className={styles.universeBadge}>
              <ShieldCheck size={13} aria-hidden="true" />
              {universe.name} {universe.versionId ? "· 已绑定版本" : "· 已绑定"}
              {universe.hasUpdate ? <CircleAlert size={13} aria-label="Universe 有更新" /> : null}
            </span>
          ) : (
            <span className={styles.universeBadgeMuted}>未绑定 Universe</span>
          )}
          <SaveStatus status={saveStatus} />
        </div>
      </div>

      <div className={styles.unifiedHeaderActions}>
        <button type="button" className={styles.headerActionButton} onClick={onVersionClick} aria-label="Version">
          <FileClock size={15} aria-hidden="true" /> 版本
        </button>
        <button type="button" className={styles.headerActionButton} onClick={onEvidenceClick} aria-label="Evidence">
          <ShieldCheck size={15} aria-hidden="true" /> 证据
        </button>
        <button type="button" className={styles.headerActionButton} onClick={onMoreClick} aria-label="More">
          <MoreHorizontal size={16} aria-hidden="true" /> 更多
        </button>
      </div>

      <div className={styles.unifiedStageTabs} role="tablist" aria-label="Production stages">
        {UNIFIED_PRODUCTION_STAGES.map((stage) => {
          const tabId = `production-tab-${stage}`;
          return (
            <button
              key={stage}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={activeStage === stage}
              aria-controls={activeTabId}
              className={`${styles.unifiedStageTab} ${activeStage === stage ? styles.unifiedStageTabActive : ""}`}
              onClick={() => onStageChange(stage)}
            >
              {STAGE_LABELS[stage]}
            </button>
          );
        })}
      </div>

      <div
        id={activeTabId}
        role="tabpanel"
        aria-labelledby={`production-tab-${activeStage}`}
        className={styles.unifiedStagePanelMarker}
      >
        当前阶段：{STAGE_LABELS[activeStage]}
      </div>
    </header>
  );
}
