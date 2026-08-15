/**
 * KIIKIS V2.2 Universe import client types — Phase 4 Task 4.4.
 *
 * Wizard gates, review-state logic and resume-card progress. Pure logic so
 * the semantic contracts stay testable in node --test.
 */

import type { ImportMode, ImportState, SourceRole } from "../../../contracts/v2/universe-import.ts";

// ---------------------------------------------------------------------------
// Creation entries (Universes page)
// ---------------------------------------------------------------------------

export interface UniverseCreateEntry {
  id: "from_scratch" | "from_work" | "external_upload";
  label: string;
  description: string;
  requiresProject: boolean;
}

export const UNIVERSE_CREATE_ENTRIES: UniverseCreateEntry[] = [
  { id: "from_scratch", label: "从零创建", description: "空白 Universe，从 Canon 对象开始搭建。", requiresProject: false },
  { id: "from_work", label: "从现有 Work 建立", description: "把已有剧本/作品升级为 Universe 继承源。", requiresProject: false },
  { id: "external_upload", label: "上传站外原作建立", description: "上传完整剧本或三件套，审核后建立 Universe U1。", requiresProject: false },
];

// ---------------------------------------------------------------------------
// Wizard gates
// ---------------------------------------------------------------------------

export interface WizardFileLike {
  role: SourceRole;
  persisted: boolean;
}

const TRIPLET: SourceRole[] = ["world_bible", "character_bible", "plot_outline"];

export function tripletRequirementStatus(files: WizardFileLike[]): { complete: boolean; missing: SourceRole[] } {
  const missing = TRIPLET.filter((role) => !files.some((f) => f.role === role && f.persisted));
  return { complete: missing.length === 0, missing };
}

export function canStartExtraction(session: {
  state: ImportState;
  mode: ImportMode;
  files: WizardFileLike[];
}): boolean {
  if (session.state !== "uploaded") return false;
  if (session.mode === "complete_screenplay") {
    return session.files.filter((f) => f.role === "screenplay" && f.persisted).length === 1;
  }
  return tripletRequirementStatus(session.files).complete;
}

// ---------------------------------------------------------------------------
// Bulk accept protections
// ---------------------------------------------------------------------------

export function canBulkAccept(candidate: { kind: string; confidence: number; locations: number }): boolean {
  if (candidate.kind === "conflict") return false;
  if (candidate.confidence < 0.5) return false;
  if (candidate.locations < 1) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Review state (append-only decisions)
// ---------------------------------------------------------------------------

export type ReviewAction = "accept" | "reject" | "merge" | "edit" | "undo";

export interface ReviewDecision {
  candidateId: string;
  action: ReviewAction;
  at: number;
}

export interface ReviewCandidateLike {
  id: string;
  status: string;
}

export interface ReviewState<T extends ReviewCandidateLike = ReviewCandidateLike> {
  decisions: ReviewDecision[];
  byId: Map<string, T>;
}

export function nextReviewState(
  state: ReviewState,
  decision: { candidateId: string; action: ReviewAction },
): ReviewState {
  const candidate = state.byId.get(decision.candidateId);
  const nextStatus =
    decision.action === "accept" ? "accepted" :
    decision.action === "reject" ? "rejected" :
    decision.action === "merge" ? "merged" :
    decision.action === "undo" ? "pending" :
    candidate?.status ?? "pending";
  const byId = new Map(state.byId);
  if (candidate) byId.set(candidate.id, { ...candidate, status: nextStatus });
  return {
    decisions: [...state.decisions, { candidateId: decision.candidateId, action: decision.action, at: Date.now() }],
    byId,
  };
}

// ---------------------------------------------------------------------------
// Resume card progress
// ---------------------------------------------------------------------------

export function sessionProgress(session: { state: ImportState }): { percent: number; label: string; needsAttention: boolean } {
  switch (session.state) {
    case "upload_draft": return { percent: 10, label: "上传中", needsAttention: false };
    case "uploaded": return { percent: 25, label: "待提取", needsAttention: false };
    case "extracting": return { percent: 40, label: "提取中", needsAttention: false };
    case "review_required": return { percent: 70, label: "待审核", needsAttention: false };
    case "degraded": return { percent: 40, label: "质量不足", needsAttention: true };
    case "ready_for_u1": return { percent: 90, label: "可建立 U1", needsAttention: false };
    case "u1_ready": return { percent: 100, label: "U1 已建立", needsAttention: false };
    case "failed": return { percent: 0, label: "失败", needsAttention: true };
    case "cancelled": return { percent: 0, label: "已取消", needsAttention: false };
    default: return { percent: 0, label: session.state, needsAttention: false };
  }
}
