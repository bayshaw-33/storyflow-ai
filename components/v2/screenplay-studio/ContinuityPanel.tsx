"use client";

/**
 * 连续性面板 — Phase 3 Task 3.5.
 * 冲突定位到集/场/版本/文本范围；四种处置（忽略/修订/建候选/Universe 提案）
 * 每次都写 Evidence Event。
 */

import { useCallback, useState } from "react";
import styles from "./ScreenplayStudio.module.css";
import { fetchScreenplayStudio } from "@/lib/client/v2/screenplay-studio/auth";

export interface ContinuityFindingDto {
  id: string;
  kind: string;
  severity: string;
  summary: string;
  locations: Array<{
    episodeId: string;
    sceneId: string;
    unitVersionId: string;
    textStart: number;
    textEnd: number;
  }>;
}

export interface ContinuityPanelProps {
  workId: string;
  findings: ContinuityFindingDto[];
  unitTitleById: (unitId: string) => string;
  onOpenUnit: (unitId: string) => void;
  onFindingsChange: (findings: ContinuityFindingDto[]) => void;
}

const DISPOSITIONS: Array<[string, string]> = [
  ["ignore", "忽略"],
  ["revise", "修订"],
  ["create_candidate", "建立候选"],
  ["universe_proposal", "Universe 提案"],
];

export function ContinuityPanel({ workId, findings, unitTitleById, onOpenUnit, onFindingsChange }: ContinuityPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchScreenplayStudio(`/api/v2/works/${encodeURIComponent(workId)}/screenplay/continuity`);
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; findings?: ContinuityFindingDto[]; error?: string };
      if (!response.ok || !body.success) throw new Error(body.error ?? "分析失败");
      onFindingsChange(body.findings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析失败");
    } finally {
      setBusy(false);
    }
  }, [workId, onFindingsChange]);

  const dispose = useCallback(
    async (findingId: string, action: string) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetchScreenplayStudio(`/api/v2/works/${encodeURIComponent(workId)}/screenplay/continuity`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ findingId, action }),
        });
        const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
        if (!response.ok || !body.success) throw new Error(body.error ?? "处置失败");
        onFindingsChange(findings.filter((f) => f.id !== findingId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "处置失败");
      } finally {
        setBusy(false);
      }
    },
    [workId, findings, onFindingsChange],
  );

  return (
    <div data-testid="continuity-panel">
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button type="button" className={styles.staleActionBtn} onClick={() => void analyze()} disabled={busy} data-testid="run-continuity">
          {busy ? "分析中…" : "检查连续性"}
        </button>
      </div>
      {error ? <div className={styles.staleRow} role="alert">{error}</div> : null}
      {findings.length === 0 ? (
        <div className={styles.placeholder}>没有待处理的连续性问题。</div>
      ) : (
        findings.map((finding) => (
          <div key={finding.id} className={styles.staleRow} data-testid="continuity-finding">
            <div>{finding.summary}</div>
            {finding.locations.map((loc, i) => (
              <button
                key={`${loc.sceneId}-${i}`}
                type="button"
                className={styles.navItem}
                style={{ padding: "2px 4px", fontSize: 12 }}
                onClick={() => onOpenUnit(loc.sceneId)}
              >
                {unitTitleById(loc.episodeId)} › {unitTitleById(loc.sceneId)} · 文本 [{loc.textStart}, {loc.textEnd})
              </button>
            ))}
            <div className={styles.staleActions}>
              {DISPOSITIONS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={styles.staleActionBtn}
                  onClick={() => void dispose(finding.id, value)}
                  disabled={busy}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
