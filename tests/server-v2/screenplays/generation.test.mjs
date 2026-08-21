/**
 * Phase 3 Task 3.4 — KK discuss / propose-change semantics.
 *
 * Verifies (PRD Task 3.4 Step 1 RED):
 *   - discuss: appends user message → Context Packet → assistant message;
 *     NEVER creates a content version; work content hash unchanged
 *   - propose_change: appends user message → Generation Snapshot →
 *     Candidate Diff; content version only on explicit apply
 *   - candidates apply per-hunk (accept/reject); unapplied candidates never
 *     touch the body
 *   - scope capture: selection / scene / episode / character / world / all
 *   - failure protection: generation failure keeps input, messages, current
 *     body and old candidates; retry reuses the request snapshot (no double
 *     spend, no duplicate messages)
 *
 * Run: node --test tests/server-v2/screenplays/generation.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ScreenplayGenerationService,
  ScreenplayGenerationError,
} from "../../../lib/server/v2/screenplays/generation.ts";

const OWNER = "owner-001";
const OTHER = "owner-002";
const WORK = "work-001";

function makeStore() {
  const tables = {
    storyflow_works: [{ id: WORK, owner_id: OWNER }],
    storyflow_conversation_threads: [],
    storyflow_conversation_messages: [],
    storyflow_generation_request_snapshots: [],
    storyflow_work_versions: [],
    storyflow_generation_candidates: [],
    storyflow_context_packets: [],
  };
  let seq = 0;
  const nextId = (prefix) => `${prefix}-${String(++seq).padStart(3, "0")}`;

  const fetcher = async (path, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = new URL(path, "https://db.local");
    const table = url.pathname.replace("/rest/v1/", "");
    const rpc = url.pathname.replace("/rest/v1/rpc/", "");
    const rows = tables[table];

    if (method === "GET" && rows) {
      let filtered = [...rows];
      for (const [key, rawValue] of url.searchParams.entries()) {
        if (["order", "limit", "select"].includes(key)) continue;
        const m = /^(eq|is|in)\.(.*)$/.exec(rawValue);
        if (m) {
          if (m[1] === "in") {
            const list = m[2].replace(/[()]/g, "").split(",").map((s) => s.trim());
            filtered = filtered.filter((r) => list.includes(String(r[key])));
          } else {
            filtered = filtered.filter((r) => (m[1] === "is" && m[2] === "null" ? r[key] === null : String(r[key]) === m[2]));
          }
        } else filtered = filtered.filter((r) => String(r[key]) === rawValue);
      }
      const order = url.searchParams.get("order");
      if (order) {
        const [field, dir] = order.split(".");
        filtered = [...filtered].sort((a, b) => (dir === "desc" ? String(b[field]).localeCompare(String(a[field])) : String(a[field]).localeCompare(String(b[field]))));
      }
      const limit = Number(url.searchParams.get("limit") ?? filtered.length);
      const select = url.searchParams.get("select");
      if (select) {
        const fields = select.split(",");
        filtered = filtered.slice(0, limit).map((row) => { const out = {}; for (const f of fields) out[f] = row[f]; return out; });
      }
      return filtered.slice(0, limit);
    }

    if (method === "POST") {
      // Minimal RPC doubles for the atomic candidate transitions used by the service.
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        if (rpc === "apply_screenplay_candidate") {
          const candidate = tables.storyflow_generation_candidates.find((row) => row.id === body.p_candidate_id);
          if (!candidate) return [];
          candidate.status = "applied";
          const version = {
            id: nextId("version"),
            work_id: candidate.work_id,
            kind: "editing_draft",
            content_json: body.p_content_json,
          };
          tables.storyflow_work_versions.push(version);
          return [{ candidate_id: candidate.id, new_version_id: version.id }];
        }
        if (rpc === "reject_generation_candidate") {
          const candidate = tables.storyflow_generation_candidates.find((row) => row.id === body.p_candidate_id);
          if (!candidate) return [];
          candidate.status = "rejected";
          return [{ candidate_id: candidate.id, status: candidate.status }];
        }
        // Context packet RPC passthrough.
        return { rpc, ok: true, packetId: `packet-${++seq}` };
      }
      const body = JSON.parse(String(init?.body ?? "{}"));
      const inserted = (Array.isArray(body) ? body : [body]).map((b) => ({
        ...b,
        id: b.id ?? nextId(table),
        created_at: new Date(1700000000000 + seq * 1000).toISOString(),
      }));
      rows.push(...inserted);
      return inserted;
    }

    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const idCond = url.searchParams.get("id");
      const targets = rows.filter((r) => r.id === idCond.slice(3));
      for (const t of targets) Object.assign(t, body);
      return targets;
    }

    throw new Error(`Unsupported ${method} ${path}`);
  };

  return { fetcher, tables };
}

function makeService(overrides = {}) {
  const store = makeStore();
  const service = new ScreenplayGenerationService(store.fetcher, {
    // Deterministic test double for the model provider.
    modelInvoke: async () => ({ assistantText: "KK：这版开头节奏更快，建议保留。", patches: [{ unitPath: "scene:1", before: "夜。城市废墟。", after: "黎明前。城市废墟静得可怕。" }] }),
    contextPacket: async () => ({ packetId: "packet-test", references: [] }),
    ...overrides,
  });
  return { service, store };
}

// ============================================================
// 1. discuss: append-only conversation, no content versions
// ============================================================

test("discuss appends user+assistant messages and never creates content versions", async () => {
  const { service, store } = makeService();
  const result = await service.discuss({
    ownerId: OWNER,
    workId: WORK,
    conversationId: "conv-1",
    userMessage: "这场戏结尾是不是太突然？",
  });
  assert.ok(result.userMessage.id);
  assert.ok(result.assistantMessage.id);
  assert.equal(result.assistantMessage.role, "assistant");
  // messages persisted
  const messages = store.tables.storyflow_conversation_messages;
  assert.equal(messages.length, 2);
  // NO content version, NO candidate
  assert.equal(store.tables.storyflow_generation_request_snapshots.length, 0);
  assert.equal(store.tables.storyflow_generation_candidates.length, 0);
});

test("a generated trilogy document can append a persisted assistant notice without another model call", async () => {
  let modelCalls = 0;
  const { service, store } = makeService({
    modelInvoke: async () => {
      modelCalls += 1;
      return { assistantText: "unused", patches: [] };
    },
  });

  const message = await service.appendAssistantMessage({
    ownerId: OWNER,
    workId: WORK,
    conversationId: "conv-trilogy-notice",
    content: "背景及世界观草稿已生成。",
    idempotencyKey: "trilogy-world-1:assistant",
  });

  assert.equal(message.role, "assistant");
  assert.equal(message.content, "背景及世界观草稿已生成。");
  assert.equal(modelCalls, 0);
  assert.equal(store.tables.storyflow_conversation_messages.length, 1);
});

// ============================================================
// 2. propose_change: snapshot → candidate diff; apply-only persistence
// ============================================================

test("propose_change creates candidate diff but body unchanged until apply", async () => {
  const { service, store } = makeService();
  const result = await service.proposeChange({
    ownerId: OWNER,
    workId: WORK,
    conversationId: "conv-2",
    userMessage: "把第一场开头改得更有悬念",
    scope: { kind: "scene", unitId: "unit-scene-1" },
    baseVersionId: "uv-001",
  });
  assert.ok(result.candidate.id);
  assert.equal(result.candidate.status, "pending_review");
  assert.ok(Array.isArray(result.candidate.patches) && result.candidate.patches.length > 0);
  // snapshot records scope, baseVersion, messageIds, packetId
  const snapshot = store.tables.storyflow_generation_request_snapshots[0];
  assert.equal((snapshot.scope_json ?? {}).kind, "scene");
  assert.equal(snapshot.base_version_id, "uv-001");
  assert.ok(Array.isArray(snapshot.message_ids) && snapshot.message_ids.length >= 1);
  assert.ok(snapshot.context_packet_id);
});

test("apply creates version only for accepted hunks; reject leaves body untouched", async () => {
  const { service, store } = makeService();
  const { candidate } = await service.proposeChange({
    ownerId: OWNER,
    workId: WORK,
    conversationId: "conv-3",
    userMessage: "改一版",
    scope: { kind: "all" },
    baseVersionId: "uv-002",
  });
  // apply with only the first hunk accepted
  const applied = await service.applyCandidate({
    ownerId: OWNER,
    workId: WORK,
    candidateId: candidate.id,
    acceptedPatchIndexes: [0],
  });
  assert.equal(applied.applied, true);
  assert.equal(applied.version.kind, "editing_draft");
  const row = store.tables.storyflow_generation_candidates.find((c) => c.id === candidate.id);
  assert.equal(row.status, "applied");

  // reject path
  const second = await service.proposeChange({
    ownerId: OWNER,
    workId: WORK,
    conversationId: "conv-3",
    userMessage: "再改一版",
    scope: { kind: "all" },
    baseVersionId: "uv-002",
  });
  const rejected = await service.rejectCandidate({ ownerId: OWNER, workId: WORK, candidateId: second.candidate.id });
  assert.equal(rejected.status, "rejected");
  // rejected candidate never created a version
  assert.equal(store.tables.storyflow_generation_candidates.filter((c) => c.status === "applied").length, 1);
});

// ============================================================
// 3. Failure protection
// ============================================================

test("generation failure keeps input/messages/body/old candidates; retry reuses snapshot", async () => {
  let invokeCount = 0;
  const { service, store } = makeService({
    modelInvoke: async () => {
      invokeCount += 1;
      if (invokeCount === 1) throw new Error("provider 503");
      return { assistantText: "ok", patches: [{ unitPath: "scene:1", before: "a", after: "b" }] };
    },
  });
  await assert.rejects(
    () =>
      service.proposeChange({
        ownerId: OWNER,
        workId: WORK,
        conversationId: "conv-4",
        userMessage: "帮我改",
        scope: { kind: "all" },
        baseVersionId: "uv-003",
      }),
    (e) => e instanceof ScreenplayGenerationError,
  );
  // user message persisted even though generation failed
  const messages = store.tables.storyflow_conversation_messages.filter((m) => m.thread_id === "conv-4");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, "user");
  // snapshot persisted for retry (with same idempotency semantics)
  const snapshots = store.tables.storyflow_generation_request_snapshots;
  assert.equal(snapshots.length, 1);

  // retry with same idempotency key → reuses snapshot, single candidate, no duplicate messages
  const retried = await service.proposeChange({
    ownerId: OWNER,
    workId: WORK,
    conversationId: "conv-4",
    userMessage: "帮我改",
    scope: { kind: "all" },
    baseVersionId: "uv-003",
    idempotencyKey: snapshots[0].idempotency_key ?? undefined,
  });
  assert.ok(retried.candidate.id);
  assert.equal(store.tables.storyflow_generation_request_snapshots.length, 1);
  const finalMessages = store.tables.storyflow_conversation_messages.filter((m) => m.thread_id === "conv-4");
  assert.equal(finalMessages.length, 2); // original user msg + assistant
});

// ============================================================
// 4. Access control
// ============================================================

test("non-owner and unauthenticated are rejected", async () => {
  const { service } = makeService();
  await assert.rejects(
    () => service.discuss({ ownerId: OTHER, workId: WORK, conversationId: "c", userMessage: "hi" }),
    (e) => e instanceof ScreenplayGenerationError && e.code === "forbidden",
  );
  await assert.rejects(
    () => service.discuss({ ownerId: "", workId: WORK, conversationId: "c", userMessage: "hi" }),
    (e) => e instanceof ScreenplayGenerationError && e.code === "unauthenticated",
  );
});
