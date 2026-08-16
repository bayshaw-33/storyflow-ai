/**
 * KIIKIS V2.2 Work History contracts — Phase 1 Task 1.1.
 *
 * Extends the Phase 0 Work identity with immutable version chain, conversation
 * ledger, generation request snapshots and candidate lifecycle. All V2.2
 * constants are additive; the legacy V2 `CONTRACT_VERSION = "2.0.0-alpha.1"`
 * in `lib/contracts/v2/index.ts` is intentionally left untouched so existing
 * consumers keep working.
 *
 * contract_version = 2.2.0-alpha.1 (same as WORK_CONTRACT_VERSION in work.ts).
 *
 * Persistence-agnostic DTOs: DB row names, storage paths and provider metadata
 * stay in server adapters and never cross the v2.2 API boundary.
 */

import { WORK_CONTRACT_VERSION } from "./work.ts";

export const KIIKIS_22_CONTRACT_VERSION = WORK_CONTRACT_VERSION;
export type Kiikis22ContractVersion = typeof KIIKIS_22_CONTRACT_VERSION;

// ---------------------------------------------------------------------------
// Work Version
// ---------------------------------------------------------------------------

export const WORK_VERSION_KINDS = [
  "editing_draft",
  "checkpoint",
  "finalized",
] as const;
export type WorkVersionKind = (typeof WORK_VERSION_KINDS)[number];

export const WORK_VERSION_SOURCES = [
  "manual",
  "ai",
  "import",
  "restore",
] as const;
export type WorkVersionSource = (typeof WORK_VERSION_SOURCES)[number];

/**
 * Immutable snapshot of Work content at a point in time.
 *
 * - `editing_draft`: free-form editing; the only mutable kind (via child
 *   versions, never in-place update).
 * - `checkpoint`: immutable marker; referenced by downstream Work or Phase 2
 *   Manifest.
 * - `finalized`: authoritative version used for handoff / publish / license;
 *   cannot be updated or deleted.
 *
 * `contentHash` is computed server-side over `canonicalJson(content)`; clients
 * must never supply their own hash.
 */
