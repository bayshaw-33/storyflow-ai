/**
 * KIIKIS V2.2 Generation Snapshot service — Phase 1 Task 1.3.
 *
 * Captures generation request snapshots and candidate lifecycle:
 *   - createGenerationRequest: snapshot the base version + message IDs
 *   - applyCandidate: atomically create a new Work Version + mark candidate applied
 *
 * "先保存输入, 再生成" transaction boundary: generate/update requests must
 * reference already-persisted user messages. Empty input must reference an
 * explicit existing message set — never React async state.
 */

import {
  type GenerationRequestSnapshotV22,
  type GenerationCandidateV22,
  type GenerationOperation,
  type CandidateStatus,
  isGenerationOperation,
  isCandidateStatus,
} from "../../../contracts/v2/work-history.ts";

export type GenerationsFetcher = <T = unknown>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

export class GenerationsServiceError extends Error {
  readonly code:
    | "unauthenticated"
    | "forbidden"
    | "not_found"
    | "conflict"
    | "validation_failed"
    | "service_unavailable"
    | "state_transition_denied";
  readonly correlationId?: string;

  constructor(
    code: GenerationsServiceError["code"],
    message: string,
    correlationId?: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "GenerationsServiceError";
    this.code = code;
    this.correlationId = correlationId;
  }
}

interface RequestRow {
  id: string;
  work_id: string;
  base_version_id: string;
  message_ids: string[];
  context_packet_id: string | null;
  operation: string;
  idempotency_key: string;
  created_by: string;
  created_at: string;
}

interface CandidateRow {
  id: string;
  request_id: string;
  work_id: string;
  status: string;
  content_json: unknown;
  content_hash: string;
  applied_version_id: string | null;
  created_at: string;
  applied_at: string | null;
}

function mapRequestRowToV22(row: RequestRow): GenerationRequestSnapshotV22 {
  return {
    id: row.id,
    workId: row.work_id,
    baseVersionId: row.base_version_id,
    messageIds: row.message_ids || [],
    contextPacketId: row.context_packet_id,
    operation: row.operation as GenerationOperation,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

function mapCandidateRowToV22(row: CandidateRow): GenerationCandidateV22 {
  return {
    id: row.id,
    requestId: row.request_id,
    workId: row.work_id,
    status: row.status as CandidateStatus,
    content: row.content_json,
    contentHash: row.content_hash,
    appliedVersionId: row.applied_version_id,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
  };
}

export interface CreateGenerationRequestInput {
  ownerId: string;
  workId: string;
  baseVersionId: string;
  messageIds: string[];
  contextPacketId?: string | null;
  operation: GenerationOperation;
  idempotencyKey: string;
}

/**
 * Create a generation request snapshot. The messageIds must reference
 * already-persisted conversation messages — this enforces the "先保存输入,
 * 再生成" boundary (PRD Task 1.3 Step 3).
 *
 * generate/update operations require at least one messageId.
 */
export async function createGenerationRequest(
  input: CreateGenerationRequestInput,
  fetcher: GenerationsFetcher,
): Promise<GenerationRequestSnapshotV22> {
  if (!input.ownerId) {
    throw new GenerationsServiceError("unauthenticated", "Owner id is required.");
  }
  if (!input.workId) {
    throw new GenerationsServiceError("validation_failed", "workId is required.");
  }
  if (!input.baseVersionId) {
    throw new GenerationsServiceError("validation_failed", "baseVersionId is required.");
  }
  if (!isGenerationOperation(input.operation)) {
    throw new GenerationsServiceError("validation_failed", `Unsupported operation: ${String(input.operation)}`);
  }
  if (!Array.isArray(input.messageIds) || !input.messageIds.every((m) => typeof m === "string")) {
    throw new GenerationsServiceError("validation_failed", "messageIds must be string[]");
  }
  // generate/update require at least one persisted message (PRD Task 1.3 Step 3)
  if ((input.operation === "generate" || input.operation === "update") && input.messageIds.length === 0) {
    throw new GenerationsServiceError(
      "validation_failed",
      `${input.operation} requires at least one persisted message ID (先保存输入, 再生成).`,
    );
  }
  if (!input.idempotencyKey) {
    throw new GenerationsServiceError("validation_failed", "idempotencyKey is required.");
  }

  let row: RequestRow | null;
  try {
    const rows = await fetcher<RequestRow[]>(
      `/rest/v1/storyflow_generation_request_snapshots`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation,resolution=merge-duplicates",
        },
        body: JSON.stringify({
          work_id: input.workId,
          base_version_id: input.baseVersionId,
          message_ids: input.messageIds,
          context_packet_id: input.contextPacketId || null,
          operation: input.operation,
          idempotency_key: input.idempotencyKey,
          created_by: input.ownerId,
        }),
      },
    );
    row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("23505") || msg.includes("duplicate")) {
      // Idempotent replay
      const existing = await fetcher<RequestRow[]>(
        `/rest/v1/storyflow_generation_request_snapshots?work_id=eq.${encodeURIComponent(input.workId)}&idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}&select=*`,
      ).then((r) => (Array.isArray(r) ? r[0] : null) ?? null);
      if (existing) return mapRequestRowToV22(existing);
    }
    throw new GenerationsServiceError(
      "service_unavailable",
      `Failed to create generation request: ${msg.slice(0, 200)}`,
    );
  }

  if (!row) {
    throw new GenerationsServiceError("service_unavailable", "Request insert returned no result.");
  }
  return mapRequestRowToV22(row);
}

