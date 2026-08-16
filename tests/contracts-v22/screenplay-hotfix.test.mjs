/**
 * 2026-08-16 production hotfix — screenplay candidate flow & error contracts.
 *
 * Regression coverage for the incident class found on production:
 *   - messages persisted without work_id (NOT NULL violation)
 *   - candidates inserted with pending_review (CHECK violation before hotfix)
 *   - apply/reject via direct PATCH (blocked by P6 trigger before hotfix)
 *   - upstream Supabase errors swallowed into English "service unavailable"
 *
 * Run: node --test tests/contracts-v22/screenplay-hotfix.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ScreenplayGenerationService, ScreenplayGenerationError } from "../../lib/server/v2/screenplays/generation.ts";
import { classifyServiceError } from "../../lib/server/v2/service-errors.ts";
import { clientErrorMessage } from "../../lib/client/v2/screenplay-studio/api.ts";

// ---------------------------------------------------------------------------
// Test fetcher: records calls; returns queued rows per path.
// ---------------------------------------------------------------------------

function makeFetcher() {
  const calls = [];
  const rowsByPath = new Map();
  const queue = [];
  const fetcher = async (path, init) => {
    calls.push({ path, init });
    for (const [prefix, rows] of rowsByPath) {
      if (path.startsWith(prefix)) return rows;
    }
    if (queue.length) {
      const handler = queue.shift();
      return handler(path, init);
    }
    return [];
  };
  return {
    calls,
    fetcher,
    respond(prefix, rows) { rowsByPath.set(prefix, rows); },
    next(handler) { queue.push(handler); },
  };
}

const OWNER = "11111111-1111-1111-1111-111111111111";
const WORK = "22222222-2222-2222-2222-222222222222";
const THREAD = "kk-22222222-2222-2222-2222-222222222222";
const CANDIDATE = "33333333-3333-3333-3333-333333333333";
const VERSION = "44444444-4444-4444-4444-444444444444";

function baseDeps() {
  return {
    contextPacket: async () => ({ packetId: null, references: [] }),
    modelInvoke: async ({ userMessage }) => ({
      assistantText: `KK：${userMessage.slice(0, 10)}`,
      patches: [{ unitPath: "scope:current", before: "", after: "建议内容" }],
    }),
  };
}

function workRows() {
  return [{ id: WORK, owner_id: OWNER }];
}

// ---------------------------------------------------------------------------
// discuss / propose persistence shapes
// ---------------------------------------------------------------------------

test("discuss: appended messages carry work_id (NOT NULL column)", async () => {
  const fx = makeFetcher();
  fx.respond(`/rest/v1/storyflow_works?`, workRows());
  fx.respond(`/rest/v1/storyflow_conversation_threads?`, []);
  fx.respond(`/rest/v1/storyflow_conversation_messages?`, []);
  fx.next(async () => [{ id: THREAD, work_id: WORK }]);
  fx.next(async (path, init) => {
    assert.equal(path, "/rest/v1/storyflow_conversation_messages");
    const body = JSON.parse(init.body);
    assert.equal(body.work_id, WORK);
    return [{ id: "m1", work_id: WORK, thread_id: THREAD, role: "user", content: body.content, idempotency_key: body.idempotency_key }];
  });
  fx.next(async (path, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.work_id, WORK);
    assert.equal(body.role, "assistant");
    return [{ id: "m2", work_id: WORK, thread_id: THREAD, role: "assistant", content: body.content, idempotency_key: body.idempotency_key }];
  });

  const service = new ScreenplayGenerationService(fx.fetcher, baseDeps());
  const result = await service.discuss({ ownerId: OWNER, workId: WORK, conversationId: THREAD, userMessage: "你好" });
  assert.equal(result.assistantMessage.role, "assistant");
});

test("proposeChange: candidate is inserted with status pending_review", async () => {
  const fx = makeFetcher();
  fx.respond(`/rest/v1/storyflow_works?`, workRows());
  fx.respond(`/rest/v1/storyflow_conversation_threads?`, [{ id: THREAD, work_id: WORK }]);
  fx.respond(`/rest/v1/storyflow_generation_request_snapshots?`, []);
  fx.respond(`/rest/v1/storyflow_conversation_messages?`, []);
  // 1) append user message
  fx.next(async () => [{ id: "m1", work_id: WORK, thread_id: THREAD, role: "user", content: "加强冲突", idempotency_key: "k1" }]);
  // 2) snapshot POST
  fx.next(async (path, init) => {
    assert.equal(path, "/rest/v1/storyflow_generation_request_snapshots");
    const body = JSON.parse(init.body);
    assert.equal(body.scope_json.kind, "all");
    assert.ok(body.request_json);
    return [{ id: "snap1", work_id: WORK, base_version_id: VERSION, message_ids: ["m1"], context_packet_id: null, operation: "propose_change", idempotency_key: body.idempotency_key }];
  });
  // 3) assistant summary append
  fx.next(async () => [{ id: "m2", work_id: WORK, thread_id: THREAD, role: "assistant", content: "ok", idempotency_key: "k2" }]);
  // 4) candidate POST
  fx.next(async (path, init) => {
    assert.equal(path, "/rest/v1/storyflow_generation_candidates");
    const body = JSON.parse(init.body);
    assert.equal(body.status, "pending_review");
    assert.ok(Array.isArray(body.content_json.patches));
    return [{ id: CANDIDATE, request_id: "snap1", work_id: WORK, status: "pending_review", content_json: body.content_json, applied_version_id: null }];
  });

  const service = new ScreenplayGenerationService(fx.fetcher, baseDeps());
  const { candidate } = await service.proposeChange({
    ownerId: OWNER, workId: WORK, conversationId: THREAD,
    userMessage: "加强冲突", scope: { kind: "all" }, baseVersionId: VERSION,
  });
  assert.equal(candidate.status, "pending_review");
});

// ---------------------------------------------------------------------------
// Atomic RPC transitions
// ---------------------------------------------------------------------------

test("applyCandidate: uses apply_screenplay_candidate RPC with actor + filtered patches (no direct PATCH)", async () => {
  const fx = makeFetcher();
  fx.respond(`/rest/v1/storyflow_works?`, workRows());
  fx.respond(`/rest/v1/storyflow_generation_candidates?`, [{
    id: CANDIDATE, request_id: "snap1", work_id: WORK, status: "pending_review",
    content_json: { patches: [{ unitPath: "a", before: "x", after: "1" }, { unitPath: "b", before: "y", after: "2" }], baseVersionId: VERSION },
    applied_version_id: null,
  }]);
  fx.next(async (path, init) => {
    assert.equal(path, "/rest/v1/rpc/apply_screenplay_candidate");
    const body = JSON.parse(init.body);
    assert.equal(body.p_actor, OWNER);
    assert.equal(body.p_candidate_id, CANDIDATE);
    // 只有被接受的 hunk 进入版本内容
    assert.equal(body.p_content_json.patches.length, 1);
    assert.equal(body.p_content_json.patches[0].unitPath, "b");
    assert.ok(body.p_content_hash);
    return [{ candidate_id: CANDIDATE, new_version_id: VERSION }];
  });

  const service = new ScreenplayGenerationService(fx.fetcher, baseDeps());
  const result = await service.applyCandidate({ ownerId: OWNER, workId: WORK, candidateId: CANDIDATE, acceptedPatchIndexes: [1] });
  assert.equal(result.applied, true);
  assert.equal(result.version.id, VERSION);
  assert.ok(fx.calls.every((c) => c.init?.method !== "PATCH"), "no direct PATCH on candidates");
});

test("applyCandidate: rejects already-applied candidates with conflict", async () => {
  const fx = makeFetcher();
  fx.respond(`/rest/v1/storyflow_works?`, workRows());
  fx.respond(`/rest/v1/storyflow_generation_candidates?`, [{
    id: CANDIDATE, request_id: "snap1", work_id: WORK, status: "applied",
    content_json: { patches: [] }, applied_version_id: VERSION,
  }]);
  const service = new ScreenplayGenerationService(fx.fetcher, baseDeps());
  await assert.rejects(
    () => service.applyCandidate({ ownerId: OWNER, workId: WORK, candidateId: CANDIDATE, acceptedPatchIndexes: [0] }),
    (e) => e instanceof ScreenplayGenerationError && e.code === "conflict",
  );
});

test("rejectCandidate: uses reject_generation_candidate RPC with actor", async () => {
  const fx = makeFetcher();
  fx.respond(`/rest/v1/storyflow_works?`, workRows());
  fx.respond(`/rest/v1/storyflow_generation_candidates?`, [{
    id: CANDIDATE, request_id: "snap1", work_id: WORK, status: "pending_review",
    content_json: { patches: [] }, applied_version_id: null,
  }]);
  fx.next(async (path, init) => {
    assert.equal(path, "/rest/v1/rpc/reject_generation_candidate");
    const body = JSON.parse(init.body);
    assert.equal(body.p_actor, OWNER);
    assert.equal(body.p_candidate_id, CANDIDATE);
    return [{ candidate_id: CANDIDATE, status: "rejected" }];
  });
  const service = new ScreenplayGenerationService(fx.fetcher, baseDeps());
  const result = await service.rejectCandidate({ ownerId: OWNER, workId: WORK, candidateId: CANDIDATE });
  assert.equal(result.status, "rejected");
});

test("appendEvidence: writes work-scoped evidence events with actor", async () => {
  const fx = makeFetcher();
  fx.respond(`/rest/v1/storyflow_works?`, workRows());
  fx.next(async (path, init) => {
    assert.equal(path, "/rest/v1/storyflow_evidence_events");
    const body = JSON.parse(init.body);
    assert.equal(body.work_id, WORK);
    assert.equal(body.event_type, "work_scoped");
    assert.equal(body.kind, "similarity_review");
    assert.equal(body.created_by, OWNER);
    return [{ id: "e1" }];
  });
  const service = new ScreenplayGenerationService(fx.fetcher, baseDeps());
  await service.appendEvidence({ ownerId: OWNER, workId: WORK, kind: "similarity_review", payload: { outlineVersionId: VERSION } });
});

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

test("classifyServiceError: PGRST205 maps to schema_not_deployed/503 with requestId", () => {
  const err = new Error('SUPABASE_SERVICE_ERROR:404:{"code":"PGRST205","message":"Could not find the table \'public.storyflow_screenplay_units\' in the schema cache"}');
  const classified = classifyServiceError(err, "test-route");
  assert.equal(classified.code, "schema_not_deployed");
  assert.equal(classified.status, 503);
  assert.ok(classified.requestId.startsWith("req_"));
  assert.ok(!classified.message.includes("PGRST205"), "raw code must not leak to the client message");
});

test("classifyServiceError: PGRST204 (missing column) maps to schema_not_deployed", () => {
  const err = new Error('SUPABASE_SERVICE_ERROR:400:{"code":"PGRST204","message":"column not found"}');
  assert.equal(classifyServiceError(err, "r").code, "schema_not_deployed");
});

test("classifyServiceError: upstream 429 maps to rate_limited", () => {
  const err = new Error('SUPABASE_SERVICE_ERROR:429:{"message":"Too Many Requests"}');
  const classified = classifyServiceError(err, "r");
  assert.equal(classified.code, "rate_limited");
  assert.equal(classified.status, 429);
});

test("classifyServiceError: provider network failure maps to provider_failed", () => {
  const err = new Error("DEEPSEEK_TIMEOUT");
  assert.equal(classifyServiceError(err, "r").code, "provider_failed");
});

test("classifyServiceError: unknown upstream failure maps to service_unavailable (never raw message)", () => {
  const err = new Error('SUPABASE_SERVICE_ERROR:500:{"code":"XX999","message":"secret detail"}');
  const classified = classifyServiceError(err, "r");
  assert.equal(classified.code, "service_unavailable");
  assert.ok(!classified.message.includes("secret"));
});

// ---------------------------------------------------------------------------
// Client-side Chinese guidance
// ---------------------------------------------------------------------------

test("clientErrorMessage: Chinese guidance for safe codes", () => {
  assert.match(clientErrorMessage("schema_not_deployed", ""), /数据库结构尚未部署/);
  assert.match(clientErrorMessage("unauthenticated", ""), /重新登录/);
  assert.match(clientErrorMessage("service_unavailable", ""), /重试/);
  assert.match(clientErrorMessage("provider_failed", ""), /AI 服务/);
  assert.equal(clientErrorMessage("whatever", "fallback text"), "fallback text");
});
