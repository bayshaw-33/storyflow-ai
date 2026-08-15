"use client";

/**
 * 本次引用列表 — Phase 3 Task 3.5 Step 3.
 * 展示 Context Packet 的 Universe 对象、版本与引用原因；
 * 可打开来源；不显示整包隐藏 prompt。
 */

import styles from "./ScreenplayStudio.module.css";

export interface PacketReferenceDto {
  type: string;
  id: string;
  versionId: string;
  reason: string;
}

export interface ReferenceListProps {
  references: PacketReferenceDto[];
  onOpenSource?: (reference: PacketReferenceDto) => void;
}

const REASON_LABELS: Record<string, string> = {
  selected: "当前场景选中",
  timeline_adjacent: "时间线邻近",
  related: "关联对象",
  canon_default: "Canon 默认",
};

export function ReferenceList({ references, onOpenSource }: ReferenceListProps) {
  if (!references.length) {
    return <div className={styles.placeholder}>当前没有 Context Packet 引用。</div>;
  }
  return (
    <div data-testid="reference-list">
      {references.map((ref) => (
        <button
          key={`${ref.type}-${ref.id}`}
          type="button"
          className={styles.navItem}
          onClick={() => onOpenSource?.(ref)}
        >
          <span className={styles.readinessDot + " " + styles.checkpoint} aria-label={ref.type} />
          <span className={styles.navItemTitle}>
            {ref.type} · {ref.id}
          </span>
          <span className={styles.staleBadge}>{REASON_LABELS[ref.reason] ?? ref.reason}</span>
        </button>
      ))}
      <div className={styles.placeholder}>只显示对象级引用与原因；不展示隐藏 prompt。</div>
    </div>
  );
}
