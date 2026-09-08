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
 * Apply/reject use owner-checked RPCs (apply_screenplay_candidate /
 * reject_generation_candidate, 2026-08-16 hotfix): the candidate and its
 * accepted Work Version transition together. The screenplay-unit projection
 * is then written idempotently, so an interrupted response can resume
 * without losing the accepted record or replacing a newer document.
 *
 * Reuses Phase 1 tables: storyflow_conversation_threads/messages,
 * storyflow_generation_request_snapshots, storyflow_generation_candidates,
 * storyflow_work_versions.
 */

import { canonicalJson, sha256Hex, utf8Bytes } from "../../../compliance/manifest.ts";
import { ScreenplayUnitsService } from "./units.ts";
import { applyScreenplayPatches } from "./patches.ts";

export type GenerationFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export class ScreenplayGenerationError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "conflict" | "validation_failed" | "provider_failed" | "schema_not_deployed" | "service_unavailable";
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

export type KkPurpose = "discuss" | "propose_change" | "similarity_review";

export interface ModelInvokeResult {
  assistantText: string;
  patches: CandidatePatch[];
}

/** Everything the model router needs; built by the service + route deps. */
export interface ModelInvokeParams {
  userMessage: string;
  purpose: KkPurpose;
  scope: ProposeScope | null;
  packetId: string | null;
  packetContent: unknown;
  references: unknown[];
  history: Array<{ role: "user" | "assistant"; content: string }>;
  unit: { type: string; title: string; body: string } | null;
  clientContext?: string | null;
}

export interface GenerationDeps {
  modelInvoke: (params: ModelInvokeParams) => Promise<ModelInvokeResult>;
  contextPacket: (params: { workId: string; threadId: string }) => Promise<{ packetId: string | null; packetContent?: unknown; references: unknown[] }>;
  /** Loads the current unit content for propose scopes (route-provided). */
  loadUnit?: (workId: string, unitId: string) => Promise<{ type: string; title: string; body: string } | null>;
}

interface WorkRow { id: string; owner_id: string }
interface ThreadRow { id: string; work_id: string }
interface MessageRow {
  id: string;
  work_id?: string;
  thread_id: string;
  role: string;
  content: string;
  idempotency_key: string;
  created_at?: string;
}
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

interface ApplyRpcRow { candidate_id: string; new_version_id: string }
interface RejectRpcRow { candidate_id: string; status: string }
interface WorkVersionRow { id: string; work_id: string; content_json: unknown }

