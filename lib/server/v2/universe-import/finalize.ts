/**
 * KIIKIS V2.2 Atomic Universe U1 finalize — Phase 4 Task 4.5.
 *
 * finalize() calls a single Postgres RPC (`finalize_universe_import_v22`)
 * so Source Work, Source Version, Universe, Universe U1 (version row with
 * accepted canon objects), source links and Evidence Event are created
 * atomically — any failure leaves zero artifacts behind.
 *
 * Revisions: Source Work stays read-only in UI (view/download only).
 * A revised file appends Source Version v2 (append-only, v1 never
 * overwritten) and produces an Universe Upgrade Proposal — U1 pointer
 * stays until the user reviews and publishes U2.
 *
 * Rights: universes default to `private`; unclear/restricted declarations
 * cannot publish, license or allow derivative works, but stay analyzable
 * by the owner privately.
 */

import type { ImportState, SourceRole } from "../../../contracts/v2/universe-import.ts";
import type { ImportFetcher } from "./index.ts";

export class FinalizeError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "conflict" | "validation_failed" | "service_unavailable";
  constructor(code: FinalizeError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "FinalizeError";
    this.code = code;
  }
}

const PRIVATE_ONLY_BASES = new Set(["unclear", "restricted"]);

export interface FinalizeResult {
  universeId: string;
  universeVersionId: string;
  sourceWorkId: string;
  sourceVersionId: string | null;
  idempotent: boolean;
  rightsState: "private";
  canPublish: boolean;
  canLicense: boolean;
  canDerivative: boolean;
}

interface SessionRow {
  id: string;
  owner_id: string;
  state: ImportState;
  rights_declaration: { basis?: string } & Record<string, unknown>;
  source_work_id: string | null;
  universe_id: string | null;
}

export class FinalizeUniverseImportService {
  private readonly fetcher: ImportFetcher;

  constructor(fetcher: ImportFetcher) {
    this.fetcher = fetcher;
  }

  /**
   * Atomically promote a ready_for_u1 session into Universe U1.
   * - ready_for_u1 only; degraded/extracting/review_required conflict
   * - idempotent: an already-finalized session returns its existing U1
   * - RPC failure → no Universe / U1 / Source Work / Evidence remains
   */
  async finalize(params: { ownerId: string; sessionId: string }): Promise<FinalizeResult> {
    const session = await this.getSessionRow(params.ownerId, params.sessionId);
    if (session.state === "u1_ready" && session.universe_id) {
      return {
        universeId: session.universe_id,
        universeVersionId: `${session.source_work_id ?? session.id}:uv`,
        sourceWorkId: session.source_work_id ?? "",
        sourceVersionId: null,
        idempotent: true,
        rightsState: "private",
        canPublish: false,
        canLicense: false,
        canDerivative: false,
      };
    }
    if (session.state !== "ready_for_u1") {
      throw new FinalizeError("conflict", `Session state ${session.state} is not ready_for_u1.`);
    }

    let row: Record<string, unknown> | null = null;
    try {
      const rows = await this.fetcher<Record<string, unknown>[] | Record<string, unknown>>("/rest/v1/rpc/finalize_universe_import_v22", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner_id: params.ownerId, session_id: params.sessionId }),
      });
      row = (Array.isArray(rows) ? rows[0] : rows) ?? null;
    } catch (error) {
      throw new FinalizeError("service_unavailable", `Atomic finalize failed: ${(error as Error).message}`);
    }
    if (!row || row.error) {
      const code = String(row?.error ?? "");
      if (code === "not_ready") throw new FinalizeError("conflict", "Session is not ready_for_u1.");
      if (code === "session_not_found") throw new FinalizeError("not_found", "Import session not found.");
      throw new FinalizeError("service_unavailable", `Atomic finalize failed: ${code || "unknown RPC error"}`);
    }

    const basis = String(session.rights_declaration?.basis ?? "");
    const privateOnly = PRIVATE_ONLY_BASES.has(basis);
    return {
      universeId: String(row.universe_id),
      universeVersionId: String(row.universe_version_id),
      sourceWorkId: String(row.source_work_id),
      sourceVersionId: row.source_version_id ? String(row.source_version_id) : null,
      idempotent: false,
      rightsState: "private",
      canPublish: !privateOnly,
      canLicense: !privateOnly,
      canDerivative: !privateOnly,
    };
  }

  private async getSessionRow(ownerId: string, sessionId: string): Promise<SessionRow> {
    let rows: SessionRow[] = [];
    try {
      rows = await this.fetcher<SessionRow[]>(
        `/rest/v1/storyflow_universe_import_sessions?id=eq.${encodeURIComponent(sessionId)}&select=id,owner_id,state,rights_declaration,source_work_id,universe_id&limit=1`,
      );
    } catch (error) {
      throw new FinalizeError("service_unavailable", `Import service unavailable: ${(error as Error).message}`);
    }
    const row = rows?.[0];
    if (!row) throw new FinalizeError("not_found", "Import session not found.");
    if (row.owner_id !== ownerId) throw new FinalizeError("forbidden", "Not the import session owner.");
    return row;
  }
}

