"use client";

/**
 * KIIKIS 2.1 Phase 2 — 动态宫格分镜 diff 对话框 (K21-SB-007, K21-SB-008)
 *
 * 显示 CAS 冲突或 locked_override 时的字段级 diff。
 * 用户选择:
 *   - "保留我的版本": 用 attemptedStoryboard 重新提交 (强制 revisionSource=user)
 *   - "接受服务端版本": 重新加载 currentStoryboard 到本地
 *   - "取消": 不做任何操作
 */

import { type ReactNode } from "react";
import type { UpsertConflictPayload } from "@/lib/storyboard/dynamic-grid-client";
import styles from "./DynamicGridEditor.module.css";

export interface DynamicGridDiffDialogProps {
  conflict: UpsertConflictPayload;
  onKeepMine: () => void;
  onAcceptServer: () => void;
  onCancel: () => void;
}

export function DynamicGridDiffDialog({
  conflict,
  onKeepMine,
  onAcceptServer,
  onCancel,
}: DynamicGridDiffDialogProps): ReactNode {
  const { diff, kind, message } = conflict;

  const kindLabel =
    kind === "cas_mismatch"
      ? "版本冲突"
      : kind === "locked_override"
        ? "锁定覆盖"
        : "未找到";

  return (
    <div
      className={styles.diffOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dyn-grid-diff-title"
    >
      <div className={styles.diffDialog}>
        <div className={styles.diffHeader}>
          <h2 id="dyn-grid-diff-title" className={styles.diffTitle}>
            上游修改冲突
          </h2>
          <span className={styles.diffKind}>{kindLabel}</span>
        </div>

        <div className={styles.diffBody}>
          <p className={styles.notice}>{message}</p>

          {diff.metadataChanged && diff.metadataDeltas.length > 0 ? (
            <div className={styles.diffSection}>
              <div className={styles.diffSectionTitle}>场景元数据变化</div>
              {diff.metadataDeltas.map((d, i) => (
                <div key={`meta-${i}`} className={styles.diffFrameRow}>
                  <div className={styles.diffFrameId}>{d.field}</div>
                  <div className={styles.diffCell}>
                    <span className={styles.diffFieldLabel}>旧值</span>
                    <span className={styles.diffOldValue}>{formatValue(d.oldValue)}</span>
                  </div>
                  <div className={styles.diffCell}>
                    <span className={styles.diffFieldLabel}>新值</span>
                    <span className={styles.diffNewValue}>{formatValue(d.newValue)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {diff.framesAdded.length > 0 ? (
            <div className={styles.diffSection}>
              <div className={styles.diffSectionTitle}>新增帧 ({diff.framesAdded.length})</div>
              <div className={styles.diffFrameList}>
                {diff.framesAdded.map((f) => (
                  <div key={`add-${f.frameId}`} className={styles.diffFrameRow}>
                    <div className={styles.diffFrameId}>#{f.order} {f.frameId}</div>
                    <div className={styles.diffCell}>
                      <span className={styles.diffNewValue}>+ 新增</span>
                    </div>
                    <div />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {diff.framesRemoved.length > 0 ? (
            <div className={styles.diffSection}>
              <div className={styles.diffSectionTitle}>删除帧 ({diff.framesRemoved.length})</div>
              <div className={styles.diffFrameList}>
                {diff.framesRemoved.map((f) => (
                  <div key={`rm-${f.frameId}`} className={styles.diffFrameRow}>
                    <div className={styles.diffFrameId}>#{f.order} {f.frameId}</div>
                    <div className={styles.diffCell}>
                      <span className={styles.diffOldValue}>- 删除</span>
                    </div>
                    <div />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {diff.framesModified.length > 0 ? (
            <div className={styles.diffSection}>
              <div className={styles.diffSectionTitle}>修改帧 ({diff.framesModified.length})</div>
              <div className={styles.diffFrameList}>
                {diff.framesModified.map((m) => (
                  <div key={`mod-${m.frameId}`} className={styles.diffFrameRow}>
                    <div className={styles.diffFrameId}>
                      #{m.order} {m.frameId}
                      {m.fields.some((f) => f.locked || f.userEdited) ? " 🔒" : ""}
                    </div>
                    <div className={styles.diffCell}>
                      {m.fields.map((f, i) => (
                        <div key={i}>
                          <span className={styles.diffFieldLabel}>{f.field}: </span>
                          <span className={styles.diffOldValue}>{formatValue(f.oldValue)}</span>
                        </div>
                      ))}
                    </div>
                    <div className={styles.diffCell}>
                      {m.fields.map((f, i) => (
                        <div key={i}>
                          <span className={styles.diffFieldLabel}>{f.field}: </span>
                          <span className={styles.diffNewValue}>{formatValue(f.newValue)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {diff.summary === "no changes" ? (
            <div className={styles.diffSection}>
              <p>无字段级差异 (可能是 revision 号过期)。</p>
            </div>
          ) : null}
        </div>

        <div className={styles.diffActions}>
          <button
            type="button"
            className={`${styles.diffBtn} ${styles.diffBtnSecondary}`}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className={`${styles.diffBtn} ${styles.diffBtnSecondary}`}
            onClick={onAcceptServer}
          >
            接受服务端版本
          </button>
          <button
            type="button"
            className={`${styles.diffBtn} ${styles.diffBtnPrimary}`}
            onClick={onKeepMine}
          >
            保留我的版本
          </button>
        </div>
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > 60 ? `${value.slice(0, 60)}…` : value;
  if (Array.isArray(value)) return value.length === 0 ? "[]" : `[${value.join(", ")}]`;
  return JSON.stringify(value);
}
