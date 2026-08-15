/**
 * Phase 4 Task 4.5 — atomic U1 finalize.
 *
 * Verifies:
 *   - finalize only accepts ready_for_u1 sessions (degraded rejected)
 *   - atomicity: any candidate write failure → no Universe, no U1, no Source
 *     Work link, no Evidence (all-or-nothing)
 *   - idempotency: repeat finalize returns the same U1
 *   - rights: unclear/restricted stay private; no publish/license/grants
 *
 * Run: node --test tests/server-v2/universe-import/finalize.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  FinalizeUniverseImportService,
  FinalizeError,
} from "../../../lib/server/v2/universe-import/finalize.ts";

const OWNER = "owner-001";
const SESSION = "session-001";

function makeStore(failAt = null) {
  const tables = {
    storyflow_works: [],
    storyflow_source_works: [],
    storyflow_source_versions: [],
    storyflow_universe_import_sessions: [
      { id: SESSION, owner_id: OWNER, mode: "complete_screenplay", state: "ready_for_u1", rights_declaration: { holder: "me", basis: "own_work" }, source_work_id: null, universe_id: null, cancelled_at: null },
    ],
    storyflow_universe_import_candidates: [
      { id: "c1", session_id: SESSION, kind: "entity", payload: { name: "阿仁" }, locations: [{ fileId: "f1", startOffset: 0, endOffset: 2, sourceHash: "a".repeat(64) }], status: "accepted", confidence: 0.9 },
      { id: "c2", session_id: SESSION, kind: "relationship", payload: { from: "阿仁", to: "苏九", relation: "同伴" }, locations: [{ fileId: "f1", startOffset: 10, endOffset: 14, sourceHash: "a".repeat(64) }], status: "accepted", confidence: 0.8 },
      { id: "c3", session_id: SESSION, kind: "fact", payload: { statement: "废土世界" }, locations: [{ fileId: "f1", startOffset: 20, endOffset: 24, sourceHash: "a".repeat(64) }], status: "accepted", confidence: 0.7 },
    ],
    storyflow_universes: [],
    storyflow_universe_versions: [],
    storyflow_evidence_events: [],
    writeCount: 0,
  };
  let seq = 0;
  const nextId = (prefix) => `${prefix}-${String(++seq).padStart(3, "0")}`;

  const fetcher = async (path, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = new URL(path, "https://db.local");
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const rpc = url.pathname.replace("/rest/v1/rpc/", "");
      // Simulated atomic RPC: rolls back on injected failure.
      tables.writeCount += 1;
      if (failAt === "rpc" || (typeof failAt === "number" && tables.writeCount > failAt)) {
        throw new Error("injected RPC failure");
      }
      return finalizeRpc(rpc, JSON.parse(String(init?.body ?? "{}")), tables, nextId);
    }
    const table = url.pathname.replace("/rest/v1/", "");
    const rows = tables[table];
    if (method === "GET" && rows) {
      let filtered = [...rows];
      for (const [key, rawValue] of url.searchParams.entries()) {
        if (["order", "limit", "select"].includes(key)) continue;
        const m = /^(eq|is)\.(.*)$/.exec(rawValue);
        if (m) filtered = filtered.filter((r) => (m[1] === "is" && m[2] === "null" ? r[key] === null : String(r[key]) === m[2]));
      }
      return filtered.slice(0, Number(url.searchParams.get("limit") ?? filtered.length));
    }
    throw new Error(`Unsupported ${method} ${path}`);
  };

  return { fetcher, tables };
}

function finalizeRpc(rpc, body, tables, nextId) {
  if (rpc !== "finalize_universe_import_v22") throw new Error(`Unknown RPC ${rpc}`);
  const { owner_id, session_id } = body;
  const session = tables.storyflow_universe_import_sessions.find((s) => s.id === session_id);
  if (!session) return { error: "session_not_found" };
  // Idempotency: an already-finalized session returns its existing U1.
  if (session.state === "u1_ready" && session.universe_id) {
    return { idempotent: true, universe_id: session.universe_id, universe_version_id: session.source_work_id + ":uv" };
  }
  if (session.state !== "ready_for_u1") return { error: "not_ready" };

  const universeId = nextId("universe");
  const universeVersionId = nextId("uversion");
  const sourceWorkId = nextId("work");
  const sourceVersionId = nextId("sourceversion");

  tables.storyflow_works.push({ id: sourceWorkId, owner_id, work_type: "source", project_id: null, is_primary: false });
  tables.storyflow_source_works.push({ work_id: sourceWorkId, owner_id, title: "导入原作", rights_state: "private" });
  tables.storyflow_source_versions.push({
    id: sourceVersionId,
    source_work_id: sourceWorkId,
    version_no: 1,
    file_hashes: ["a".repeat(64)],
    rights_declaration: session.rights_declaration,
    manifest: { files: [], hash: "a".repeat(64) },
    created_by: owner_id,
  });
  tables.storyflow_universes.push({ id: universeId, user_id: owner_id, name: "导入 Universe" });
  tables.storyflow_universe_versions.push({ id: universeVersionId, universe_id: universeId, version_no: 1, content_hash: "b".repeat(64), object_index: { entities: ["obj-1"] } });
  tables.storyflow_evidence_events.push({ id: nextId("ev"), work_id: sourceWorkId, kind: "universe_import_finalized", payload_json: { session_id }, created_by: owner_id });
  Object.assign(session, { state: "u1_ready", universe_id: universeId, source_work_id: sourceWorkId });
  return { universe_id: universeId, universe_version_id: universeVersionId, source_work_id: sourceWorkId, source_version_id: sourceVersionId, idempotent: false };
}

function makeService(failAt = null) {
  const store = makeStore(failAt);
  return { service: new FinalizeUniverseImportService(store.fetcher), store };
}

// ============================================================
// 1. Gates
// ============================================================

test("finalize rejects sessions not in ready_for_u1 (degraded/extracting)", async () => {
  const { service, store } = makeService();
  for (const state of ["degraded", "extracting", "upload_draft", "review_required", "u1_ready"]) {
    store.tables.storyflow_universe_import_sessions[0].state = state;
    if (state === "u1_ready") {
      // idempotent replay instead of rejection
      store.tables.storyflow_universe_import_sessions[0].universe_id = "universe-existing";
      store.tables.storyflow_universe_import_sessions[0].source_work_id = "work-existing";
      const result = await service.finalize({ ownerId: OWNER, sessionId: SESSION });
      assert.equal(result.idempotent, true);
      assert.equal(result.universeId, "universe-existing");
      store.tables.storyflow_universe_import_sessions[0].universe_id = null;
      store.tables.storyflow_universe_import_sessions[0].source_work_id = null;
      continue;
    }
    await assert.rejects(
      () => service.finalize({ ownerId: OWNER, sessionId: SESSION }),
      (e) => e instanceof FinalizeError && e.code === "conflict",
    );
  }
});

test("cross-user finalize is forbidden", async () => {
  const { service } = makeService();
  await assert.rejects(
    () => service.finalize({ ownerId: "owner-002", sessionId: SESSION }),
    (e) => e instanceof FinalizeError && e.code === "forbidden",
  );
});

// ============================================================
// 2. Atomicity
// ============================================================

test("RPC failure leaves no Universe / U1 / Source Work / Evidence", async () => {
  const { service, store } = makeService("rpc");
  await assert.rejects(
    () => service.finalize({ ownerId: OWNER, sessionId: SESSION }),
    (e) => e instanceof FinalizeError,
  );
  assert.equal(store.tables.storyflow_universes.length, 0);
  assert.equal(store.tables.storyflow_universe_versions.length, 0);
  assert.equal(store.tables.storyflow_source_works.length, 0);
  assert.equal(store.tables.storyflow_source_versions.length, 0);
  assert.equal(store.tables.storyflow_evidence_events.length, 0);
  assert.equal(store.tables.storyflow_universe_import_sessions[0].state, "ready_for_u1");
});

test("successful finalize creates U1 + Source Work + Evidence atomically", async () => {
  const { service, store } = makeService();
  const result = await service.finalize({ ownerId: OWNER, sessionId: SESSION });
  assert.ok(result.universeId);
  assert.ok(result.universeVersionId);
  assert.ok(result.sourceWorkId);
  assert.equal(store.tables.storyflow_universe_import_sessions[0].state, "u1_ready");
  assert.equal(store.tables.storyflow_evidence_events.length, 1);
});

test("repeat finalize returns the same U1 (idempotent)", async () => {
  const { service } = makeService();
  const first = await service.finalize({ ownerId: OWNER, sessionId: SESSION });
  const second = await service.finalize({ ownerId: OWNER, sessionId: SESSION });
  assert.equal(second.idempotent, true);
  assert.equal(second.universeId, first.universeId);
});

// ============================================================
// 3. Rights
// ============================================================

test("unclear/restricted rights keep the Universe private", async () => {
  const { service, store } = makeService();
  store.tables.storyflow_universe_import_sessions[0].rights_declaration = { holder: "x", basis: "unclear" };
  const result = await service.finalize({ ownerId: OWNER, sessionId: SESSION });
  assert.equal(result.rightsState, "private");
  assert.equal(result.canPublish, false);
  assert.equal(result.canLicense, false);
});
