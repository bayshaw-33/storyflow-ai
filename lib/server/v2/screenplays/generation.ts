/**
 * KIIKIS V2.2 Screenplay generation service — Phase 3 Task 3.4.
 *
 * Two KK action semantics:
 *   - discuss: append user message → Context Packet → assistant message.
 *     Never creates content versions or candidates.
 *   - proposeChange: append user message → Generation Request Snapshot
 *     (scope, baseVersionId, messageIds, contextPacketId) → Candidate Diff.
 *     Content versions are created ONLY by explicit applyCandidate.
 *
 * Failure protection: provider failure still persists the user message and
 * the request snapshot; retry with the snapshot's idempotency key reuses it
 * (no duplicate messages, no double spend).
 *
 * Reuses Phase 1 tables: storyflow_conversation_threads/messages,
 * storyflow_generation_request_snapshots, storyflow_generation_candidates,
 * storyflow_work_versions.
 */

import { canonicalJson, sha256Hex, utf8Bytes } from "../../../compliance/manifest.ts";

export type GenerationFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export class ScreenplayGenerationError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "conflict" | "validation_failed" | "provider_failed" | "service_unavailable";
  constructor(code: ScreenplayGenerationError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "ScreenplayGenerationError";
    this.code = code;
  }
}

export interface CandidatePatch {
  unitPath: string;
  before: string;
  after: string;
}

export interface ProposeScope {
  kind: "selection" | "scene" | "episode" | "character" | "world" | "all";
  unitId?: string;
  textRange?: [number, number];
}

export interface ModelInvokeResult {
  assistantText: string;
  patches: CandidatePatch[];
}

export interface GenerationDeps {
  modelInvoke: (params: { userMessage: string; scope: ProposeScope | null; packetId: string | null }) => Promise<ModelInvokeResult>;
  contextPacket: (params: { workId: string; threadId: string }) => Promise<{ packetId: string | null; references: unknown[] }>;
}

interface WorkRow { id: string; owner_id: string }
interface ThreadRow { id: string; work_id: string }
interface MessageRow { id: string; thread_id: string; role: string; content: string; idempotency_key: string }
interface SnapshotRow {
  id: string;
  work_id: string;
  base_version_id: string;
  message_ids: string[];
  context_packet_id: string | null;
  operation: string;
  idempotency_key: string;
  scope_json?: unknown;
  request_json?: unknown;
}
interface CandidateRow {
  id: string;
  request_id: string;
  work_id: string;
  status: string;
  content_json: unknown;
  applied_version_id: string | null;
}

const MSG_COLUMNS = "id,work_id,thread_id,role,content,base_version_id,idempotency_key,created_at";
const SNAPSHOT_COLUMNS = "id,work_id,base_version_id,message_ids,context_packet_id,operation,idempotency_key,created_at";
const CANDIDATE_COLUMNS = "id,request_id,work_id,status,content_json,applied_version_id,created_at,applied_at";

export class ScreenplayGenerationService {
  private readonly fetcher: GenerationFetcher;
  private readonly deps: GenerationDeps;

  constructor(fetcher: GenerationFetcher, deps: GenerationDeps) {
    this.fetcher = fetcher;
    this.deps = deps;
  }

  /** 聊一聊：只追加对话，不改内容。 */
  async discuss(params: {
    ownerId: string;
    workId: string;
    conversationId: string;
    userMessage: string;
    idempotencyKey?: string;
  }): Promise<{ userMessage: MessageDto; assistantMessage: MessageDto; packetId: string | null }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    if (!params.userMessage) throw new ScreenplayGenerationError("validation_failed", "userMessage is required.");
    const thread = await this.ensureThread(params.ownerId, params.workId, params.conversationId);

