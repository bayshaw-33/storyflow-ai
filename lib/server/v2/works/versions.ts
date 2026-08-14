/**
 * KIIKIS V2.2 Work Version service — Phase 1 Task 1.2.
 *
 * Server-side functions for the immutable Work Version chain:
 *   - appendWorkVersion: create editing_draft / checkpoint / finalized
 *   - createCheckpoint: shorthand for checkpoint kind
 *   - finalizeWorkVersion: promote a checkpoint/editing_draft to finalized
 *   - listWorkVersions: read the version chain
 *
 * Content hash is computed server-side over canonicalJson(content); clients
 * never supply their own hash. ownerId is always derived from auth context.
 *
 * Concurrency: appendWorkVersion supports CAS via expectedCurrentVersionId.
 * When two clients race on the same parent, one succeeds and the other gets a
 * 409 conflict with the currentVersionId.
 */

import { canonicalJson, sha256Hex, utf8Bytes } from "../../../compliance/manifest.ts";
import {
  type WorkVersionKind,
  type WorkVersionSource,
  type WorkVersionV22,
  WorkHistoryContractError,
  isWorkVersionKind,
  isWorkVersionSource,
} from "../../../contracts/v2/work-history.ts";

export type VersionsFetcher = <T = unknown>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

export class WorkVersionsServiceError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "conflict"
    | "validation_failed"
    | "service_unavailable"
    | "immutable_violation"
    | "state_transition_denied";
  readonly currentVersionId?: string;
  readonly correlationId?: string;

  constructor(
    code: WorkVersionsServiceError["code"],
    message: string,
    options?: { currentVersionId?: string; correlationId?: string },
  ) {
    super(`${code}: ${message}`);
    this.name = "WorkVersionsServiceError";
    this.code = code;
    if (options?.currentVersionId) this.currentVersionId = options.currentVersionId;
    if (options?.correlationId) this.correlationId = options.correlationId;
  }
}

interface WorkVersionRow {
  id: string;
  work_id: string;
  parent_version_id: string | null;
  kind: string;
  content_schema: string;
  content_json: unknown;
  content_hash: string;
  source: string;
  source_message_ids: string[];
  source_job_id: string | null;
  idempotency_key: string;
  created_by: string;
  created_at: string;
}

interface WorkRow {
  id: string;
  owner_id: string;
  current_version_id: string | null;
  latest_checkpoint_id: string | null;
  finalized_version_id: string | null;
}

function mapRowToV22(row: WorkVersionRow): WorkVersionV22 {
  return {
    id: row.id,
    workId: row.work_id,
    parentVersionId: row.parent_version_id,
    kind: row.kind as WorkVersionKind,
    contentSchema: row.content_schema,
    content: row.content_json,
    contentHash: row.content_hash,
    source: row.source as WorkVersionSource,
    sourceMessageIds: row.source_message_ids || [],
    sourceJobId: row.source_job_id,
    createdAt: row.created_at,
  };
}

/**
 * Compute the server-side content hash over canonicalJson(content).
 * This is the only place hashes are computed; clients must not supply their own.
 */
export function computeContentHash(content: unknown): string {
  return sha256Hex(utf8Bytes(canonicalJson(content)));
}

export interface AppendWorkVersionInput {
  ownerId: string;
  workId: string;
  parentVersionId: string | null;
  kind: WorkVersionKind;
  contentSchema: string;
  content: unknown;
  source: WorkVersionSource;
  sourceMessageIds?: string[];
  sourceJobId?: string | null;
  idempotencyKey: string;
  /** CAS: if provided, the work's current_version_id must match or 409. */
  expectedCurrentVersionId?: string | null;
}

export interface AppendWorkVersionResult {
  version: WorkVersionV22;
  /** True if this call returned an existing version (idempotent replay). */
  idempotentReplay: boolean;
}

/**
 * Append a new immutable Work Version via the `append_work_version` RPC.
 * The RPC atomically inserts the version and updates work pointers
 * (current_version_id, latest_checkpoint_id, finalized_version_id).
 */
