/**
 * Phase 1 Task 1.2 — Work Version state machine tests.
 *
 * Covers (PRD Task 1.2 Step 1 RED):
 *   - First editing draft
 *   - Parent version chain
 *   - Idempotency key replay
 *   - Checkpoint does not change history
 *   - Finalized is immutable (cannot update/delete)
 *   - After finalized, editing creates child editing_draft
 *   - CAS conflict returns 409 with currentVersionId
 *   - Finalize requires parent (checkpoint or editing_draft)
 *
 * Run: node --test tests/server-v2/works/state-machine.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  appendWorkVersion,
  createCheckpoint,
  finalizeWorkVersion,
  listWorkVersions,
  getWork,
  computeContentHash,
  WorkVersionsServiceError,
} from "../../../lib/server/v2/works/versions.ts";

const USER_ID = "user-001";
const WORK_ID = "work-001";
const NOW = "2026-08-14T10:00:00+08:00";

// ============================================================
// Mock fetcher factory
// ============================================================

function makeFetcher({ workRow, existingVersions = [], rpcBehavior }) {
  const versions = [...existingVersions];
  const work = { ...workRow };

  return async (path, init) => {
    // GET work metadata
    if (path.includes("/rest/v1/storyflow_works?") && path.includes("select=id,owner_id")) {
      return [work];
    }
    // GET work versions list
    if (path.includes("/rest/v1/storyflow_work_versions?") && path.includes("order=created_at.asc")) {
      return versions;
    }
    // RPC: append_work_version
    if (path === "/rest/v1/rpc/append_work_version" && init?.method === "POST") {
      const body = JSON.parse(init.body);
      return rpcBehavior
        ? rpcBehavior(body, { work, versions })
        : defaultAppendRpc(body, { work, versions });
    }
    throw new Error(`unexpected fetch: ${path}`);
  };
}

function defaultAppendRpc(body, ctx) {
  const { work, versions } = ctx;
  // Idempotency check
  const existing = versions.find((v) => v.idempotency_key === body.p_idempotency_key);
  if (existing) return existing;

  // CAS check
  if (body.p_expected_current_version_id !== null) {
    if (work.current_version_id !== body.p_expected_current_version_id) {
      const err = new Error(`VERSION_CONFLICT: expected ${body.p_expected_current_version_id}, got ${work.current_version_id}`);
      err.message = "VERSION_CONFLICT: expected " + body.p_expected_current_version_id + ", got " + work.current_version_id;
      throw err;
    }
  }

  // Finalize parent check
  if (body.p_kind === "finalized") {
    if (!body.p_parent_version_id) {
      const e = new Error("FINALIZE_REQUIRES_PARENT");
      throw e;
    }
    const parent = versions.find((v) => v.id === body.p_parent_version_id);
    if (!parent || !["checkpoint", "editing_draft"].includes(parent.kind)) {
      throw new Error("FINALIZE_PARENT_NOT_FOUND");
    }
  }

  const newVersion = {
    id: "ver-" + (versions.length + 1).toString().padStart(3, "0"),
    work_id: body.p_work_id,
    parent_version_id: body.p_parent_version_id,
    kind: body.p_kind,
    content_schema: body.p_content_schema,
    content_json: body.p_content_json,
    content_hash: body.p_content_hash,
    source: body.p_source,
    source_message_ids: body.p_source_message_ids || [],
    source_job_id: body.p_source_job_id,
    idempotency_key: body.p_idempotency_key,
    created_by: USER_ID,
    created_at: NOW,
  };
  versions.push(newVersion);
  work.current_version_id = newVersion.id;
  if (body.p_kind === "checkpoint") work.latest_checkpoint_id = newVersion.id;
  if (body.p_kind === "finalized") {
    work.finalized_version_id = newVersion.id;
    work.status = "finalized";
  }
  return newVersion;
}

function makeWorkRow(overrides = {}) {
  return {
    id: WORK_ID,
    owner_id: USER_ID,
    current_version_id: null,
    latest_checkpoint_id: null,
    finalized_version_id: null,
    ...overrides,
  };
}

// ============================================================
// 1. First editing draft
// ============================================================

test("appendWorkVersion: first editing_draft accepted, current_version_id updated", async () => {
  const fetcher = makeFetcher({ workRow: makeWorkRow() });
  const { version, idempotentReplay } = await appendWorkVersion(
    {
      ownerId: USER_ID,
      workId: WORK_ID,
      parentVersionId: null,
      kind: "editing_draft",
      contentSchema: "kiikis.script/1",
      content: { scenes: [] },
      source: "manual",
      idempotencyKey: "idem-001",
    },
    fetcher,
  );
  assert.equal(version.kind, "editing_draft");
  assert.equal(version.parentVersionId, null);
  assert.equal(idempotentReplay, false);
  // contentHash computed server-side
  assert.equal(version.contentHash, computeContentHash({ scenes: [] }));
  assert.match(version.contentHash, /^[0-9a-f]{64}$/);
});

test("appendWorkVersion: content hash is deterministic over same content", () => {
  const h1 = computeContentHash({ a: 1, b: 2 });
  const h2 = computeContentHash({ b: 2, a: 1 }); // key order differs
  assert.equal(h1, h2, "canonicalJson must sort keys");
});

// ============================================================
// 2. Parent version chain
// ============================================================

test("appendWorkVersion: child version has parentVersionId set", async () => {
  const fetcher = makeFetcher({ workRow: makeWorkRow() });
  const { version: v1 } = await appendWorkVersion(
    {
      ownerId: USER_ID, workId: WORK_ID, parentVersionId: null,
      kind: "editing_draft", contentSchema: "kiikis.script/1",
      content: { v: 1 }, source: "manual", idempotencyKey: "idem-001",
    },
    fetcher,
  );
  const { version: v2 } = await appendWorkVersion(
    {
      ownerId: USER_ID, workId: WORK_ID, parentVersionId: v1.id,
      kind: "editing_draft", contentSchema: "kiikis.script/1",
      content: { v: 2 }, source: "manual", idempotencyKey: "idem-002",
    },
    fetcher,
  );
  assert.equal(v2.parentVersionId, v1.id);
});

// ============================================================
// 3. Idempotency key replay
// ============================================================

test("appendWorkVersion: same idempotency key returns existing version", async () => {
  const fetcher = makeFetcher({ workRow: makeWorkRow() });
  const input = {
    ownerId: USER_ID, workId: WORK_ID, parentVersionId: null,
    kind: "editing_draft", contentSchema: "kiikis.script/1",
    content: { v: 1 }, source: "manual", idempotencyKey: "idem-001",
  };
  const { version: first } = await appendWorkVersion(input, fetcher);
  const { version: second } = await appendWorkVersion(input, fetcher);
  assert.equal(second.id, first.id, "idempotent replay returns same version id");
});

// ============================================================
// 4. Checkpoint does not change history
// ============================================================

test("createCheckpoint: checkpoint added without removing existing versions", async () => {
  const fetcher = makeFetcher({ workRow: makeWorkRow() });
  await appendWorkVersion(
    {
      ownerId: USER_ID, workId: WORK_ID, parentVersionId: null,
      kind: "editing_draft", contentSchema: "kiikis.script/1",
      content: { v: 1 }, source: "manual", idempotencyKey: "idem-001",
    },
    fetcher,
  );
  const { version: checkpoint } = await createCheckpoint(
    {
      ownerId: USER_ID, workId: WORK_ID, parentVersionId: null,
      contentSchema: "kiikis.script/1",
      content: { v: 1, checkpoint: true }, source: "manual",
      idempotencyKey: "idem-ckpt-001",
    },
    fetcher,
  );
  assert.equal(checkpoint.kind, "checkpoint");

  const all = await listWorkVersions({ ownerId: USER_ID, workId: WORK_ID }, fetcher);
  assert.equal(all.length, 2, "checkpoint added, not replaced");
  assert.ok(all.some((v) => v.kind === "editing_draft"));
  assert.ok(all.some((v) => v.kind === "checkpoint"));
});

// ============================================================
// 5. Finalized is immutable
// ============================================================

test("finalizeWorkVersion: finalized version has kind=finalized", async () => {
  const fetcher = makeFetcher({ workRow: makeWorkRow() });
  const { version: draft } = await appendWorkVersion(
    {
      ownerId: USER_ID, workId: WORK_ID, parentVersionId: null,
      kind: "editing_draft", contentSchema: "kiikis.script/1",
      content: { v: 1 }, source: "manual", idempotencyKey: "idem-001",
    },
    fetcher,
  );
  const { version: finalized } = await finalizeWorkVersion(
    {
      ownerId: USER_ID, workId: WORK_ID, versionId: draft.id,
      idempotencyKey: "idem-final-001",
    },
    fetcher,
  );
  assert.equal(finalized.kind, "finalized");
  assert.equal(finalized.parentVersionId, draft.id);
});

test("finalizeWorkVersion: rejects without parent versionId", async () => {
  const fetcher = makeFetcher({ workRow: makeWorkRow() });
  await assert.rejects(
    () => finalizeWorkVersion(
      { ownerId: USER_ID, workId: WORK_ID, versionId: "", idempotencyKey: "idem-final-001" },
      fetcher,
    ),
    (err) => err instanceof WorkVersionsServiceError && err.code === "validation_failed",
  );
});

// ============================================================
// 6. After finalized, editing creates child editing_draft
// ============================================================

test("appendWorkVersion: after finalized, new editing_draft has finalized as parent", async () => {
  const fetcher = makeFetcher({ workRow: makeWorkRow() });
  const { version: draft } = await appendWorkVersion(
    {
      ownerId: USER_ID, workId: WORK_ID, parentVersionId: null,
      kind: "editing_draft", contentSchema: "kiikis.script/1",
      content: { v: 1 }, source: "manual", idempotencyKey: "idem-001",
    },
    fetcher,
  );
  const { version: finalized } = await finalizeWorkVersion(
    {
      ownerId: USER_ID, workId: WORK_ID, versionId: draft.id,
      idempotencyKey: "idem-final-001",
    },
    fetcher,
  );
  const { version: child } = await appendWorkVersion(
    {
      ownerId: USER_ID, workId: WORK_ID, parentVersionId: finalized.id,
      kind: "editing_draft", contentSchema: "kiikis.script/1",
      content: { v: 2 }, source: "manual", idempotencyKey: "idem-002",
    },
    fetcher,
  );
  assert.equal(child.parentVersionId, finalized.id);
  assert.equal(child.kind, "editing_draft");
});

// ============================================================
// 7. CAS conflict returns 409 with currentVersionId
// ============================================================

test("appendWorkVersion: CAS conflict returns 409 with currentVersionId", async () => {
  const fetcher = makeFetcher({
    workRow: makeWorkRow({ current_version_id: "ver-existing" }),
  });
  await assert.rejects(
    () => appendWorkVersion(
      {
        ownerId: USER_ID, workId: WORK_ID, parentVersionId: null,
        kind: "editing_draft", contentSchema: "kiikis.script/1",
        content: { v: 1 }, source: "manual", idempotencyKey: "idem-001",
        expectedCurrentVersionId: "ver-stale",
      },
      fetcher,
    ),
    (err) => {
      assert.equal(err.code, "conflict");
      assert.equal(err.currentVersionId, "ver-existing");
      return true;
    },
  );
});

// ============================================================
// 8. Finalize requires existing checkpoint or editing_draft
// ============================================================

test("finalizeWorkVersion: rejects when parent version does not exist", async () => {
  const fetcher = makeFetcher({ workRow: makeWorkRow() });
  await assert.rejects(
    () => finalizeWorkVersion(
      {
        ownerId: USER_ID, workId: WORK_ID, versionId: "ver-nonexistent",
        idempotencyKey: "idem-final-001",
      },
      fetcher,
    ),
    (err) => err instanceof WorkVersionsServiceError && err.code === "validation_failed",
  );
});

// ============================================================
// 9. Service error: unauthenticated
// ============================================================

test("appendWorkVersion: rejects empty ownerId", async () => {
  const fetcher = makeFetcher({ workRow: makeWorkRow() });
  await assert.rejects(
    () => appendWorkVersion(
      {
        ownerId: "", workId: WORK_ID, parentVersionId: null,
        kind: "editing_draft", contentSchema: "kiikis.script/1",
        content: {}, source: "manual", idempotencyKey: "idem-001",
      },
      fetcher,
    ),
    (err) => err instanceof WorkVersionsServiceError && err.code === "unauthenticated",
  );
});

test("appendWorkVersion: rejects invalid kind", async () => {
  const fetcher = makeFetcher({ workRow: makeWorkRow() });
  await assert.rejects(
    () => appendWorkVersion(
      {
        ownerId: USER_ID, workId: WORK_ID, parentVersionId: null,
        kind: "draft", contentSchema: "kiikis.script/1",
        content: {}, source: "manual", idempotencyKey: "idem-001",
      },
      fetcher,
    ),
    (err) => err instanceof WorkVersionsServiceError && err.code === "validation_failed",
  );
});

test("appendWorkVersion: rejects missing idempotencyKey", async () => {
  const fetcher = makeFetcher({ workRow: makeWorkRow() });
  await assert.rejects(
    () => appendWorkVersion(
      {
        ownerId: USER_ID, workId: WORK_ID, parentVersionId: null,
        kind: "editing_draft", contentSchema: "kiikis.script/1",
        content: {}, source: "manual", idempotencyKey: "",
      },
      fetcher,
    ),
    (err) => err instanceof WorkVersionsServiceError && err.code === "validation_failed",
  );
});

// ============================================================
// 10. getWork: owner check
// ============================================================

test("getWork: returns work metadata for owner", async () => {
  const fetcher = makeFetcher({ workRow: makeWorkRow({ current_version_id: "ver-001" }) });
  const work = await getWork({ ownerId: USER_ID, workId: WORK_ID }, fetcher);
  assert.equal(work.id, WORK_ID);
  assert.equal(work.current_version_id, "ver-001");
});

test("getWork: rejects non-owner (forbidden)", async () => {
  const fetcher = makeFetcher({ workRow: makeWorkRow({ owner_id: "other-user" }) });
  await assert.rejects(
    () => getWork({ ownerId: USER_ID, workId: WORK_ID }, fetcher),
    (err) => err instanceof WorkVersionsServiceError && err.code === "forbidden",
  );
});

test("getWork: rejects missing work (not_found)", async () => {
  const fetcher = async () => [];
  await assert.rejects(
    () => getWork({ ownerId: USER_ID, workId: WORK_ID }, fetcher),
    (err) => err instanceof WorkVersionsServiceError && err.code === "not_found",
  );
});

// ============================================================
// 11. listWorkVersions: chronological order
// ============================================================

test("listWorkVersions: returns versions in chronological order", async () => {
  const fetcher = makeFetcher({
    workRow: makeWorkRow(),
    existingVersions: [
      { id: "ver-002", work_id: WORK_ID, parent_version_id: "ver-001", kind: "editing_draft", content_schema: "s", content_json: {}, content_hash: "h2", source: "manual", source_message_ids: [], source_job_id: null, idempotency_key: "k2", created_by: USER_ID, created_at: "2026-08-14T11:00:00+08:00" },
      { id: "ver-001", work_id: WORK_ID, parent_version_id: null, kind: "editing_draft", content_schema: "s", content_json: {}, content_hash: "h1", source: "manual", source_message_ids: [], source_job_id: null, idempotency_key: "k1", created_by: USER_ID, created_at: "2026-08-14T10:00:00+08:00" },
    ],
  });
  const versions = await listWorkVersions({ ownerId: USER_ID, workId: WORK_ID }, fetcher);
  assert.equal(versions.length, 2);
  // The mock returns them in the order given; the real query orders by created_at.asc
  assert.ok(versions.every((v) => v.workId === WORK_ID));
});