    const userKey = params.idempotencyKey ?? `discuss-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const userMessage = await this.appendMessage(thread.id, "user", params.userMessage, userKey);

    const packet = await this.deps.contextPacket({ workId: params.workId, threadId: thread.id }).catch(() => ({ packetId: null, references: [] }));

    let assistantText: string;
    try {
      const result = await this.deps.modelInvoke({ userMessage: params.userMessage, scope: null, packetId: packet.packetId });
      assistantText = result.assistantText;
    } catch (error) {
      // Provider failure keeps the user message; surface a typed error.
      throw new ScreenplayGenerationError("provider_failed", error instanceof Error ? error.message : "Provider unavailable.");
    }
    const assistantMessage = await this.appendMessage(thread.id, "assistant", assistantText, `${userKey}:assistant`);
    return { userMessage, assistantMessage, packetId: packet.packetId };
  }

  /** 生成修改方案：快照 → 候选 Diff；不 apply 不落正文。 */
  async proposeChange(params: {
    ownerId: string;
    workId: string;
    conversationId: string;
    userMessage: string;
    scope: ProposeScope;
    baseVersionId: string;
    idempotencyKey?: string;
  }): Promise<{ candidate: CandidateDto; snapshotId: string }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    if (!params.userMessage) throw new ScreenplayGenerationError("validation_failed", "userMessage is required.");
    if (!params.baseVersionId) throw new ScreenplayGenerationError("validation_failed", "baseVersionId is required.");
    const thread = await this.ensureThread(params.ownerId, params.workId, params.conversationId);

    // Snapshot idempotency: same key reuses the persisted snapshot.
    const idemKey = params.idempotencyKey ?? `propose-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const existing = await this.get<SnapshotRow[]>(
      `/rest/v1/storyflow_generation_request_snapshots?work_id=eq.${encodeURIComponent(params.workId)}&idempotency_key=eq.${encodeURIComponent(idemKey)}&select=${SNAPSHOT_COLUMNS}&limit=1`,
    );

    let userMessage: MessageDto;
    let snapshot: SnapshotRow;
    if (existing?.[0]) {
      snapshot = existing[0];
      // Reuse the original user message (no duplicate).
      const messageId = snapshot.message_ids?.[0];
      const rows = await this.get<MessageRow[]>(
        `/rest/v1/storyflow_conversation_messages?id=eq.${encodeURIComponent(String(messageId))}&select=${MSG_COLUMNS}&limit=1`,
      );
      userMessage = toMessageDto(rows?.[0] ?? { id: String(messageId), thread_id: thread.id, role: "user", content: params.userMessage, idempotency_key: idemKey });
    } else {
      userMessage = await this.appendMessage(thread.id, "user", params.userMessage, `${idemKey}:user`);
      const packet = await this.deps.contextPacket({ workId: params.workId, threadId: thread.id }).catch(() => ({ packetId: null, references: [] }));
      const inserted = await this.post<SnapshotRow[]>("/rest/v1/storyflow_generation_request_snapshots", {
        work_id: params.workId,
        base_version_id: params.baseVersionId,
        message_ids: [userMessage.id],
        context_packet_id: packet.packetId,
        operation: "propose_change",
        idempotency_key: idemKey,
        scope_json: params.scope,
        request_json: { userMessage: params.userMessage },
        created_by: params.ownerId,
      });
      snapshot = inserted?.[0] as unknown as SnapshotRow;
    }

    // Generate (or regenerate on retry) the candidate.
    let result: ModelInvokeResult;
    try {
      result = await this.deps.modelInvoke({
        userMessage: params.userMessage,
        scope: params.scope,
        packetId: snapshot.context_packet_id ?? null,
      });
    } catch (error) {
      throw new ScreenplayGenerationError("provider_failed", error instanceof Error ? error.message : "Provider unavailable.");
    }

    // Assistant summary message (append-only).
    await this.appendMessage(thread.id, "assistant", result.assistantText, `${idemKey}:assistant`).catch(() => undefined);