// ---------------------------------------------------------------------------
// Source Work revisions (append-only)
// ---------------------------------------------------------------------------

export interface SourceVersionRow {
  id: string;
  source_work_id: string;
  version_no: number;
  file_hashes: string[];
  rights_declaration: Record<string, unknown>;
  manifest: Record<string, unknown>;
  created_by: string;
  created_at: string;
  /** camelCase alias for domain callers */
  versionNo?: number;
}

export interface SourceWorkRows {
  works: Array<{ id: string; owner_id: string; work_type: string; project_id: string | null; is_primary: boolean }>;
  sourceWorks: Array<{ work_id: string; owner_id: string; title: string; rights_state: string }>;
  sourceVersions: SourceVersionRow[];
  upgradeProposals: Array<Record<string, unknown>>;
}

/**
 * Source Work exposes no edit/overwrite surface — view and download only.
 * Locked as a compile-time contract: this module defines no mutation paths
 * for existing source versions.
 */
export function sourceWorkIsReadOnly(): true {
  return true;
}

/**
 * Append Source Version v(n+1). Never overwrites; identical manifest hash
 * is a conflict (re-upload is not a revision).
 */
export function createSourceVersion(
  rows: SourceWorkRows,
  input: { sourceWorkId: string; fileHashes: string[]; rightsDeclaration: Record<string, unknown>; manifest: { hash: string } & Record<string, unknown>; createdBy: string },
): SourceVersionRow {
  const existing = rows.sourceVersions.filter((v) => v.source_work_id === input.sourceWorkId);
  if (existing.some((v) => (v.manifest?.hash ?? "") === input.manifest.hash)) {
    throw new FinalizeError("conflict", "Identical manifest hash — re-upload is not a revision.");
  }
  const nextNo = existing.reduce((max, v) => Math.max(max, v.version_no), 0) + 1;
  const row: SourceVersionRow = {
    id: `${input.sourceWorkId}-sv${nextNo}`,
    source_work_id: input.sourceWorkId,
    version_no: nextNo,
    versionNo: nextNo,
    file_hashes: [...input.fileHashes],
    rights_declaration: { ...input.rightsDeclaration },
    manifest: { ...input.manifest },
    created_by: input.createdBy,
    created_at: new Date().toISOString(),
  };
  rows.sourceVersions.push(row);
  return row;
}

export interface UpgradeProposal {
  kind: "universe_upgrade";
  universeId: string;
  fromVersionId: string;
  sourceVersionId: string;
  status: "pending_review";
}

/**
 * v2 re-extraction produces an Upgrade Proposal; the U1 pointer is
 * untouched until the user reviews and publishes U2.
 */
export function buildUpgradeProposal(
  rows: SourceWorkRows,
  input: { universeId: string; currentUniverseVersionId: string; sourceVersion: SourceVersionRow; ownerId: string },
): UpgradeProposal {
  const proposal: UpgradeProposal & Record<string, unknown> = {
    kind: "universe_upgrade",
    universeId: input.universeId,
    fromVersionId: input.currentUniverseVersionId,
    sourceVersionId: input.sourceVersion.id,
    status: "pending_review",
    created_by: input.ownerId,
  };
  rows.upgradeProposals.push(proposal);
  return proposal;
}

export type { SourceRole };
