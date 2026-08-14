/**
 * Phase 1 Task 1.2 — Work Version service API tests.
 *
 * Verifies the service layer (appendWorkVersion, createCheckpoint,
 * finalizeWorkVersion, listWorkVersions) handles edge cases:
 *   - Service unavailable when RPC fails
 *   - Forbidden when owner mismatch
 *   - Not found when work missing
 *   - contentHash computed server-side (client never supplies)
 *
 * Run: node --test tests/server-v2/works/versions.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  appendWorkVersion,
  createCheckpoint,
  finalizeWorkVersion,
  listWorkVersions,
  computeContentHash,
  WorkVersionsServiceError,
} from "../../../lib/server/v2/works/versions.ts";

const USER_ID = "user-001";
const WORK_ID = "work-001";

// ============================================================
// 1. computeContentHash
// ============================================================

test("computeContentHash: returns 64-char sha256 hex", () => {
  const hash = computeContentHash({ hello: "world" });
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("computeContentHash: different content → different hash", () => {
  const h1 = computeContentHash({ a: 1 });
  const h2 = computeContentHash({ a: 2 });
  assert.notEqual(h1, h2);
});

test("computeContentHash: null/undefined content handled", () => {
  assert.doesNotThrow(() => computeContentHash(null));
  assert.doesNotThrow(() => computeContentHash(undefined));
  assert.doesNotThrow(() => computeContentHash({}));
});

// ============================================================
// 2. appendWorkVersion error handling
// ============================================================

test("appendWorkVersion: network error → service_unavailable", async () => {
  const fetcher = async () => { throw new Error("network down"); };
  await assert.rejects(
    () => appendWorkVersion(
      {
        ownerId: USER_ID, workId: WORK_ID, parentVersionId: null,
        kind: "editing_draft", contentSchema: "kiikis.script/1",
        content: {}, source: "manual", idempotencyKey: "idem-001",
      },
      fetcher,
    ),
    (err) => err instanceof WorkVersionsServiceError && err.code === "service_unavailable",
  );
});

test("appendWorkVersion: FORBIDDEN in message → forbidden code", async () => {
  const fetcher = async () => { throw new Error("FORBIDDEN: not your work"); };
  await assert.rejects(
    () => appendWorkVersion(
      {
        ownerId: USER_ID, workId: WORK_ID, parentVersionId: null,
        kind: "editing_draft", contentSchema: "kiikis.script/1",
        content: {}, source: "manual", idempotencyKey: "idem-001",
      },
      fetcher,
    ),
    (err) => err instanceof WorkVersionsServiceError && err.code === "forbidden",
  );
});

test("appendWorkVersion: WORK_NOT_FOUND → not_found code", async () => {
  const fetcher = async () => { throw new Error("WORK_NOT_FOUND"); };
  await assert.rejects(
    () => appendWorkVersion(
      {
        ownerId: USER_ID, workId: WORK_ID, parentVersionId: null,
        kind: "editing_draft", contentSchema: "kiikis.script/1",
        content: {}, source: "manual", idempotencyKey: "idem-001",
      },
      fetcher,
    ),
    (err) => err instanceof WorkVersionsServiceError && err.code === "not_found",
  );
});

test("appendWorkVersion: RPC returns null → service_unavailable", async () => {
  const fetcher = async () => null;
  await assert.rejects(
    () => appendWorkVersion(
      {
        ownerId: USER_ID, workId: WORK_ID, parentVersionId: null,
        kind: "editing_draft", contentSchema: "kiikis.script/1",
        content: {}, source: "manual", idempotencyKey: "idem-001",
      },
      fetcher,
    ),
    (err) => err instanceof WorkVersionsServiceError && err.code === "service_unavailable",
  );
});

// ============================================================
// 3. createCheckpoint
// ============================================================

test("createCheckpoint: valid input accepted", async () => {
  const fetcher = async (path, init) => {
    if (path === "/rest/v1/rpc/append_work_version" && init?.method === "POST") {
      const body = JSON.parse(init.body);
      return {
        id: "ver-ckpt-001",
        work_id: body.p_work_id,
        parent_version_id: body.p_parent_version_id,
        kind: body.p_kind,
        content_schema: body.p_content_schema,
        content_json: body.p_content_json,
        content_hash: body.p_content_hash,
        source: body.p_source,
        source_message_ids: body.p_source_message_ids,
        source_job_id: body.p_source_job_id,
        idempotency_key: body.p_idempotency_key,
        created_by: USER_ID,
        created_at: "2026-08-14T10:00:00+08:00",
      };
    }
    throw new Error(`unexpected: ${path}`);
  };
  const { version } = await createCheckpoint(
    {
      ownerId: USER_ID, workId: WORK_ID, parentVersionId: null,
      contentSchema: "kiikis.script/1",
      content: { v: 1 }, source: "manual", idempotencyKey: "idem-ckpt-001",
    },
    fetcher,
  );
  assert.equal(version.kind, "checkpoint");
});

// ============================================================
// 4. finalizeWorkVersion
// ============================================================

test("finalizeWorkVersion: valid input accepted", async () => {
  const fetcher = async (path, init) => {
    if (path === "/rest/v1/rpc/append_work_version" && init?.method === "POST") {
      const body = JSON.parse(init.body);
      return {
        id: "ver-final-001",
        work_id: body.p_work_id,
        parent_version_id: body.p_parent_version_id,
        kind: "finalized",
        content_schema: body.p_content_schema,
        content_json: body.p_content_json,
        content_hash: body.p_content_hash,
        source: body.p_source,
        source_message_ids: body.p_source_message_ids,
        source_job_id: body.p_source_job_id,
        idempotency_key: body.p_idempotency_key,
        created_by: USER_ID,
        created_at: "2026-08-14T11:00:00+08:00",
      };
    }
    throw new Error(`unexpected: ${path}`);
  };
  const { version } = await finalizeWorkVersion(
    {
      ownerId: USER_ID, workId: WORK_ID, versionId: "ver-001",
      idempotencyKey: "idem-final-001",
    },
    fetcher,
  );
  assert.equal(version.kind, "finalized");
  assert.equal(version.parentVersionId, "ver-001");
});

// ============================================================
// 5. listWorkVersions
// ============================================================

test("listWorkVersions: empty result when no versions", async () => {
  const fetcher = async () => [];
  const versions = await listWorkVersions({ ownerId: USER_ID, workId: WORK_ID }, fetcher);
  assert.deepEqual(versions, []);
});

test("listWorkVersions: maps rows to V22 DTOs", async () => {
  const fetcher = async () => [
    {
      id: "ver-001", work_id: WORK_ID, parent_version_id: null,
      kind: "editing_draft", content_schema: "kiikis.script/1",
      content_json: { scenes: [] }, content_hash: "a".repeat(64),
      source: "manual", source_message_ids: [], source_job_id: null,
      idempotency_key: "k1", created_by: USER_ID, created_at: "2026-08-14T10:00:00+08:00",
    },
  ];
  const versions = await listWorkVersions({ ownerId: USER_ID, workId: WORK_ID }, fetcher);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].id, "ver-001");
  assert.equal(versions[0].workId, WORK_ID);
  assert.equal(versions[0].kind, "editing_draft");
  assert.deepEqual(versions[0].sourceMessageIds, []);
});

test("listWorkVersions: network error → service_unavailable", async () => {
  const fetcher = async () => { throw new Error("network down"); };
  await assert.rejects(
    () => listWorkVersions({ ownerId: USER_ID, workId: WORK_ID }, fetcher),
    (err) => err instanceof WorkVersionsServiceError && err.code === "service_unavailable",
  );
});

// ============================================================
// 6. WorkVersionsServiceError shape
// ============================================================

test("WorkVersionsServiceError: conflict code carries currentVersionId", () => {
  const err = new WorkVersionsServiceError("conflict", "stale", { currentVersionId: "ver-new" });
  assert.equal(err.code, "conflict");
  assert.equal(err.currentVersionId, "ver-new");
});

test("WorkVersionsServiceError: all codes supported", () => {
  for (const code of ["unauthenticated", "forbidden", "not_found", "conflict", "validation_failed", "service_unavailable", "immutable_violation", "state_transition_denied"]) {
    const err = new WorkVersionsServiceError(code, "test");
    assert.equal(err.code, code);
  }
});