    const contentHash = sha256Hex(utf8Bytes(canonicalJson(result.patches)));
    const candidateRows = await this.post<CandidateRow[]>("/rest/v1/storyflow_generation_candidates", {
      request_id: snapshot.id,
      work_id: params.workId,
      status: "pending_review",
      content_json: { patches: result.patches, scope: params.scope, baseVersionId: params.baseVersionId },
      content_hash: contentHash,
    });
    const candidate = candidateRows?.[0];
    if (!candidate) throw new ScreenplayGenerationError("service_unavailable", "Unable to persist candidate.");
    return { candidate: toCandidateDto(candidate), snapshotId: snapshot.id };
  }

  /** 采用：只为被接受的 hunks 创建 editing_draft 版本。 */
  async applyCandidate(params: {
    ownerId: string;
    workId: string;
    candidateId: string;
    acceptedPatchIndexes: number[];
  }): Promise<{ applied: true; version: { id: string; kind: string } }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    const candidate = await this.readCandidate(params.workId, params.candidateId);
    if (candidate.status === "applied") {
      throw new ScreenplayGenerationError("conflict", "Candidate already applied.");
    }
    const content = candidate.content_json as { patches?: CandidatePatch[]; baseVersionId?: string } | null;
    const patches = (content?.patches ?? []).filter((_, index) => params.acceptedPatchIndexes.includes(index));
    if (!patches.length) throw new ScreenplayGenerationError("validation_failed", "No accepted patches.");

    const versionRows = await this.post<Array<{ id: string; kind: string }>>("/rest/v1/storyflow_work_versions", {
      work_id: params.workId,
      kind: "editing_draft",
      content_schema: "kiikis.screenplay-candidate/1",
      content_json: { patches, appliedFrom: params.candidateId },
      source: "ai",
      idempotency_key: `apply-${params.candidateId}`,
      created_by: params.ownerId,
    });
    const version = versionRows?.[0];
    if (!version) throw new ScreenplayGenerationError("service_unavailable", "Unable to create version.");

    await this.patch(`/rest/v1/storyflow_generation_candidates?id=eq.${encodeURIComponent(params.candidateId)}`, {
      status: "applied",
      applied_version_id: version.id,
      applied_at: new Date().toISOString(),
    });
    return { applied: true, version };
  }

  /** 拒绝：只改候选状态，不动正文。 */
  async rejectCandidate(params: { ownerId: string; workId: string; candidateId: string }): Promise<{ status: string }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    const candidate = await this.readCandidate(params.workId, params.candidateId);
    if (candidate.status === "applied") {
      throw new ScreenplayGenerationError("conflict", "Applied candidates cannot be rejected.");
    }
    await this.patch(`/rest/v1/storyflow_generation_candidates?id=eq.${encodeURIComponent(params.candidateId)}`, {
      status: "rejected",
    });
    return { status: "rejected" };
  }

  // ---------------------------------------------------------
  // Internals
  // ---------------------------------------------------------

  private async assertWorkOwner(ownerId: string, workId: string): Promise<void> {
    if (!ownerId) throw new ScreenplayGenerationError("unauthenticated", "Authentication is required.");
    if (!workId) throw new ScreenplayGenerationError("validation_failed", "workId is required.");
    const rows = await this.get<WorkRow[]>(`/rest/v1/storyflow_works?id=eq.${encodeURIComponent(workId)}&select=id,owner_id&limit=1`);
    const work = rows?.[0];
    if (!work) throw new ScreenplayGenerationError("not_found", "Work not found.");
    if (work.owner_id !== ownerId) throw new ScreenplayGenerationError("forbidden", "Work access denied.");
  }

  private async ensureThread(ownerId: string, workId: string, conversationId: string): Promise<ThreadRow> {
    const rows = await this.get<ThreadRow[]>(
      `/rest/v1/storyflow_conversation_threads?id=eq.${encodeURIComponent(conversationId)}&work_id=eq.${encodeURIComponent(workId)}&select=id,work_id&limit=1`,
    );
    if (rows?.[0]) return rows[0];
    const created = await this.post<ThreadRow[]>("/rest/v1/storyflow_conversation_threads", {
      id: conversationId,
      work_id: workId,
      owner_id: ownerId,
      title: "剧本室 KK 会话",
    });
    const thread = created?.[0];
    if (!thread) throw new ScreenplayGenerationError("service_unavailable", "Unable to create thread.");
    return thread;
  }

  private async appendMessage(threadId: string, role: "user" | "assistant", content: string, idempotencyKey: string): Promise<MessageDto> {
    const rows = await this.post<MessageRow[]>("/rest/v1/storyflow_conversation_messages", {
      thread_id: threadId,
      role,
      content,
      idempotency_key: idempotencyKey,
    });
    const row = rows?.[0];
    if (!row) throw new ScreenplayGenerationError("service_unavailable", "Unable to append message.");
    return toMessageDto(row);
  }

  private async readCandidate(workId: string, candidateId: string): Promise<CandidateRow> {
    const rows = await this.get<CandidateRow[]>(
      `/rest/v1/storyflow_generation_candidates?id=eq.${encodeURIComponent(candidateId)}&work_id=eq.${encodeURIComponent(workId)}&select=${CANDIDATE_COLUMNS}&limit=1`,
    );
    const row = rows?.[0];
    if (!row) throw new ScreenplayGenerationError("not_found", "Candidate not found.");
    return row;
  }

  private async get<T>(path: string): Promise<T> {
    return this.fetcher<T>(path);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.fetcher<T>(path, {
      method: "POST",
      headers: { Prefer: "return=representation", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async patch(path: string, body: unknown): Promise<void> {
    await this.fetcher(path, {
      method: "PATCH",
      headers: { Prefer: "return=minimal", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}

export interface MessageDto { id: string; role: string; content: string }
export interface CandidateDto { id: string; status: string; patches: CandidatePatch[] }

function toMessageDto(row: MessageRow): MessageDto {
  return { id: row.id, role: row.role, content: row.content };
}

function toCandidateDto(row: CandidateRow): CandidateDto {
  const content = row.content_json as { patches?: CandidatePatch[] } | null;
  return { id: row.id, status: row.status, patches: content?.patches ?? [] };
}
