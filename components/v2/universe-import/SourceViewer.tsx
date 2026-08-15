"use client";

/**
 * 原文定位查看器 — Phase 4 Task 4.4 Step 3.
 * 右栏：候选 SourceLocation 对应的原文片段，高亮命中区间。
 */

import { useEffect, useState } from "react";
import type { ImportCandidateDto } from "@/lib/client/v2/universe-import/api";
import styles from "./universe-import.module.css";

export interface SourceViewerProps {
  candidate: ImportCandidateDto | null;
  fileTextById: Record<string, string>;
}

export function SourceViewer({ candidate, fileTextById }: SourceViewerProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [candidate?.id]);

  if (!candidate || !candidate.locations.length) {
    return <div className={styles.empty}>选择带来源的候选后，这里显示原文定位。</div>;
  }
  const loc = candidate.locations[Math.min(activeIndex, candidate.locations.length - 1)];
  const text = fileTextById[loc.fileId] ?? "";
  const window = 160;
  const from = Math.max(0, loc.startOffset - window);
  const to = Math.min(text.length, loc.endOffset + window);
  const before = text.slice(from, loc.startOffset);
  const hit = text.slice(loc.startOffset, loc.endOffset);
  const after = text.slice(loc.endOffset, to);

  return (
    <div data-testid="source-viewer">
      <div className={styles.candidateKind}>
        原文定位 {activeIndex + 1}/{candidate.locations.length}
        {loc.page ? ` · 第${loc.page}页` : ""}
        {` · [${loc.startOffset}, ${loc.endOffset})`}
      </div>
      <div className={styles.sourceExcerpt}>
        {from > 0 ? "…" : ""}
        {before}
        <mark className={styles.sourceMark}>{hit || "（空区间）"}</mark>
        {after}
        {to < text.length ? "…" : ""}
      </div>
      {candidate.locations.length > 1 ? (
        <div className={styles.candidateActions}>
          {candidate.locations.map((_, i) => (
            <button key={i} type="button" className={styles.actionBtn} onClick={() => setActiveIndex(i)}>
              来源 {i + 1}
            </button>
          ))}
        </div>
      ) : null}
      <div className={styles.dropHint} style={{ marginTop: 8 }}>
        原文件不可修改；Source Version 建立后永远只读。
      </div>
    </div>
  );
}
