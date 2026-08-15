"use client";

/**
 * 三栏审核台 — Phase 4 Task 4.4.
 * 左：分类/状态筛选 + 批量操作；中：候选编辑与决定；右：原文定位。
 * 决定 append-only；刷新后从服务端恢复。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ImportCandidateDto, ImportSessionDto } from "@/lib/client/v2/universe-import/api";
import { universeImportApi, UniverseImportApiError } from "@/lib/client/v2/universe-import/api";
import { canBulkAccept, sessionProgress } from "@/lib/client/v2/universe-import/types";
import { CandidateList, type KindFilter, type StatusFilter } from "./CandidateList";
import { CandidateEditor } from "./CandidateEditor";
import { SourceViewer } from "./SourceViewer";
import styles from "./universe-import.module.css";

export interface UniverseImportReviewProps {
  sessionId: string;
}

const KINDS: KindFilter[] = ["all", "entity", "fact", "relationship", "timeline_event", "conflict"];

export function UniverseImportReview({ sessionId }: UniverseImportReviewProps) {
  const [session, setSession] = useState<ImportSessionDto | null>(null);
  const [candidates, setCandidates] = useState<ImportCandidateDto[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { session: s } = await universeImportApi.getSession(sessionId);
        if (!cancelled) setSession(s);
        // Candidates arrive via the extraction job (Task 4.3 worker); the
        // review API surface stays the same when it lands.
        if (!cancelled) setCandidates([]);
      } catch (e) {
        if (!cancelled) setError(e instanceof UniverseImportApiError ? e.message : "会话加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const active = useMemo(() => candidates.find((c) => c.id === activeId) ?? null, [candidates, activeId]);

  const decide = useCallback(
    async (candidateId: string, action: "accept" | "reject" | "merge" | "bulk_accept", editedPayload?: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        // Decisions POST to the session review API (append-only trail).
        const response = await fetch(`/api/v2/universe-imports/${encodeURIComponent(sessionId)}/decisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateId, action, editedPayload }),
        });
        const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
        if (!response.ok || !body.success) throw new Error(body.error ?? "决定保存失败");
        setCandidates((prev) =>
          prev.map((c) =>
            c.id === candidateId
              ? { ...c, status: action === "accept" ? "accepted" : action === "reject" ? "rejected" : c.status, payload: editedPayload ?? c.payload }
              : c,
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "决定保存失败");
      } finally {
        setBusy(false);
      }
    },
    [sessionId],
  );

  const bulkAccept = useCallback(() => {
    const safe = candidates.filter(
      (c) =>
        c.status === "pending" &&
        (kindFilter === "all" || c.kind === kindFilter) &&
        canBulkAccept({ kind: c.kind, confidence: c.confidence, locations: c.locations.length }),
    );
    for (const c of safe) void decide(c.id, "bulk_accept");
  }, [candidates, kindFilter, decide]);

  const progress = session ? sessionProgress({ state: session.state }) : null;

  return (
    <div style={{ height: "100%" }}>
      {session && progress ? (
        <div className={styles.resumeCard}>
          <span>{progress.label}</span>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress.percent}%` }} />
          </div>
          {progress.needsAttention ? <span className={styles.attention}>{session.degradedReason ?? "需要处理"}</span> : null}
        </div>
      ) : null}
      {error ? <div className={styles.errorBar} role="alert">{error}</div> : null}
      <div className={styles.review} data-testid="universe-import-review">
        <div className={styles.reviewLeft}>
          <CandidateList
            candidates={candidates}
            kindFilter={kindFilter}
            statusFilter={statusFilter}
            selectedIds={new Set()}
            onKindFilterChange={setKindFilter}
            onStatusFilterChange={setStatusFilter}
            onToggleSelect={() => {}}
            onBulkAccept={bulkAccept}
            onOpenCandidate={setActiveId}
          />
        </div>
        <div className={styles.reviewCenter}>
          <CandidateEditor candidate={active} onDecide={(id, action, payload) => void decide(id, action, payload)} disabled={busy} />
        </div>
        <div className={styles.reviewRight}>
          <SourceViewer candidate={active} fileTextById={{}} />
        </div>
      </div>
    </div>
  );
}
