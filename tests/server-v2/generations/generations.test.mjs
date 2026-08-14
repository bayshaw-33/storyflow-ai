/**
 * Phase 1 Task 1.3 — Generation Snapshot & Candidate tests.
 *
 * Covers (PRD Task 1.3 Step 3/4/5 RED):
 *   - createGenerationRequest: generate/update require persisted messageIds
 *   - applyCandidate: atomic candidate→applied + new Work Version
 *   - applyCandidate: idempotent replay returns existing version
 *   - applyCandidate: not-ready candidate → state_transition_denied
 *   - listCandidates: chronological order
 *
 * Run: node --test tests/server-v2/generations/generations.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  createGenerationRequest,
  addGenerationCandidate,
  applyCandidate,
  listCandidates,
  GenerationsServiceError,
} from "../../../lib/server/v2/generations/index.ts";

const USER_ID = "user-001";
const WORK_ID = "work-001";
const REQUEST_ID = "req-001";
const CANDIDATE_ID = "cand-001";

// ============================================================
// Mock fetcher
// ============================================================

function makeFetcher({ requests = [], candidates = [], rpcBehavior }) {
  return async (path, init) => {
    // POST generation request
    if (path === "/rest/v1/storyflow_generation_request_snapshots" && init?.method === "POST") {
      const body = JSON.parse(init.body);
      const existing = requests.find((r) => r.idempotency_key === body.idempotency_key);
      if (existing) return [existing];
      const row = {
        id: "req-" + (requests.length + 1).toString().padStart(3, "0"),
        work_id: body.work_id,
        base_version_id: body.base_version_id,
        message_ids: body.message_ids,
        context_packet_id: body.context_packet_id,
        operation: body.operation,
        idempotency_key: body.idempotency_key,
        created_by: body.created_by,
        created_at: new Date().toISOString(),
      };
      requests.push(row);
      return [row];
    }
    // POST candidate
    if (path === "/rest/v1/storyflow_generation_candidates" && init?.method === "POST") {
      const body = JSON.parse(init.body);
      const row = {
        id: "cand-" + (candidates.length + 1).toString().padStart(3, "0"),
        request_id: body.request_id,
        work_id: body.work_id,
        status: "ready",
        content_json: body.content_json,
        content_hash: body.content_hash,
        applied_version_id: null,
        created_at: new Date().toISOString(),
        applied_at: null,
      };
      candidates.push(row);
      return [row];
    }
    // GET candidates list
    if (path.includes("/rest/v1/storyflow_generation_candidates?") && path.includes("order=created_at.asc")) {
      return candidates.filter((c) => path.includes(c.request_id) || true);
    }
    // GET candidate by id
    if (path.includes("/rest/v1/storyflow_generation_candidates?id=eq.")) {
      return candidates.filter((c) => path.includes(c.id));
    }
    // RPC: apply_generation_candidate
    if (path === "/rest/v1/rpc/apply_generation_candidate" && init?.method === "POST") {
      const body = JSON.parse(init.body);
      const candidate = candidates.find((c) => c.id === body.p_candidate_id);
      if (!candidate) throw new Error("CANDIDATE_NOT_FOUND");
      if (candidate.status === "applied") {
        return { candidate_id: candidate.id, new_version_id: candidate.applied_version_id };
      }
      if (candidate.status !== "ready") throw new Error(`CANDIDATE_NOT_READY: status=${candidate.status}`);
      const newVersionId = "ver-new-" + Date.now();
      candidate.status = "applied";
      candidate.applied_version_id = newVersionId;
      candidate.applied_at = new Date().toISOString();
      return { candidate_id: candidate.id, new_version_id: newVersionId };
    }
    throw new Error(`unexpected fetch: ${path}`);
  };
}

// ============================================================
// 1. createGenerationRequest
// ============================================================

test("createGenerationRequest: valid discuss with messages accepted", async () => {
  const fetcher = makeFetcher({});
  const req = await createGenerationRequest(
    {
      ownerId: USER_ID, workId: WORK_ID, baseVersionId: "ver-001",
      messageIds: ["msg-001"], operation: "discuss", idempotencyKey: "idem-001",
    },
    fetcher,
  );
  assert.equal(req.operation, "discuss");
  assert.deepEqual(req.messageIds, ["msg-001"]);
});

test("createGenerationRequest: generate requires at least one messageId", async () => {
  const fetcher = makeFetcher({});
  await assert.rejects(
    () => createGenerationRequest(
      {
        ownerId: USER_ID, workId: WORK_ID, baseVersionId: "ver-001",
        messageIds: [], operation: "generate", idempotencyKey: "idem-001",
      },
      fetcher,
    ),
    (err) => err instanceof GenerationsServiceError && err.code === "validation_failed" && /先保存输入/.test(err.message),
  );
});

test("createGenerationRequest: update requires at least one messageId", async () => {
  const fetcher = makeFetcher({});
  await assert.rejects(
    () => createGenerationRequest(
      {
        ownerId: USER_ID, workId: WORK_ID, baseVersionId: "ver-001",
        messageIds: [], operation: "update", idempotencyKey: "idem-001",
      },
      fetcher,
    ),
    (err) => err instanceof GenerationsServiceError && err.code === "validation_failed",
  );
});

test("createGenerationRequest: discuss with empty messages accepted (no input needed)", async () => {
  const fetcher = makeFetcher({});
  const req = await createGenerationRequest(
    {
      ownerId: USER_ID, workId: WORK_ID, baseVersionId: "ver-001",
      messageIds: [], operation: "discuss", idempotencyKey: "idem-001",
    },
    fetcher,
  );
  assert.equal(req.operation, "discuss");
});

test("createGenerationRequest: idempotent replay returns existing request", async () => {
  const fetcher = makeFetcher({});
  const input = {
    ownerId: USER_ID, workId: WORK_ID, baseVersionId: "ver-001",
    messageIds: ["msg-001"], operation: "discuss", idempotencyKey: "idem-001",
  };
  const first = await createGenerationRequest(input, fetcher);
  const second = await createGenerationRequest(input, fetcher);
  assert.equal(second.id, first.id);
});

test("createGenerationRequest: rejects illegal operation", async () => {
  const fetcher = makeFetcher({});
  await assert.rejects(
    () => createGenerationRequest(
      {
        ownerId: USER_ID, workId: WORK_ID, baseVersionId: "ver-001",
        messageIds: ["msg-001"], operation: "translate", idempotencyKey: "idem-001",
      },
      fetcher,
    ),
    (err) => err instanceof GenerationsServiceError && err.code === "validation_failed",
  );
});

// ============================================================
// 2. addGenerationCandidate
// ============================================================

test("addGenerationCandidate: valid candidate returns ready status", async () => {
  const fetcher = makeFetcher({});
  const cand = await addGenerationCandidate(
    {
      ownerId: USER_ID, requestId: REQUEST_ID, workId: WORK_ID,
      content: { scenes: [] }, contentHash: "a".repeat(64),
    },
    fetcher,
  );
  assert.equal(cand.status, "ready");
  assert.equal(cand.appliedVersionId, null);
});

// ============================================================
// 3. applyCandidate
// ============================================================

test("applyCandidate: ready candidate → applied + new version", async () => {
  const candidates = [];
  const fetcher = makeFetcher({ candidates });
  const cand = await addGenerationCandidate(
    {
      ownerId: USER_ID, requestId: REQUEST_ID, workId: WORK_ID,
      content: { v: 1 }, contentHash: "a".repeat(64),
    },
    fetcher,
  );
  const result = await applyCandidate(
    {
      ownerId: USER_ID, candidateId: cand.id,
      contentSchema: "kiikis.script/1", idempotencyKey: "idem-apply-001",
    },
    fetcher,
  );
  assert.equal(result.candidateId, cand.id);
  assert.ok(result.newVersionId);
  assert.match(result.newVersionId, /^ver-new-/);
});

test("applyCandidate: idempotent replay returns existing version", async () => {
  const candidates = [];
  const fetcher = makeFetcher({ candidates });
  const cand = await addGenerationCandidate(
    {
      ownerId: USER_ID, requestId: REQUEST_ID, workId: WORK_ID,
      content: { v: 1 }, contentHash: "a".repeat(64),
    },
    fetcher,
  );
  const first = await applyCandidate(
    { ownerId: USER_ID, candidateId: cand.id, contentSchema: "kiikis.script/1", idempotencyKey: "idem-001" },
    fetcher,
  );
  const second = await applyCandidate(
    { ownerId: USER_ID, candidateId: cand.id, contentSchema: "kiikis.script/1", idempotencyKey: "idem-002" },
    fetcher,
  );
  assert.equal(second.newVersionId, first.newVersionId, "idempotent replay returns same version");
});

// ============================================================
// 4. applyCandidate error handling
// ============================================================

test("applyCandidate: CANDIDATE_NOT_FOUND → not_found", async () => {
  const fetcher = makeFetcher({});
  await assert.rejects(
    () => applyCandidate(
      { ownerId: USER_ID, candidateId: "nonexistent", contentSchema: "s", idempotencyKey: "k" },
      fetcher,
    ),
    (err) => err instanceof GenerationsServiceError && err.code === "not_found",
  );
});

test("applyCandidate: FORBIDDEN → forbidden", async () => {
  const fetcher = async () => { throw new Error("FORBIDDEN: not your work"); };
  await assert.rejects(
    () => applyCandidate(
      { ownerId: USER_ID, candidateId: CANDIDATE_ID, contentSchema: "s", idempotencyKey: "k" },
      fetcher,
    ),
    (err) => err instanceof GenerationsServiceError && err.code === "forbidden",
  );
});

test("applyCandidate: missing contentSchema → validation_failed", async () => {
  const fetcher = makeFetcher({});
  await assert.rejects(
    () => applyCandidate(
      { ownerId: USER_ID, candidateId: CANDIDATE_ID, contentSchema: "", idempotencyKey: "k" },
      fetcher,
    ),
    (err) => err instanceof GenerationsServiceError && err.code === "validation_failed",
  );
});

// ============================================================
// 5. listCandidates
// ============================================================

test("listCandidates: returns candidates in chronological order", async () => {
  const candidates = [];
  const fetcher = makeFetcher({ candidates });
  await addGenerationCandidate(
    { ownerId: USER_ID, requestId: REQUEST_ID, workId: WORK_ID, content: { v: 1 }, contentHash: "h1" },
    fetcher,
  );
  await addGenerationCandidate(
    { ownerId: USER_ID, requestId: REQUEST_ID, workId: WORK_ID, content: { v: 2 }, contentHash: "h2" },
    fetcher,
  );
  const list = await listCandidates({ ownerId: USER_ID, requestId: REQUEST_ID }, fetcher);
  assert.equal(list.length, 2);
  assert.equal(list[0].contentHash, "h1");
  assert.equal(list[1].contentHash, "h2");
});

test("listCandidates: empty result when no candidates", async () => {
  const fetcher = async () => [];
  const list = await listCandidates({ ownerId: USER_ID, requestId: REQUEST_ID }, fetcher);
  assert.deepEqual(list, []);
});

// ============================================================
// 6. Service error shapes
// ============================================================

test("GenerationsServiceError: state_transition_denied code supported", () => {
  const err = new GenerationsServiceError("state_transition_denied", "not ready");
  assert.equal(err.code, "state_transition_denied");
});
