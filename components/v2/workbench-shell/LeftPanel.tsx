"use client";

import { memo } from "react";
import {
  CheckCircle2,
  Circle,
  Lock,
  PlayCircle,
  FolderTree,
  Layers,
  type LucideIcon,
} from "lucide-react";
import type { StepStatus, WorkbenchAsset, WorkbenchStep } from "@/lib/client/v2/workbench/types";
import {
  canNavigateToStep,
  getNavigationDenialReason,
} from "@/lib/client/v2/workbench/step-machine";
import styles from "./workbench-shell.module.css";

export interface LeftPanelProps {
  steps: WorkbenchStep[];
  currentStep: string;
  assets: WorkbenchAsset[];
  locale: string;
  onStepChange: (stepId: string) => void;
}

const STEP_ICON: Record<StepStatus, LucideIcon> = {
  completed: CheckCircle2,
  current: PlayCircle,
  locked: Lock,
  available: Circle,
};

const STEP_ICON_COLOR: Record<StepStatus, string> = {
  completed: "#7dd181",
  current: "#6de7df",
  locked: "rgba(255,255,255,0.3)",
  available: "rgba(255,255,255,0.5)",
};

function LeftPanelComponent({ steps, currentStep, assets, locale, onStepChange }: LeftPanelProps) {
  const isZh = locale === "zh-CN";

  const handleStepClick = (stepId: string) => {
    if (!canNavigateToStep(steps, stepId)) {
      // 锁定步骤给出提示（实际项目可走 toast）
      const reason = getNavigationDenialReason(steps, stepId, locale);
      if (reason) console.info(reason);
      return;
    }
    onStepChange(stepId);
  };

  return (
    <aside className={styles.leftPanel}>
      {/* 步骤导航 */}
      <section className={styles.panelSection}>
        <h2 className={styles.panelTitle}>
          <FolderTree size={12} />
          {isZh ? "生产步骤" : "Steps"}
        </h2>
        <ul className={styles.stepList}>
          {steps.map((step) => {
            const Icon = STEP_ICON[step.status];
            const isCurrent = step.id === currentStep || step.status === "current";
            const isLocked = step.status === "locked";
            const itemClass = [
              styles.stepItem,
              isCurrent ? styles.stepItemCurrent : "",
              isLocked ? styles.stepItemLocked : "",
            ].filter(Boolean).join(" ");
            return (
              <li key={step.id}>
                <button
                  type="button"
                  className={itemClass}
                  onClick={() => handleStepClick(step.id)}
                  disabled={isLocked}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <Icon size={14} className={styles.stepIcon} style={{ color: STEP_ICON_COLOR[step.status] }} />
                  <span className={styles.stepLabel}>{step.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 资产与版本 */}
      <section className={styles.panelSection}>
        <h2 className={styles.panelTitle}>
          <Layers size={12} />
          {isZh ? "资产与版本" : "Assets"}
        </h2>
        {assets.length === 0 ? (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            {isZh ? "暂无资产" : "No assets yet"}
          </div>
        ) : (
          <ul className={styles.assetList}>
            {assets.map((asset) => (
              <li key={asset.id} className={styles.assetItem}>
                {asset.locked && <Lock size={11} style={{ color: "rgba(255,255,255,0.4)" }} />}
                <span className={styles.assetName}>{asset.name}</span>
                <span className={styles.assetMeta}>v{asset.version}</span>
                <span className={styles.assetMeta} style={{ color: asset.status === "ready" ? "#7dd181" : asset.status === "published" ? "#6de7df" : "rgba(255,255,255,0.5)" }}>
                  {asset.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

export const LeftPanel = memo(LeftPanelComponent);