export interface WorkVersionV22 {
  id: string;
  workId: string;
  parentVersionId: string | null;
  kind: WorkVersionKind;
  /** Schema URI identifying the shape of `content`, e.g. `kiikis.script/1`. */
  contentSchema: string;
  content: unknown;
  contentHash: string;
  source: WorkVersionSource;
  /** Conversation message IDs that produced this version (AI source). */
  sourceMessageIds: string[];
  /** Generation job that produced this version (AI source), null otherwise. */
  sourceJobId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Conversation Ledger
// ---------------------------------------------------------------------------

export const CONVERSATION_ROLES = ["user", "assistant", "system"] as const;
export type ConversationRole = (typeof CONVERSATION_ROLES)[number];

/**
 * Append-only message in a Work conversation thread. Messages are immutable
 * once persisted; clients may never modify or delete them.
 */
export interface ConversationMessageV22 {
  id: string;
  workId: string;
  threadId: string;
  role: ConversationRole;
  content: string;
  /** Work version active when this message was authored (context). */
  baseVersionId: string | null;
  idempotencyKey: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Generation Request Snapshot & Candidate
// ---------------------------------------------------------------------------

export const GENERATION_OPERATIONS = [
  "discuss",
  "propose_change",
  "generate",
  "update",
] as const;
export type GenerationOperation = (typeof GENERATION_OPERATIONS)[number];

export const CANDIDATE_STATUSES = [
  "ready",
  "pending_review",
  "applied",
  "rejected",
  "superseded",
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

/**
 * Snapshot of a generation request captured at submission time. Captures the
 * base version and conversation messages so the result can be replayed and
 * audited without depending on React state.
 */
export interface GenerationRequestSnapshotV22 {
  id: string;
  workId: string;
  baseVersionId: string;
  /** Conversation message IDs that formed the request input. */
  messageIds: string[];
  /** Optional context packet (Phase 2) referenced by this request. */
  contextPacketId: string | null;
  operation: GenerationOperation;
  idempotencyKey: string;
  createdAt: string;
}

/**
 * A candidate output from a generation request. Candidates transition
 * `ready → applied | rejected | superseded` atomically; applying a candidate
 * creates a new Work Version in the same transaction.
 */
export interface GenerationCandidateV22 {
  id: string;
  requestId: string;
  workId: string;
  status: CandidateStatus;
  /** Proposed content; schema matches the request's base version contentSchema. */
  content: unknown;
  contentHash: string;
  /** Work version created when this candidate was applied; null otherwise. */
  appliedVersionId: string | null;
  createdAt: string;
  appliedAt: string | null;
}

// ---------------------------------------------------------------------------
// Contract errors & type guards
// ---------------------------------------------------------------------------

export class WorkHistoryContractError extends Error {
  readonly code:
    | "validation_failed"
    | "invalid_contract_version"
    | "immutable_violation"
    | "state_transition_denied";
  readonly field?: string;

  constructor(
    code: WorkHistoryContractError["code"],
    message: string,
    field?: string,
  ) {
    super(message);
    this.name = "WorkHistoryContractError";
    this.code = code;
    this.field = field;
  }
}

export function isWorkVersionKind(value: unknown): value is WorkVersionKind {
  return (
    typeof value === "string" &&
    (WORK_VERSION_KINDS as readonly string[]).includes(value)
  );
}

export function isWorkVersionSource(value: unknown): value is WorkVersionSource {
  return (
    typeof value === "string" &&
    (WORK_VERSION_SOURCES as readonly string[]).includes(value)
  );
}

export function isConversationRole(value: unknown): value is ConversationRole {
  return (
    typeof value === "string" &&
    (CONVERSATION_ROLES as readonly string[]).includes(value)
  );
}

export function isGenerationOperation(value: unknown): value is GenerationOperation {
  return (
    typeof value === "string" &&
    (GENERATION_OPERATIONS as readonly string[]).includes(value)
  );
}

export function isCandidateStatus(value: unknown): value is CandidateStatus {
  return (
    typeof value === "string" &&
    (CANDIDATE_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Validate a WorkVersionV22 DTO. Throws WorkHistoryContractError on violation.
 *
 * Rules (PRD Task 1.1 Step 1 RED):
 *   - workId must be non-empty
 *   - kind must be one of WORK_VERSION_KINDS
 *   - contentSchema must be non-empty
 *   - contentHash must be non-empty (64-char sha256 hex expected)
 *   - source must be one of WORK_VERSION_SOURCES
 *   - finalized kind requires sourceMessageIds or sourceJobId (provenance)
 *   - createdAt must be a valid ISO string
 */
export function assertWorkVersion(value: unknown): asserts value is WorkVersionV22 {
  if (typeof value !== "object" || value === null) {
    throw new WorkHistoryContractError("validation_failed", "WorkVersion must be an object");
  }
  const v = value as Record<string, unknown>;

  if (typeof v.id !== "string" || v.id.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "id is required", "id");
  }
  if (typeof v.workId !== "string" || v.workId.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "workId must be non-empty", "workId");
  }
  if (!isWorkVersionKind(v.kind)) {
    throw new WorkHistoryContractError("validation_failed", `Unsupported kind: ${String(v.kind)}`, "kind");
  }
  if (typeof v.contentSchema !== "string" || v.contentSchema.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "contentSchema must be non-empty", "contentSchema");
  }
  if (typeof v.contentHash !== "string" || v.contentHash.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "contentHash must be non-empty", "contentHash");
  }
  if (!isWorkVersionSource(v.source)) {
    throw new WorkHistoryContractError("validation_failed", `Unsupported source: ${String(v.source)}`, "source");
  }
  if (!Array.isArray(v.sourceMessageIds) || !v.sourceMessageIds.every((m) => typeof m === "string")) {
    throw new WorkHistoryContractError("validation_failed", "sourceMessageIds must be string[]", "sourceMessageIds");
  }
  if (v.sourceJobId !== null && typeof v.sourceJobId !== "string") {
    throw new WorkHistoryContractError("validation_failed", "sourceJobId must be string or null", "sourceJobId");
  }
  if (v.parentVersionId !== null && typeof v.parentVersionId !== "string") {
    throw new WorkHistoryContractError("validation_failed", "parentVersionId must be string or null", "parentVersionId");
  }
  if (typeof v.createdAt !== "string" || Number.isNaN(Date.parse(v.createdAt))) {
    throw new WorkHistoryContractError("validation_failed", "createdAt must be a valid ISO string", "createdAt");
  }
  // finalized 必须有来源（provenance）：sourceMessageIds 或 sourceJobId 至少一个
  if (v.kind === "finalized") {
    const hasMessageProvenance = Array.isArray(v.sourceMessageIds) && v.sourceMessageIds.length > 0;
    const hasJobProvenance = typeof v.sourceJobId === "string" && v.sourceJobId.length > 0;
    if (!hasMessageProvenance && !hasJobProvenance) {
      throw new WorkHistoryContractError(
        "validation_failed",
        "finalized version requires provenance (sourceMessageIds or sourceJobId)",
        "sourceMessageIds",
      );
    }
  }
}

export function isWorkVersion(value: unknown): value is WorkVersionV22 {
  try {
    assertWorkVersion(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a ConversationMessageV22 DTO.
 * - role must be one of CONVERSATION_ROLES
 * - content must be a string (empty allowed for system markers)
 * - idempotencyKey must be non-empty
 */
export function assertConversationMessage(value: unknown): asserts value is ConversationMessageV22 {
  if (typeof value !== "object" || value === null) {
    throw new WorkHistoryContractError("validation_failed", "ConversationMessage must be an object");
  }
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || v.id.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "id is required", "id");
  }
  if (typeof v.workId !== "string" || v.workId.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "workId must be non-empty", "workId");
  }
  if (typeof v.threadId !== "string" || v.threadId.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "threadId must be non-empty", "threadId");
  }
  if (!isConversationRole(v.role)) {
    throw new WorkHistoryContractError("validation_failed", `Unsupported role: ${String(v.role)}`, "role");
  }
  if (typeof v.content !== "string") {
    throw new WorkHistoryContractError("validation_failed", "content must be a string", "content");
  }
  if (typeof v.idempotencyKey !== "string" || v.idempotencyKey.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "idempotencyKey must be non-empty", "idempotencyKey");
  }
  if (typeof v.createdAt !== "string" || Number.isNaN(Date.parse(v.createdAt))) {
    throw new WorkHistoryContractError("validation_failed", "createdAt must be a valid ISO string", "createdAt");
  }
}

