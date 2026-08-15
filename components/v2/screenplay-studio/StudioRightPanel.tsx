"use client";

/**
 * 右栏 — Phase 3 Task 3.3 (KK / 引用 / 版本 / 连续性 tabs)。
 * KK tab 由 KkScreenplayRoom 注入（Task 3.4）；连续性 tab 由
 * ContinuityPanel 注入（Task 3.5）。本组件只负责 tab 骨架与
 * 引用/版本/stale 处置的最早可用版本。
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { SCREENPLAY_STUDIO_RIGHT_PANEL_TABS } from "@/lib/client/v2/screenplay-studio/types";
import type { StaleEdgeDto } from "@/lib/client/v2/screenplay-studio/api";
import styles from "./ScreenplayStudio.module.css";

const TAB_LABELS: Record<string, string> = {
  kk: "KK",
  references: "引用",
  versions: "版本",
  continuity: "连续性",
};

export interface StudioRightPanelProps {
  staleEdges: StaleEdgeDto[];
  unitTitleById: (unitId: string) => string;
  onResolveStale: (edge: StaleEdgeDto, resolution: string) => void;
  currentVersionId: string | null;
  finalizedVersionId: string | null;
  references: ReactNode;
  kkRoom: ReactNode;
  continuityPanel: ReactNode;
}

const RESOLUTION_LABELS: Array<[string, string]> = [
  ["keep_old", "继续用旧来源"],
  ["regenerate", "重新生成候选"],
  ["manual_revise", "人工修订"],
  ["confirm_no_impact", "确认无影响"],
];

export function StudioRightPanel({
  staleEdges,
  unitTitleById,
  onResolveStale,
  currentVersionId,
  finalizedVersionId,
  references,
  kkRoom,
  continuityPanel,
}: StudioRightPanelProps) {
  const [tab, setTab] = useState<string>("kk");
  return (
    <aside className={styles.rightPanel} aria-label="剧本室右栏">
      <div className={styles.tabBar} role="tablist">
        {SCREENPLAY_STUDIO_RIGHT_PANEL_TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            type="button"
            className={`${styles.tabBtn} ${tab === t ? styles.active : ""}`}
            onClick={() => setTab(t)}
            data-testid={`tab-${t}`}
          >
            {TAB_LABELS[t] ?? t}
            {t === "continuity" && staleEdges.length > 0 ? ` (${staleEdges.length})` : ""}
          </button>
        ))}
      </div>
      <div className={styles.tabBody} role="tabpanel">
        {tab === "kk" ? (kkRoom ?? <div className={styles.placeholder}>KK 会话加载中</div>) : null}
        {tab === "references" ? (references ?? <div className={styles.placeholder}>当前没有 Context Packet 引用</div>) : null}
        {tab === "versions" ? (
          <div>
            <div className={styles.placeholder}>当前版本：{currentVersionId ?? "（未保存）"}</div>
            <div className={styles.placeholder}>定稿版本：{finalizedVersionId ?? "（未定稿）"}</div>
            <div className={styles.placeholder}>版本历史在正式动作（制作/发布/授权）时只消费定稿版本。</div>
          </div>
        ) : null}
        {tab === "continuity" ? (
          continuityPanel ?? (
            <div>
              {staleEdges.length === 0 ? (
                <div className={styles.placeholder}>没有待处理的 stale 引用</div>
              ) : (
                staleEdges.map((edge) => (
                  <div key={edge.edgeId} className={styles.staleRow} data-testid="stale-row">
                    <div>
                      上游「{unitTitleById(edge.upstreamUnitId)}」已更新，下游「{unitTitleById(edge.downstreamUnitId)}」引用的是旧版本。
                    </div>
                    <div className={styles.staleActions}>
                      {RESOLUTION_LABELS.map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={styles.staleActionBtn}
                          onClick={() => onResolveStale(edge, value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )
        ) : null}
      </div>
    </aside>
  );
}
