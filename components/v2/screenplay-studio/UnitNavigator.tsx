"use client";

/**
 * 左栏导航树 — Phase 3 Task 3.3.
 * 世界观/角色/大纲/分集/正文（场）分组树。任一节点可打开（自由导航，
 * 不检查上游 finalized）；空组显示“新建”入口而不是禁用。
 */

import { useMemo } from "react";
import type { ScreenplayUnitClientDto } from "@/lib/client/v2/screenplay-studio/api";
import {
  SCREENPLAY_STUDIO_NAV_GROUPS,
  NAV_GROUP_OF_TYPE,
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
}

export function UnitNavigator({ units, activeUnitId, staleDownstreamUnitIds, onOpenUnit, onCreateUnit }: UnitNavigatorProps) {
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
        return (
          <div key={group.id} className={styles.navGroup} data-group={group.id}>
            <div className={styles.navGroupTitle}>
              <span>{group.label}</span>
              <button
                type="button"
                className={styles.navGroupAdd}
                aria-label={`新建${group.label}`}
                onClick={() => onCreateUnit(group.id, null)}
              >
                ＋
              </button>
            </div>
            {list.length === 0 ? (
              <div className={styles.placeholder}>还没有内容，点 ＋ 直接创建</div>
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
          </div>
        );
      })}
    </nav>
  );
}