/**
 * Validate a GenerationRequestSnapshotV22 DTO.
 * - operation must be one of GENERATION_OPERATIONS
 * - messageIds must be a non-empty string[] (generate/update require persisted input)
 * - baseVersionId must be non-empty
 */
export function assertGenerationRequest(value: unknown): asserts value is GenerationRequestSnapshotV22 {
  if (typeof value !== "object" || value === null) {
    throw new WorkHistoryContractError("validation_failed", "GenerationRequestSnapshot must be an object");
  }
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || v.id.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "id is required", "id");
  }
  if (typeof v.workId !== "string" || v.workId.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "workId must be non-empty", "workId");
  }
  if (typeof v.baseVersionId !== "string" || v.baseVersionId.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "baseVersionId must be non-empty", "baseVersionId");
  }
  if (!Array.isArray(v.messageIds) || !v.messageIds.every((m) => typeof m === "string")) {
    throw new WorkHistoryContractError("validation_failed", "messageIds must be string[]", "messageIds");
  }
  if (!isGenerationOperation(v.operation)) {
    throw new WorkHistoryContractError("validation_failed", `Unsupported operation: ${String(v.operation)}`, "operation");
  }
  if (typeof v.idempotencyKey !== "string" || v.idempotencyKey.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "idempotencyKey must be non-empty", "idempotencyKey");
  }
  if (typeof v.createdAt !== "string" || Number.isNaN(Date.parse(v.createdAt))) {
    throw new WorkHistoryContractError("validation_failed", "createdAt must be a valid ISO string", "createdAt");
  }
}

/**
 * Validate a GenerationCandidateV22 DTO.
 * - status must be one of CANDIDATE_STATUSES
 * - contentHash must be non-empty
 * - appliedVersionId must be string (when status=applied) or null
 */
export function assertGenerationCandidate(value: unknown): asserts value is GenerationCandidateV22 {
  if (typeof value !== "object" || value === null) {
    throw new WorkHistoryContractError("validation_failed", "GenerationCandidate must be an object");
  }
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || v.id.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "id is required", "id");
  }
  if (typeof v.requestId !== "string" || v.requestId.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "requestId must be non-empty", "requestId");
  }
  if (typeof v.workId !== "string" || v.workId.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "workId must be non-empty", "workId");
  }
  if (!isCandidateStatus(v.status)) {
    throw new WorkHistoryContractError("validation_failed", `Unsupported status: ${String(v.status)}`, "status");
  }
  if (typeof v.contentHash !== "string" || v.contentHash.length === 0) {
    throw new WorkHistoryContractError("validation_failed", "contentHash must be non-empty", "contentHash");
  }
  if (v.appliedVersionId !== null && typeof v.appliedVersionId !== "string") {
    throw new WorkHistoryContractError("validation_failed", "appliedVersionId must be string or null", "appliedVersionId");
  }
  // applied 状态必须有 appliedVersionId 和 appliedAt
  if (v.status === "applied") {
    if (typeof v.appliedVersionId !== "string" || v.appliedVersionId.length === 0) {
      throw new WorkHistoryContractError("validation_failed", "applied candidate must have appliedVersionId", "appliedVersionId");
    }
    if (typeof v.appliedAt !== "string" || Number.isNaN(Date.parse(v.appliedAt))) {
      throw new WorkHistoryContractError("validation_failed", "applied candidate must have valid appliedAt", "appliedAt");
    }
  }
  if (typeof v.createdAt !== "string" || Number.isNaN(Date.parse(v.createdAt))) {
    throw new WorkHistoryContractError("validation_failed", "createdAt must be a valid ISO string", "createdAt");
  }
}

/**
 * Assert that the contract version matches KIIKIS_22_CONTRACT_VERSION.
 * Does NOT affect the legacy 2.0.0-alpha.1 assertContractVersion in index.ts.
 */
export function assertKiikis22ContractVersion(version: unknown): asserts version is Kiikis22ContractVersion {
  if (version !== KIIKIS_22_CONTRACT_VERSION) {
    throw new WorkHistoryContractError(
      "invalid_contract_version",
      `Expected ${KIIKIS_22_CONTRACT_VERSION}, received ${String(version)}`,
    );
  }
}
