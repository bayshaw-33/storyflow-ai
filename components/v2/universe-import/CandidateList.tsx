"use client";

/**
 * 候选列表 — Phase 4 Task 4.4.
 * 左栏分类/状态筛选 + 批量接受（带保护）。
 */

import { useMemo } from "react";
import type { ImportCandidateDto } from "@/lib/client/v2/universe-import/api";
import { canBulkAccept } from "@/lib/client/v2/universe-import/types";
import styles from "./universe-import.module.css";

export type KindFilter = "all" | "entity" | "fact" | "relationship" | "timeline_event" | "conflict";
export type StatusFilter = "all" | "pending" | "accepted" | "rejected";

export interface CandidateListProps {
  candidates: ImportCandidateDto[];
  kindFilter: KindFilter;
  statusFilter: StatusFilter;
  selectedIds: Set<string>;
  onKindFilterChange: (kind: KindFilter) => void;
  onStatusFilterChange: (status: StatusFilter) => void;
  onToggleSelect: (id: string) => void;
  onBulkAccept: () => void;
  onOpenCandidate: (id: string) => void;
}

const KIND_LABELS: Record<string, string> = {
  all: "全部",
  entity: "角色/实体",
  fact: "事实",
  relationship: "关系",
  timeline_event: "时间线",
  conflict: "冲突",
};

export function CandidateList({
  candidates,
  kindFilter,
  statusFilter,
  selectedIds,
  onKindFilterChange,
  onStatusFilterChange,
  onBulkSelect,
  onBulkAccept,
  onOpenCandidate,
}: CandidateListProps & { onBulkSelect?: (ids: string[]) => void }) {
  const counts = useMemo(() => {
    const byKind: Record<string, number> = {};
    for (const c of candidates) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
    return byKind;
  }, [candidates]);

  const filtered = useMemo(
    () =>
      candidates.filter(
        (c) => (kindFilter === "all" || c.kind === kindFilter) && (statusFilter === "all" || c.status === statusFilter),
      ),
    [candidates, kindFilter, statusFilter],
  );

  const bulkSafe = useMemo(
    () => filtered.filter((c) => canBulkAccept({ kind: c.kind, confidence: c.confidence, locations: c.locations.length })),
    [filtered],
  );
  const blockedCount = filtered.length - bulkSafe.length;

  return (
    <div>
      {(Object.keys(KIND_LABELS) as KindFilter[]).map((kind) => (
        <button
          key={kind}
          type="button"
          className={`${styles.filterItem} ${kindFilter === kind ? styles.active : ""}`}
          onClick={() => onKindFilterChange(kind)}
          data-testid={`filter-${kind}`}
        >
          <span>{KIND_LABELS[kind]}</span>
          <span>{kind === "all" ? candidates.length : counts[kind] ?? 0}</span>
        </button>
      ))}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "8px 0" }} />
      {(["all", "pending", "accepted", "rejected"] as StatusFilter[]).map((status) => (
        <button
          key={status}
          type="button"
          className={`${styles.filterItem} ${statusFilter === status ? styles.active : ""}`}
          onClick={() => onStatusFilterChange(status)}
        >
          <span>{status === "all" ? "全部状态" : status === "pending" ? "待决定" : status === "accepted" ? "已接受" : "已拒绝"}</span>
        </button>
      ))}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "8px 0" }} />
      <button
        type="button"
        className={styles.actionBtn}
        disabled={!bulkSafe.length}
        onClick={onBulkAccept}
        data-testid="bulk-accept"
        title="只批量接受当前筛选中可安全接受的候选"
      >
        批量接受（{bulkSafe.length}）
      </button>
      {blockedCount > 0 ? (
        <div className={styles.attention} style={{ marginTop: 6 }}>
          {blockedCount} 条（冲突/低置信/无来源）不能批量自动接受，需逐条处理。
        </div>
      ) : null}
      <div style={{ marginTop: 10 }}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>当前筛选没有候选。</div>
        ) : (
          filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className={styles.filterItem}
              onClick={() => onOpenCandidate(c.id)}
              data-testid={`candidate-${c.id}`}
            >
              <span>{String(c.payload.name ?? c.payload.statement ?? c.payload.event ?? c.payload.description ?? c.kind)}</span>
              <span>{c.status === "pending" ? "待决定" : c.status === "accepted" ? "✓" : c.status === "rejected" ? "✕" : c.status}</span>
            </button>
          ))
        )}
      </div>
      {onBulkSelect ? (
        <button type="button" className={styles.ghostBtn} style={{ marginTop: 8 }} onClick={() => onBulkSelect(filtered.map((c) => c.id))}>
          全选当前筛选
        </button>
      ) : null}
    </div>
  );
}
