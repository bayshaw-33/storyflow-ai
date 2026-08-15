/**
 * KIIKIS V2.2 Universe import state machine — Phase 4 Task 4.1.
 *
 * Legal transitions:
 *   upload_draft → uploaded | cancelled
 *   uploaded     → extracting | cancelled | failed
 *   extracting   → review_required | degraded | failed | cancelled
 *   review_required → ready_for_u1 | degraded | cancelled
 *   degraded     → extracting (after fix/re-upload) | cancelled | failed
 *   ready_for_u1 → u1_ready | cancelled
 *   u1_ready / cancelled / failed are terminal for writes
 *
 * degraded NEVER jumps to u1_ready / ready_for_u1 — quality gates must be
 * re-run through extraction.
 */

import {
  UniverseImportContractError,
  isImportMode,
  type ImportMode,
  type ImportState,
  type SourceRole,
} from "../../../contracts/v2/universe-import.ts";

const LEGAL: Record<ImportState, readonly ImportState[]> = {
  upload_draft: ["uploaded", "cancelled"],
  uploaded: ["extracting", "cancelled", "failed"],
  extracting: ["review_required", "degraded", "failed", "cancelled"],
  review_required: ["ready_for_u1", "degraded", "cancelled"],
  degraded: ["extracting", "cancelled", "failed"],
  ready_for_u1: ["u1_ready", "cancelled"],
  u1_ready: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: string, to: string): boolean {
  const legal = LEGAL[from as ImportState];
  if (!legal) return false;
  return legal.includes(to as ImportState);
}

export function assertTransition(from: ImportState, to: ImportState): void {
  if (!canTransition(from, to)) {
    throw new UniverseImportContractError(`Illegal import session transition: ${from} → ${to}.`);
  }
}

export interface SessionFileLike {
  id: string;
  role: SourceRole;
  persisted: boolean;
}

/** Files must be persisted before extraction can start. */
export function requireReadyForUpload(session: { state: ImportState; files: SessionFileLike[] }): void {
  if (session.state === "extracting" || session.state === "uploaded") {
    const persisted = session.files.filter((f) => f.persisted);
    if (!persisted.length) {
      throw new UniverseImportContractError("Cannot enter extracting without at least one persisted file.");
    }
  }
}

const TRIPLET: SourceRole[] = ["world_bible", "character_bible", "plot_outline"];

/**
 * Mode gate:
 *   - complete_screenplay: exactly one persisted screenplay file.
 *   - bible_triplet: all three bible roles persisted (supplements ignored).
 */
export function checkModeFiles(mode: string, files: SessionFileLike[]): { ready: boolean; reason: string } {
  if (!isImportMode(mode)) {
    return { ready: false, reason: `Unknown import mode: ${mode}.` };
  }
  const persisted = files.filter((f) => f.persisted && f.role !== "supplement");
  if (mode === "complete_screenplay") {
    const screenplays = persisted.filter((f) => f.role === "screenplay");
    if (screenplays.length === 0) return { ready: false, reason: "complete_screenplay requires one screenplay file." };
    if (screenplays.length > 1) return { ready: false, reason: "complete_screenplay allows exactly one screenplay file." };
    return { ready: true, reason: "" };
  }
  const missing = TRIPLET.filter((role) => !persisted.some((f) => f.role === role));
  if (missing.length) {
    return { ready: false, reason: `bible_triplet missing: ${missing.join(", ")}.` };
  }
  return { ready: true, reason: "" };
}

/**
 * Compute the next state after an attempted transition. When mode gates are
 * not satisfied the session stays in upload_draft (partial uploads are
 * saved, never dropped).
 */
export function nextTransition(current: ImportState, mode: string, files: SessionFileLike[]): ImportState {
  if (current !== "upload_draft") return current;
  const gate = checkModeFiles(mode as ImportMode, files);
  return gate.ready ? "uploaded" : "upload_draft";
}