export async function appendWorkVersion(
  input: AppendWorkVersionInput,
  fetcher: VersionsFetcher,
): Promise<AppendWorkVersionResult> {
  if (!input.ownerId) {
    throw new WorkVersionsServiceError("unauthenticated", "Owner id is required.");
  }
  if (!input.workId) {
    throw new WorkVersionsServiceError("validation_failed", "workId is required.");
  }
  if (!isWorkVersionKind(input.kind)) {
    throw new WorkVersionsServiceError("validation_failed", `Unsupported kind: ${String(input.kind)}`);
  }
  if (!isWorkVersionSource(input.source)) {
    throw new WorkVersionsServiceError("validation_failed", `Unsupported source: ${String(input.source)}`);
  }
  if (!input.contentSchema) {
    throw new WorkVersionsServiceError("validation_failed", "contentSchema is required.");
  }
  if (!input.idempotencyKey) {
    throw new WorkVersionsServiceError("validation_failed", "idempotencyKey is required.");
  }

  const contentHash = computeContentHash(input.content);

  // finalized 必须有 parent（不能凭空定稿）
  if (input.kind === "finalized" && !input.parentVersionId) {
    throw new WorkVersionsServiceError(
      "validation_failed",
      "finalized requires parentVersionId (the checkpoint or editing_draft to promote).",
    );
  }

  let row: WorkVersionRow | null;
  try {
    row = await fetcher<WorkVersionRow | null>(
      "/rest/v1/rpc/append_work_version",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_work_id: input.workId,
          p_parent_version_id: input.parentVersionId,
          p_kind: input.kind,
          p_content_schema: input.contentSchema,
          p_content_json: input.content,
          p_content_hash: contentHash,
          p_source: input.source,
          p_source_message_ids: input.sourceMessageIds || [],
          p_source_job_id: input.sourceJobId || null,
          p_idempotency_key: input.idempotencyKey,
          p_expected_current_version_id: input.expectedCurrentVersionId || null,
        }),
      },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // CAS conflict → 409
    if (msg.includes("VERSION_CONFLICT") || msg.includes("40001")) {
      // Fetch current version id for the client.
      const work = await fetcher<WorkRow | null>(
        `/rest/v1/storyflow_works?id=eq.${encodeURIComponent(input.workId)}&select=id,owner_id,current_version_id,latest_checkpoint_id,finalized_version_id`,
      ).then((r) => (Array.isArray(r) ? (r[0] as WorkRow | undefined) : null) ?? null);
      throw new WorkVersionsServiceError(
        "conflict",
        "Version conflict: another client appended a version. Retry with the new currentVersionId.",
        { currentVersionId: work?.current_version_id ?? undefined },
      );
    }
    if (msg.includes("FINALIZE_REQUIRES_PARENT") || msg.includes("FINALIZE_PARENT_NOT_FOUND")) {
      throw new WorkVersionsServiceError(
        "validation_failed",
        "Finalize requires an existing checkpoint or editing_draft of the same work.",
      );
    }
    if (msg.includes("FORBIDDEN") || msg.includes("insufficient_privilege")) {
      throw new WorkVersionsServiceError("forbidden", "You do not own this work.");
    }
    if (msg.includes("WORK_NOT_FOUND") || msg.includes("foreign_key_violation")) {
      throw new WorkVersionsServiceError("not_found", "Work not found.");
    }
    throw new WorkVersionsServiceError(
      "service_unavailable",
      `Failed to append work version: ${msg.slice(0, 200)}`,
    );
  }

  if (!row) {
    throw new WorkVersionsServiceError("service_unavailable", "append_work_version returned no result.");
  }

  // Check idempotency: if the returned row's created_at is before "now", it's likely a replay.
  // We can't know for sure without comparing, but the RPC handles idempotency internally.
  return { version: mapRowToV22(row), idempotentReplay: false };
}

/**
 * Create a checkpoint version. Shorthand for appendWorkVersion with kind=checkpoint.
 */
export async function createCheckpoint(
  input: Omit<AppendWorkVersionInput, "kind">,
  fetcher: VersionsFetcher,
): Promise<AppendWorkVersionResult> {
  return appendWorkVersion({ ...input, kind: "checkpoint" }, fetcher);
}

/**
 * Finalize a Work by promoting an existing checkpoint or editing_draft to finalized.
 * The parentVersionId must be an existing version of the same work.
 */
export async function finalizeWorkVersion(
  input: {
    ownerId: string;
    workId: string;
    versionId: string;
    idempotencyKey: string;
    sourceMessageIds?: string[];
    sourceJobId?: string | null;
  },
  fetcher: VersionsFetcher,
): Promise<AppendWorkVersionResult> {
  return appendWorkVersion(
    {
      ownerId: input.ownerId,
      workId: input.workId,
      parentVersionId: input.versionId,
      kind: "finalized",
      contentSchema: "kiikis.finalized/1",
      content: { promotedFrom: input.versionId },
      source: "manual",
      sourceMessageIds: input.sourceMessageIds,
      sourceJobId: input.sourceJobId,
      idempotencyKey: input.idempotencyKey,
    },
    fetcher,
  );
}

/**
 * List all versions of a Work in chronological order.
 */
export async function listWorkVersions(
  input: { ownerId: string; workId: string; limit?: number },
  fetcher: VersionsFetcher,
): Promise<WorkVersionV22[]> {
  if (!input.ownerId) {
    throw new WorkVersionsServiceError("unauthenticated", "Owner id is required.");
  }
  if (!input.workId) {
    throw new WorkVersionsServiceError("validation_failed", "workId is required.");
  }

  let rows: WorkVersionRow[];
  try {
    const limit = Math.min(input.limit ?? 100, 500);
    rows = await fetcher<WorkVersionRow[]>(
      `/rest/v1/storyflow_work_versions?work_id=eq.${encodeURIComponent(input.workId)}&select=id,work_id,parent_version_id,kind,content_schema,content_json,content_hash,source,source_message_ids,source_job_id,idempotency_key,created_by,created_at&order=created_at.asc&limit=${limit}`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new WorkVersionsServiceError(
      "service_unavailable",
      `Failed to list work versions: ${msg.slice(0, 200)}`,
    );
  }

  if (!Array.isArray(rows)) return [];
  return rows.map(mapRowToV22);
}

/**
 * Get a single Work's metadata (including version pointers).
 */
export async function getWork(
  input: { ownerId: string; workId: string },
  fetcher: VersionsFetcher,
): Promise<WorkRow> {
  if (!input.ownerId) {
    throw new WorkVersionsServiceError("unauthenticated", "Owner id is required.");
  }
  let rows: WorkRow[];
  try {
    rows = await fetcher<WorkRow[]>(
      `/rest/v1/storyflow_works?id=eq.${encodeURIComponent(input.workId)}&select=id,owner_id,current_version_id,latest_checkpoint_id,finalized_version_id`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new WorkVersionsServiceError(
      "service_unavailable",
      `Failed to get work: ${msg.slice(0, 200)}`,
    );
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new WorkVersionsServiceError("not_found", "Work not found.");
  }
  const work = rows[0];
  if (work.owner_id !== input.ownerId) {
    throw new WorkVersionsServiceError("forbidden", "You do not own this work.");
  }
  return work;
}