/**
 * Add a candidate to a generation request. Candidates start in `ready` status.
 */
export async function addGenerationCandidate(
  input: {
    ownerId: string;
    requestId: string;
    workId: string;
    content: unknown;
    contentHash: string;
  },
  fetcher: GenerationsFetcher,
): Promise<GenerationCandidateV22> {
  if (!input.ownerId) {
    throw new GenerationsServiceError("unauthenticated", "Owner id is required.");
  }
  if (!input.requestId) {
    throw new GenerationsServiceError("validation_failed", "requestId is required.");
  }
  if (!input.contentHash) {
    throw new GenerationsServiceError("validation_failed", "contentHash is required.");
  }

  let row: CandidateRow | null;
  try {
    const rows = await fetcher<CandidateRow[]>(
      `/rest/v1/storyflow_generation_candidates`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({
          request_id: input.requestId,
          work_id: input.workId,
          status: "ready",
          content_json: input.content,
          content_hash: input.contentHash,
        }),
      },
    );
    row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new GenerationsServiceError(
      "service_unavailable",
      `Failed to add candidate: ${msg.slice(0, 200)}`,
    );
  }

  if (!row) {
    throw new GenerationsServiceError("service_unavailable", "Candidate insert returned no result.");
  }
  return mapCandidateRowToV22(row);
}

/**
 * Apply a candidate: atomically create a new Work Version (editing_draft) and
 * mark the candidate as applied. Uses the `apply_generation_candidate` RPC.
 *
 * If the candidate was already applied, returns the existing appliedVersionId
 * (idempotent).
 */
export async function applyCandidate(
  input: {
    ownerId: string;
    candidateId: string;
    contentSchema: string;
    idempotencyKey: string;
  },
  fetcher: GenerationsFetcher,
): Promise<{ candidateId: string; newVersionId: string; idempotentReplay: boolean }> {
  if (!input.ownerId) {
    throw new GenerationsServiceError("unauthenticated", "Owner id is required.");
  }
  if (!input.candidateId) {
    throw new GenerationsServiceError("validation_failed", "candidateId is required.");
  }
  if (!input.contentSchema) {
    throw new GenerationsServiceError("validation_failed", "contentSchema is required.");
  }
  if (!input.idempotencyKey) {
    throw new GenerationsServiceError("validation_failed", "idempotencyKey is required.");
  }

  let result: { candidate_id: string; new_version_id: string } | null;
  try {
    result = await fetcher<{ candidate_id: string; new_version_id: string }>(
      "/rest/v1/rpc/apply_generation_candidate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_actor: input.ownerId,
          p_candidate_id: input.candidateId,
          p_content_schema: input.contentSchema,
          p_idempotency_key: input.idempotencyKey,
        }),
      },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("CANDIDATE_NOT_FOUND") || msg.includes("foreign_key_violation")) {
      throw new GenerationsServiceError("not_found", "Candidate not found.");
    }
    if (msg.includes("CANDIDATE_NOT_READY")) {
      throw new GenerationsServiceError(
        "state_transition_denied",
        "Candidate is not in ready status (already applied/rejected/superseded).",
      );
    }
    if (msg.includes("FORBIDDEN") || msg.includes("insufficient_privilege")) {
      throw new GenerationsServiceError("forbidden", "You do not own this work.");
    }
    throw new GenerationsServiceError(
      "service_unavailable",
      `Failed to apply candidate: ${msg.slice(0, 200)}`,
    );
  }

  if (!result || !result.candidate_id || !result.new_version_id) {
    throw new GenerationsServiceError("service_unavailable", "apply_generation_candidate returned no result.");
  }

  // Check if this was an idempotent replay by looking at the candidate status.
  const candidate = await fetcher<CandidateRow[]>(
    `/rest/v1/storyflow_generation_candidates?id=eq.${encodeURIComponent(input.candidateId)}&select=id,status,applied_version_id,applied_at`,
  ).then((r) => (Array.isArray(r) ? r[0] : null) ?? null);

  const idempotentReplay = candidate?.applied_at !== null &&
    candidate?.applied_at !== undefined &&
    new Date(candidate.applied_at).getTime() < Date.now() - 1000; // applied more than 1s ago → likely replay

  return {
    candidateId: result.candidate_id,
    newVersionId: result.new_version_id,
    idempotentReplay: Boolean(idempotentReplay),
  };
}

/**
 * List candidates for a generation request.
 */
export async function listCandidates(
  input: { ownerId: string; requestId: string },
  fetcher: GenerationsFetcher,
): Promise<GenerationCandidateV22[]> {
  if (!input.ownerId) {
    throw new GenerationsServiceError("unauthenticated", "Owner id is required.");
  }
  let rows: CandidateRow[];
  try {
    rows = await fetcher<CandidateRow[]>(
      `/rest/v1/storyflow_generation_candidates?request_id=eq.${encodeURIComponent(input.requestId)}&select=id,request_id,work_id,status,content_json,content_hash,applied_version_id,created_at,applied_at&order=created_at.asc`,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new GenerationsServiceError(
      "service_unavailable",
      `Failed to list candidates: ${msg.slice(0, 200)}`,
    );
  }
  if (!Array.isArray(rows)) return [];
  return rows.map(mapCandidateRowToV22);
}
