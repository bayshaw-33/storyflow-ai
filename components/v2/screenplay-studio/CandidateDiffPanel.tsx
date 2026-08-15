"use client";

/**
 * Candidate Diff 面板 — Phase 3 Task 3.4.
 * before/after 逐块对比；逐块接受/拒绝；只有显式“采用”才创建新版本。
 */

import type { CandidateDiffViewModel } from "@/lib/client/v2/screenplay-studio/types";
import styles from "./ScreenplayStudio.module.css";

export interface CandidateDiffPanelProps {
  vm: CandidateDiffViewModel;
  onToggleHunk: (hunkIndex: number, accepted: boolean) => void;
  onApply: () => void;
  onReject: () => void;
  disabled?: boolean;
}

export function CandidateDiffPanel({ vm, onToggleHunk, onApply, onReject, disabled }: CandidateDiffPanelProps) {
  return (
    <div data-testid="candidate-diff-panel" className={styles.staleRow}>
      <div style={{ marginBottom: 8 }}>修改方案（{vm.hunks.filter((h) => h.accepted).length}/{vm.hunks.length} 块已接受）</div>
      {vm.hunks.map((hunk, index) => (
        <div key={`${hunk.unitPath}-${index}`} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "8px 0" }}>
          <div className={styles.placeholder}>{hunk.unitPath}</div>
          <div style={{ textDecoration: "line-through", opacity: 0.55, fontSize: 13 }}>{hunk.before}</div>
          <div style={{ color: "#8fd6a8", fontSize: 13 }}>{hunk.after}</div>
          <div className={styles.staleActions}>
            <button
              type="button"
              className={styles.staleActionBtn}
              aria-pressed={hunk.accepted}
              data-testid={`hunk-${index}-accept`}
              onClick={() => onToggleHunk(index, !hunk.accepted)}
              disabled={disabled}
            >
              {hunk.accepted ? "✓ 已接受" : "接受"}
            </button>
          </div>
        </div>
      ))}
      <div className={styles.staleActions}>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={onApply}
          disabled={disabled || !vm.anyAccepted}
          data-testid="apply-candidate"
        >
          采用并创建新版本
        </button>
        <button type="button" className={styles.staleActionBtn} onClick={onReject} disabled={disabled} data-testid="reject-candidate">
          不采用
        </button>
      </div>
    </div>
  );
}
