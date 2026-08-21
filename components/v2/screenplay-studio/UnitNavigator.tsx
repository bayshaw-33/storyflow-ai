"use client";

/**
 * 左栏工作流导航树。
 * 三部曲按“用户确认可用版本”推进；已存在节点始终可以打开并返回修改。
 * 雷同审查作为剧情及大纲的子步骤出现，不独立制造新的创作入口。
 */

import { useMemo } from "react";
import type { ScreenplayUnitClientDto } from "@/lib/client/v2/screenplay-studio/api";
import {
  SCREENPLAY_STUDIO_NAV_GROUPS,
  NAV_GROUP_OF_TYPE,
  canCreateUnit,
  isUsableCheckpoint,
} from "@/lib/client/v2/screenplay-studio/types";
import styles from "./ScreenplayStudio.module.css";

const READINESS_DOT_CLASS: Record<string, string> = {
  empty: styles.empty,
  draft: styles.draft,
  checkpoint: styles.checkpoint,
  finalized: styles.finalized,
};

export interface UnitNavigatorProps {
  units: ScreenplayUnitClientDto[];
  activeUnitId: string | null;
  staleDownstreamUnitIds: Set<string>;
  onOpenUnit: (unitId: string) => void;
  onCreateUnit: (type: "world" | "character" | "outline" | "episode" | "scene", parentId: string | null) => void;
  onOpenSimilarity?: () => void;
  similarityReviewed?: boolean;
  similarityActive?: boolean;
  similarityReady?: boolean;
  similarityReason?: string;
}

export function UnitNavigator({
  units,
  activeUnitId,
  staleDownstreamUnitIds,
  onOpenUnit,
  onCreateUnit,
  onOpenSimilarity,
  similarityReviewed = false,
  similarityActive = false,
  similarityReady = false,
  similarityReason = "请先确认剧情及大纲可用版本",
}: UnitNavigatorProps) {
  const grouped = useMemo(() => {
    const byGroup = new Map<string, ScreenplayUnitClientDto[]>();
    for (const group of SCREENPLAY_STUDIO_NAV_GROUPS) byGroup.set(group.id, []);
    for (const unit of units) {
      const groupId = NAV_GROUP_OF_TYPE[unit.type];
      byGroup.get(groupId)?.push(unit);
    }
    for (const [, list] of byGroup) list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    return byGroup;
  }, [units]);

  return (
    <nav aria-label="剧本结构导航" className={styles.tabBody}>
      {SCREENPLAY_STUDIO_NAV_GROUPS.map((group) => {
        const list = grouped.get(group.id) ?? [];
        const type = group.types[0];
        const usable = list.some((unit) => isUsableCheckpoint(unit));
        const status = usable ? "已确认可用" : list.length ? "创作中" : "未开始";
        const canCreate = canCreateUnit(type, units);
        return (
          <div key={group.id} className={styles.navGroup} data-group={group.id}>
            <div className={styles.navGroupTitle}>
              <span>
                <span className={styles.stageIndex}>{SCREENPLAY_STUDIO_NAV_GROUPS.indexOf(group) + 1}</span>
                {group.label}
              </span>
              <button
                type="button"
                className={styles.navGroupAdd}
                aria-label={`新建${group.label}`}
                onClick={() => onCreateUnit(group.id, null)}
                disabled={!canCreate}
                title={canCreate ? `新建${group.label}` : "请先确认上一阶段可用"}
              >
                ＋
              </button>
            </div>
            <div className={`${styles.stageStatus} ${usable ? styles.stageStatusReady : ""}`}>
              {status}
            </div>
            {list.length === 0 ? (
              <div className={styles.placeholder}>
                {canCreate ? "还没有内容，点 ＋ 开始" : "完成上一阶段并确认可用后继续"}
              </div>
            ) : (
              list.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  className={`${styles.navItem} ${unit.id === activeUnitId ? styles.active : ""}`}
                  onClick={() => onOpenUnit(unit.id)}
                  aria-current={unit.id === activeUnitId ? "true" : undefined}
                >
                  <span
                    className={`${styles.readinessDot} ${READINESS_DOT_CLASS[unit.readiness] ?? styles.empty}`}
                    aria-label={unit.readiness}
                  />
                  <span className={styles.navItemTitle}>{unit.title || "(未命名)"}</span>
                  {staleDownstreamUnitIds.has(unit.id) ? (
                    <span className={styles.staleBadge}>stale</span>
                  ) : null}
                </button>
              ))
            )}
            {group.id === "outline" ? (
              <button
                type="button"
                className={`${styles.subStageItem} ${similarityActive ? styles.subStageActive : ""} ${similarityReviewed ? styles.subStageReady : ""}`}
                onClick={() => onOpenSimilarity?.()}
                disabled={!similarityReady}
                aria-current={similarityActive ? "step" : undefined}
                title={similarityReady ? "打开雷同审查" : similarityReason}
              >
                <span className={styles.subStageMark}>{similarityReviewed ? "✓" : "◇"}</span>
                <span>雷同审查</span>
                <span className={styles.subStageHint}>{similarityReviewed ? "已查验" : similarityReady ? "可查验" : "待大纲确认"}</span>
              </button>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
