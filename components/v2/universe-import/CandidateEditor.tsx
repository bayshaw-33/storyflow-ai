"use client";

/**
 * 候选编辑器 — Phase 4 Task 4.4 Step 3.
 * 中栏：当前候选的 payload 编辑 + 接受/拒绝/合并。每个决定 append-only。
 */

import { useEffect, useState } from "react";
import type { ImportCandidateDto } from "@/lib/client/v2/universe-import/api";
import styles from "./universe-import.module.css";

export interface CandidateEditorProps {
  candidate: ImportCandidateDto | null;
  onDecide: (candidateId: string, action: "accept" | "reject" | "merge", editedPayload?: Record<string, unknown>) => void;
  disabled?: boolean;
}

export function CandidateEditor({ candidate, onDecide, disabled }: CandidateEditorProps) {
  const [payloadText, setPayloadText] = useState("");

  useEffect(() => {
    setPayloadText(candidate ? JSON.stringify(candidate.payload, null, 2) : "");
  }, [candidate]);

  if (!candidate) {
    return <div className={styles.empty}>从左侧选择一个候选进行审阅。</div>;
  }

  let parsed: Record<string, unknown> = candidate.payload;
  let payloadError: string | null = null;
  try {
    parsed = JSON.parse(payloadText) as Record<string, unknown>;
  } catch {
    payloadError = "JSON 格式有误（可修改后再接受）";
  }

  return (
    <div className={`${styles.candidateCard} ${candidate.status === "accepted" ? styles.accepted : ""} ${candidate.status === "rejected" ? styles.rejected : ""}`} data-testid="candidate-editor">
      <div className={styles.candidateKind}>
        {candidate.kind} · 置信度 {(candidate.confidence * 100).toFixed(0)}% · {candidate.locations.length} 个来源
      </div>
      <textarea
        className={styles.sourceExcerpt}
        style={{ width: "100%", minHeight: 120, resize: "vertical" }}
        value={payloadText}
        aria-label="候选内容编辑"
        onChange={(e) => setPayloadText(e.target.value)}
        spellCheck={false}
      />
      {payloadError ? <div className={styles.attention}>{payloadError}</div> : null}
      <div className={styles.candidateActions}>
        <button
          type="button"
          className={styles.actionBtn}
          disabled={disabled || Boolean(payloadError)}
          onClick={() => onDecide(candidate.id, "accept", parsed)}
          data-testid="accept-candidate"
        >
          接受
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.danger}`}
          disabled={disabled}
          onClick={() => onDecide(candidate.id, "reject")}
          data-testid="reject-candidate"
        >
          拒绝
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          disabled={disabled}
          onClick={() => onDecide(candidate.id, "merge")}
          data-testid="merge-candidate"
          title="合并到已有候选（保留全部来源）"
        >
          合并
        </button>
      </div>
    </div>
  );
}