const MSG_COLUMNS = "id,work_id,thread_id,role,content,base_version_id,idempotency_key,created_at";
const SNAPSHOT_COLUMNS = "id,work_id,base_version_id,message_ids,context_packet_id,operation,idempotency_key,request_json,created_at";
const CANDIDATE_COLUMNS = "id,request_id,work_id,status,content_json,applied_version_id,created_at,applied_at";
const HISTORY_LIMIT = 12;

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
    purpose?: KkPurpose;
    clientContext?: string | null;
    idempotencyKey?: string;
  }): Promise<{ userMessage: MessageDto; assistantMessage: MessageDto; packetId: string | null }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    if (!params.userMessage) throw new ScreenplayGenerationError("validation_failed", "userMessage is required.");
    const thread = await this.ensureThread(params.ownerId, params.workId, params.conversationId);

    const userKey = params.idempotencyKey ?? `discuss-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const history = await this.readHistory(thread.id);
    const userMessage = await this.appendMessage(thread.id, params.workId, "user", params.userMessage, userKey);

    const packet = await this.deps.contextPacket({ workId: params.workId, threadId: thread.id }).catch(() => ({ packetId: null as string | null, packetContent: null, references: [] as unknown[] }));

    let assistantText: string;
    try {
      const result = await this.deps.modelInvoke({
        userMessage: params.userMessage,
        purpose: params.purpose ?? "discuss",
        scope: null,
        packetId: packet.packetId,
        packetContent: packet.packetContent ?? null,
        references: packet.references ?? [],
        history,
        unit: null,
        clientContext: params.clientContext ?? null,
      });
      assistantText = result.assistantText;
    } catch (error) {
      // Provider failure keeps the user message; surface a typed error.
      throw new ScreenplayGenerationError("provider_failed", error instanceof Error ? error.message : "Provider unavailable.");
    }
    const assistantMessage = await this.appendMessage(thread.id, params.workId, "assistant", assistantText, `${userKey}:assistant`);
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
    clientContext?: string | null;
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
      const cached = await this.get<CandidateRow[]>(`/rest/v1/storyflow_generation_candidates?request_id=eq.${encodeURIComponent(snapshot.id)}&select=${CANDIDATE_COLUMNS}&order=created_at.desc&limit=1`);
      if (cached?.[0]) return { candidate: toCandidateDto(cached[0]), snapshotId: snapshot.id };
      // Reuse the original user message (no duplicate).
      const messageId = snapshot.message_ids?.[0];
      const rows = await this.get<MessageRow[]>(
        `/rest/v1/storyflow_conversation_messages?id=eq.${encodeURIComponent(String(messageId))}&select=${MSG_COLUMNS}&limit=1`,
      );
      userMessage = toMessageDto(rows?.[0] ?? { id: String(messageId), thread_id: thread.id, role: "user", content: params.userMessage, idempotency_key: idemKey });
    } else {
      userMessage = await this.appendMessage(thread.id, params.workId, "user", params.userMessage, `${idemKey}:user`);
      const packet = await this.deps.contextPacket({ workId: params.workId, threadId: thread.id }).catch(() => ({ packetId: null as string | null, packetContent: null, references: [] as unknown[] }));
      const inserted = await this.post<SnapshotRow[]>("/rest/v1/storyflow_generation_request_snapshots", {
        work_id: params.workId,
        base_version_id: params.baseVersionId,
        message_ids: [userMessage.id],
        // Content-addressed ctx_* IDs are not database UUIDs. Preserve them in the JSON snapshot.
        context_packet_id: packet.packetId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(packet.packetId) ? packet.packetId : null,
        operation: "propose_change",
        idempotency_key: idemKey,
        scope_json: params.scope,
        request_json: { userMessage: params.userMessage, packetId: packet.packetId, packetContent: packet.packetContent ?? null, references: packet.references },
        created_by: params.ownerId,
      });
      snapshot = inserted?.[0] as unknown as SnapshotRow;
    }

    // Generate (or regenerate on retry) the candidate.
    const units = new ScreenplayUnitsService(this.fetcher);
    const unitState = params.scope.unitId
      ? await units.getUnit({ ownerId: params.ownerId, workId: params.workId, unitId: params.scope.unitId })
      : null;
    const unit = unitState ? {
      type: unitState.unit.type,
      title: unitState.unit.title,
      body: String((unitState.content as { body?: string } | null)?.body ?? ""),
    } : null;
    const capturedVersionId = unitState?.unit.currentVersionId ?? null;
    const request = snapshot.request_json as { packetId?: string | null; packetContent?: unknown; references?: unknown[] } | null;
    let result: ModelInvokeResult;
    try {
      result = await this.deps.modelInvoke({
        userMessage: params.userMessage,
        purpose: "propose_change",
        scope: params.scope,
        packetId: request?.packetId ?? snapshot.context_packet_id ?? null,
        packetContent: request?.packetContent ?? null,
        references: request?.references ?? [],
        history: await this.readHistory(thread.id, userMessage.id),
        unit,
        clientContext: params.clientContext ?? null,
      });
    } catch (error) {
      throw new ScreenplayGenerationError("provider_failed", error instanceof Error ? error.message : "Provider unavailable.");
    }

    // Assistant summary message (append-only).
    await this.appendMessage(thread.id, params.workId, "assistant", result.assistantText, `${idemKey}:assistant`).catch(() => undefined);

    const latestUnit = params.scope.unitId
      ? await units.getUnit({ ownerId: params.ownerId, workId: params.workId, unitId: params.scope.unitId })
      : null;
    // Capture the exact unit version used by the model, never a newer body.
    if (latestUnit && latestUnit.unit.currentVersionId !== capturedVersionId) {
      throw new ScreenplayGenerationError("conflict", "Document changed during generation; generate again.");
    }
    const contentHash = sha256Hex(utf8Bytes(canonicalJson(result.patches)));
    const candidateRows = await this.post<CandidateRow[]>("/rest/v1/storyflow_generation_candidates", {
      request_id: snapshot.id,
      work_id: params.workId,
      status: "pending_review",
      content_json: { patches: result.patches, scope: params.scope, baseVersionId: params.baseVersionId, unitVersionId: capturedVersionId },
      content_hash: contentHash,
    });
    const candidate = candidateRows?.[0];
    if (!candidate) throw new ScreenplayGenerationError("service_unavailable", "Unable to persist candidate.");
    return { candidate: toCandidateDto(candidate), snapshotId: snapshot.id };
  }

  /** 采用：先原子记录接受结果，再幂等投影到对应剧本文档。 */
  async applyCandidate(params: {
    ownerId: string;
    workId: string;
    candidateId: string;
    acceptedPatchIndexes: number[];
  }): Promise<{ applied: true; version: { id: string; kind: string } }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    const candidate = await this.readCandidate(params.workId, params.candidateId);
    let content = candidate.content_json as { patches?: CandidatePatch[]; baseVersionId?: string; scope?: ProposeScope; unitVersionId?: string | null } | null;
    let patches: CandidatePatch[];
    let versionId: string;

    if (candidate.status === "applied") {
      if (!candidate.applied_version_id) {
        throw new ScreenplayGenerationError("service_unavailable", "Applied candidate is missing its accepted version.");
      }
      const versions = await this.get<WorkVersionRow[]>(
        `/rest/v1/storyflow_work_versions?id=eq.${encodeURIComponent(candidate.applied_version_id)}&work_id=eq.${encodeURIComponent(params.workId)}&select=id,work_id,content_json&limit=1`,
      );
      const accepted = versions?.[0]?.content_json as { appliedFrom?: string; patches?: CandidatePatch[]; scope?: ProposeScope; baseVersionId?: string } | null;
      if (!versions?.[0] || accepted?.appliedFrom !== candidate.id || !Array.isArray(accepted.patches)) {
        throw new ScreenplayGenerationError("service_unavailable", "Accepted candidate record is incomplete.");
      }
      content = {
        ...(content ?? {}),
        scope: accepted.scope ?? content?.scope,
        baseVersionId: accepted.baseVersionId ?? content?.baseVersionId,
        patches: accepted.patches,
      };
      patches = accepted.patches;
      versionId = candidate.applied_version_id;
    } else if (candidate.status !== "pending_review" && candidate.status !== "ready") {
      throw new ScreenplayGenerationError("conflict", `Candidate is ${candidate.status}; only pending candidates can be applied.`);
    } else {
      patches = (content?.patches ?? []).filter((_, index) => params.acceptedPatchIndexes.includes(index));
      if (!patches.length) throw new ScreenplayGenerationError("validation_failed", "No accepted patches.");
      versionId = "";
    }
    if (!content?.scope?.unitId) {
      throw new ScreenplayGenerationError("validation_failed", "请打开要修改的文档，重新生成修改方案。");
    }

    if (!versionId) {
      const current = await new ScreenplayUnitsService(this.fetcher).getUnit({
        ownerId: params.ownerId,
        workId: params.workId,
        unitId: content.scope.unitId,
      });
      if (content.unitVersionId === undefined || current.unit.currentVersionId !== content.unitVersionId) {
        throw new ScreenplayGenerationError("conflict", "Document changed; generate a new proposal.");
      }
      const versionContent = {
        patches,
        appliedFrom: params.candidateId,
        scope: content.scope,
        baseVersionId: content.baseVersionId ?? null,
      };
      const contentHash = sha256Hex(utf8Bytes(canonicalJson(versionContent)));
      let rows: ApplyRpcRow[];
      try {
        rows = await this.post<ApplyRpcRow[]>("/rest/v1/rpc/apply_screenplay_candidate", {
          p_actor: params.ownerId,
          p_candidate_id: params.candidateId,
          p_content_schema: "kiikis.screenplay-candidate/1",
          p_content_json: versionContent,
          p_content_hash: contentHash,
          p_idempotency_key: `apply-${params.candidateId}`,
        });
      } catch {
        throw new ScreenplayGenerationError("service_unavailable", "Unable to record accepted candidate.");
      }
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row?.new_version_id) throw new ScreenplayGenerationError("service_unavailable", "Unable to apply candidate.");
      versionId = row.new_version_id;
    }

    await this.materializeAcceptedUnit({
      ownerId: params.ownerId,
      workId: params.workId,
      candidateId: params.candidateId,
      scope: content.scope,
      unitVersionId: content.unitVersionId,
      patches,
    });
    return { applied: true, version: { id: versionId, kind: "editing_draft" } };
  }

  /** 拒绝：原子 RPC 只改候选状态，不动正文。 */
  async rejectCandidate(params: { ownerId: string; workId: string; candidateId: string }): Promise<{ status: string }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    const candidate = await this.readCandidate(params.workId, params.candidateId);
    if (candidate.status === "applied") {
      throw new ScreenplayGenerationError("conflict", "Applied candidates cannot be rejected.");
    }
    const rows = await this.post<RejectRpcRow[]>("/rest/v1/rpc/reject_generation_candidate", {
      p_actor: params.ownerId,
      p_candidate_id: params.candidateId,
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new ScreenplayGenerationError("service_unavailable", "Unable to reject candidate.");
    return { status: row.status };
  }

  /** 会话历史（刷新恢复用）。 */
  async listMessages(params: {
    ownerId: string;
    workId: string;
    conversationId: string;
    limit?: number;
    before?: string | null;
  }): Promise<{ messages: MessageDto[]; hasMore: boolean; nextBefore: string | null }> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    const thread = await this.findThread(params.workId, params.conversationId);
    if (!thread) return { messages: [], hasMore: false, nextBefore: null };
    const limit = Math.min(Math.max(params.limit ?? 30, 1), 50);
    const beforeFilter = params.before ? `&created_at=lt.${encodeURIComponent(params.before)}` : "";
    const rows = await this.get<MessageRow[]>(
      `/rest/v1/storyflow_conversation_messages?thread_id=eq.${encodeURIComponent(thread.id)}${beforeFilter}&select=${MSG_COLUMNS}&order=created_at.desc&limit=${limit + 1}`,
    );
    const page = (rows ?? []).slice(0, limit);
    const oldest = page[page.length - 1];
    return {
      messages: page.reverse().map(toMessageDto),
      hasMore: (rows ?? []).length > limit,
      nextBefore: oldest?.created_at ?? null,
    };
  }

  /** Persist a non-model assistant notice in the same screenplay conversation. */
  async appendAssistantMessage(params: {
    ownerId: string;
    workId: string;
    conversationId: string;
    content: string;
    idempotencyKey: string;
  }): Promise<MessageDto> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    if (!params.content.trim() || !params.idempotencyKey.trim()) {
      throw new ScreenplayGenerationError("validation_failed", "content and idempotencyKey are required.");
    }
    const thread = await this.ensureThread(params.ownerId, params.workId, params.conversationId);
    const existing = await this.get<MessageRow[]>(
      `/rest/v1/storyflow_conversation_messages?thread_id=eq.${encodeURIComponent(thread.id)}&idempotency_key=eq.${encodeURIComponent(params.idempotencyKey)}&select=${MSG_COLUMNS}&limit=1`,
    );
    if (existing?.[0]) return toMessageDto(existing[0]);
    return this.appendMessage(thread.id, params.workId, "assistant", params.content.trim(), params.idempotencyKey);
  }

  /** 追加一条证据事件（雷同审查等需留痕的动作）。 */
  async appendEvidence(params: {
    ownerId: string;
    workId: string;
    kind: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.assertWorkOwner(params.ownerId, params.workId);
    await this.post("/rest/v1/storyflow_evidence_events", {
      work_id: params.workId,
      event_type: "work_scoped",
      kind: params.kind,
      payload_json: params.payload,
      created_by: params.ownerId,
    });
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
    const existing = await this.findThread(workId, conversationId);
    if (existing) return existing;
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

  private async findThread(workId: string, conversationId: string): Promise<ThreadRow | null> {
    const rows = await this.get<ThreadRow[]>(
      `/rest/v1/storyflow_conversation_threads?id=eq.${encodeURIComponent(conversationId)}&work_id=eq.${encodeURIComponent(workId)}&select=id,work_id&limit=1`,
    );
    return rows?.[0] ?? null;
  }

  private async appendMessage(threadId: string, workId: string, role: "user" | "assistant", content: string, idempotencyKey: string): Promise<MessageDto> {
    const rows = await this.post<MessageRow[]>("/rest/v1/storyflow_conversation_messages", {
      thread_id: threadId,
      work_id: workId,
      role,
      content,
      idempotency_key: idempotencyKey,
    });
    const row = rows?.[0];
    if (!row) throw new ScreenplayGenerationError("service_unavailable", "Unable to append message.");
    return toMessageDto(row);
  }

  private async readHistory(threadId: string, excludeMessageId?: string): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    const rows = await this.get<MessageRow[]>(
      `/rest/v1/storyflow_conversation_messages?thread_id=eq.${encodeURIComponent(threadId)}&select=id,role,content&order=created_at.desc&limit=${HISTORY_LIMIT}`,
    ).catch(() => [] as MessageRow[]);
    return (rows ?? [])
      .filter((r) => r.id !== excludeMessageId && (r.role === "user" || r.role === "assistant"))
      .reverse()
      .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
  }

  private async readCandidate(workId: string, candidateId: string): Promise<CandidateRow> {
    const rows = await this.get<CandidateRow[]>(
      `/rest/v1/storyflow_generation_candidates?id=eq.${encodeURIComponent(candidateId)}&work_id=eq.${encodeURIComponent(workId)}&select=${CANDIDATE_COLUMNS}&limit=1`,
    );
    const row = rows?.[0];
    if (!row) throw new ScreenplayGenerationError("not_found", "Candidate not found.");
    return row;
  }

  private async materializeAcceptedUnit(params: {
    ownerId: string;
    workId: string;
    candidateId: string;
    scope: ProposeScope;
    unitVersionId: string | null | undefined;
    patches: CandidatePatch[];
  }): Promise<void> {
    const unitId = params.scope.unitId;
    if (!unitId) throw new ScreenplayGenerationError("validation_failed", "请打开要修改的文档，重新生成修改方案。");
    const units = new ScreenplayUnitsService(this.fetcher);
    const input = { ownerId: params.ownerId, workId: params.workId, unitId };
    const idempotencyKey = `candidate-unit:${params.candidateId}:${sha256Hex(utf8Bytes(canonicalJson(params.patches)))}`;
    const existing = await units.findUnitVersionByIdempotencyKey({ ...input, idempotencyKey });
    if (existing) {
      const current = await units.getUnit(input);
      if (current.unit.currentVersionId === existing.id) return;
      if (current.unit.currentVersionId !== existing.parentVersionId) {
        throw new ScreenplayGenerationError("conflict", "Document changed after the accepted proposal. Keep the newer version and review history.");
      }
      const restored = await this.fetcher<Array<{ id: string }>>(
        `/rest/v1/storyflow_screenplay_units?id=eq.${encodeURIComponent(unitId)}&work_id=eq.${encodeURIComponent(params.workId)}&current_version_id=${existing.parentVersionId ? `eq.${encodeURIComponent(existing.parentVersionId)}` : "is.null"}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({ current_version_id: existing.id, readiness: "draft" }),
        },
      );
      if (!restored?.length) throw new ScreenplayGenerationError("conflict", "Document changed during retry.");
      return;
    }

    const current = await units.getUnit(input);
    if (params.unitVersionId === undefined || current.unit.currentVersionId !== params.unitVersionId) {
      throw new ScreenplayGenerationError("conflict", "Document changed; generate a new proposal.");
    }
    let body: string;
    try {
      body = applyScreenplayPatches(String((current.content as { body?: string } | null)?.body ?? ""), params.patches);
    } catch {
      throw new ScreenplayGenerationError("conflict", "Patch text is stale or ambiguous. Generate a new proposal.");
    }
    await units.saveUnitContent({
      ...input,
      content: { ...((current.content as Record<string, unknown>) ?? {}), body },
      baseVersionId: params.unitVersionId,
      source: "ai",
      idempotencyKey,
    });
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
}

export interface MessageDto { id: string; role: string; content: string; createdAt: string | null }
export interface CandidateDto { id: string; unitId: string | null; status: string; patches: CandidatePatch[] }

function toMessageDto(row: MessageRow): MessageDto {
  return { id: row.id, role: row.role, content: row.content, createdAt: row.created_at ?? null };
}

function toCandidateDto(row: CandidateRow): CandidateDto {
  const content = row.content_json as { patches?: CandidatePatch[]; scope?: ProposeScope } | null;
  return { id: row.id, unitId: content?.scope?.unitId ?? null, status: row.status, patches: content?.patches ?? [] };
}
