/**
 * Phase 4 Task 4.2 — Import Session, Source Work and persisted files.
 *
 * Verifies (PRD Task 4.2 Step 1 RED):
 *   - createSession / listSessions: auth, cross-user isolation
 *   - attachFile: MIME + extension double validation, size limits, duplicate
 *     hash idempotency (same hash → same file id, no re-upload)
 *   - upload completion callback: re-reads metadata and verifies SHA-256;
 *     mismatch → file stays unconfirmed
 *   - state gates: uploaded only when all required files persisted
 *   - resumability: unfinished sessions listed; cancel preserves facts
 *   - storage: private object keys (owner-scoped path), never public URLs
 *
 * Run: node --test tests/server-v2/universe-import/sessions.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  UniverseImportSessionsService,
  UniverseImportError,
} from "../../../lib/server/v2/universe-import/index.ts";

const OWNER = "owner-001";
const OTHER = "owner-002";

function makeStore() {
  const tables = {
    storyflow_works: [],
    storyflow_source_works: [],
    storyflow_universe_import_sessions: [],
    storyflow_universe_import_files: [],
    storage_objects: new Map(),
  };
  let seq = 0;
  const nextId = (prefix) => `${prefix}-${String(++seq).padStart(3, "0")}`;

  const fetcher = async (path, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = new URL(path, "https://db.local");
    // Storage metadata reads (hash verification)
    if (url.pathname.startsWith("/storage/v1/object/info/")) {
      const key = decodeURIComponent(url.pathname.replace("/storage/v1/object/info/", ""));
      const storedHash = tables.storage_objects.get(key);
      if (storedHash === undefined) throw new Error("object not found");
      return [{ metadata: { sha256: storedHash } }];
    }
    const table = url.pathname.replace("/rest/v1/", "");
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
        filtered = [...filtered].sort((a, b) => (dir === "desc" ? String(b[field]).localeCompare(String(a[field])) : String(a[field]).localeCompare(String(a[field]))));
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
      const body = JSON.parse(String(init?.body ?? "{}"));
      const inserted = (Array.isArray(body) ? body : [body]).map((b) => ({
        ...b,
        id: b.id ?? nextId(table),
        created_at: new Date(1700000000000 + seq * 1000).toISOString(),
      }));
      if (table === "storyflow_universe_import_files") {
        // duplicate hash idempotency at the DB layer (owner+session+hash unique)
        for (const ins of inserted) {
          const dup = rows.find(
            (r) => r.session_id === ins.session_id && r.content_hash === ins.content_hash && r.id !== ins.id,
          );
          if (dup) return [dup];
        }
      }
      rows.push(...inserted);
      return inserted;
    }

    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const idCond = url.searchParams.get("id");
      const targets = idCond ? rows.filter((r) => r.id === idCond.slice(3)) : [];
      for (const t of targets) Object.assign(t, body);
      return targets;
    }

    throw new Error(`Unsupported ${method} ${path}`);
  };

  return { fetcher, tables, nextId };
}

const SHA = (c) => c.repeat(64);

function makeService() {
  const store = makeStore();
  const service = new UniverseImportSessionsService(store.fetcher);
  // Wrap attachFile to register the storage-side hash (simulating the upload
  // having actually landed in the private bucket).
  const origAttach = service.attachFile.bind(service);
  service.attachFile = async (params, context) => {
    const result = await origAttach(params, context);
    if (context?.storedHash && result.file.objectKey) {
      store.tables.storage_objects.set(result.file.objectKey, context.storedHash);
    }
    return result;
  };
  return { service, store };
}

// ============================================================
// 1. Session lifecycle & auth
// ============================================================

test("createSession requires auth; no Project needed", async () => {
  const { service } = makeService();
  const session = await service.createSession({ ownerId: OWNER, mode: "complete_screenplay" });
  assert.equal(session.mode, "complete_screenplay");
  assert.equal(session.state, "upload_draft");
  await assert.rejects(
    () => service.createSession({ ownerId: "", mode: "complete_screenplay" }),
    (e) => e instanceof UniverseImportError && e.code === "unauthenticated",
  );
});

test("sessions are isolated per owner", async () => {
  const { service } = makeService();
  const mine = await service.createSession({ ownerId: OWNER, mode: "bible_triplet" });
  await assert.rejects(
    () => service.getSession({ ownerId: OTHER, sessionId: mine.id }),
    (e) => e instanceof UniverseImportError && e.code === "forbidden",
  );
});

// ============================================================
// 2. File attach: validation + idempotency
// ============================================================

test("attachFile validates extension AND mime; mismatch rejected", async () => {
  const { service } = makeService();
  const session = await service.createSession({ ownerId: OWNER, mode: "complete_screenplay" });
  const ok = await service.attachFile({
    ownerId: OWNER,
    sessionId: session.id,
    filename: "剧本.pdf",
    declaredRole: "screenplay",
    mimeType: "application/pdf",
    sizeBytes: 1024,
  });
  assert.ok(ok.file.id);
  // extension ok but mime is json → reject
  await assert.rejects(
    () =>
      service.attachFile({
        ownerId: OWNER,
        sessionId: session.id,
        filename: "补充.pdf",
        declaredRole: "screenplay",
        mimeType: "application/json",
        sizeBytes: 1024,
      }),
    (e) => e instanceof UniverseImportError && e.code === "validation_failed",
  );
  // json as screenplay → reject (format rule)
  await assert.rejects(
    () =>
      service.attachFile({
        ownerId: OWNER,
        sessionId: session.id,
        filename: "剧本.json",
        declaredRole: "screenplay",
        mimeType: "application/json",
        sizeBytes: 512,
      }),
    (e) => e instanceof UniverseImportError && e.code === "validation_failed",
  );
});

test("size limit enforced (100MB)", async () => {
  const { service } = makeService();
  const session = await service.createSession({ ownerId: OWNER, mode: "complete_screenplay" });
  await assert.rejects(
    () =>
      service.attachFile({
        ownerId: OWNER,
        sessionId: session.id,
        filename: "huge.pdf",
        declaredRole: "screenplay",
        mimeType: "application/pdf",
        sizeBytes: 101 * 1024 * 1024,
      }),
    (e) => e instanceof UniverseImportError && e.code === "validation_failed",
  );
});

test("duplicate hash re-attach is idempotent (same file id)", async () => {
  const { service, store } = makeService();
  const session = await service.createSession({ ownerId: OWNER, mode: "complete_screenplay" });
  const first = await service.attachFile({
    ownerId: OWNER, sessionId: session.id, filename: "剧本.pdf",
    declaredRole: "screenplay", mimeType: "application/pdf", sizeBytes: 1024,
  }, { contentHash: SHA("a") });
  const second = await service.attachFile({
    ownerId: OWNER, sessionId: session.id, filename: "剧本-重命名.pdf",
    declaredRole: "screenplay", mimeType: "application/pdf", sizeBytes: 1024,
  }, { contentHash: SHA("a") });
  assert.equal(second.file.id, first.file.id);
  assert.equal(store.tables.storyflow_universe_import_files.length, 1);
});

// ============================================================
// 3. Upload completion + hash verification
// ============================================================

test("confirmUpload verifies sha-256; mismatch keeps file unconfirmed", async () => {
  const { service, store } = makeService();
  const session = await service.createSession({ ownerId: OWNER, mode: "complete_screenplay" });
  const { file } = await service.attachFile(
    { ownerId: OWNER, sessionId: session.id, filename: "剧本.pdf", declaredRole: "screenplay", mimeType: "application/pdf", sizeBytes: 10 },
    { contentHash: SHA("b"), objectKey: `imports/${OWNER}/${session.id}/script.pdf`, storedHash: SHA("b") },
  );
  const confirmed = await service.confirmUpload({ ownerId: OWNER, sessionId: session.id, fileId: file.id });
  assert.equal(confirmed.file.persisted, true);

  const other = await service.attachFile(
    { ownerId: OWNER, sessionId: session.id, filename: "设定.pdf", declaredRole: "supplement", mimeType: "application/pdf", sizeBytes: 10 },
    { contentHash: SHA("c"), objectKey: `imports/${OWNER}/${session.id}/bible.pdf`, storedHash: SHA("d") },
  );
  await assert.rejects(
    () => service.confirmUpload({ ownerId: OWNER, sessionId: session.id, fileId: other.file.id }),
    (e) => e instanceof UniverseImportError && (e.code === "conflict" || e.code === "validation_failed"),
  );
  void store;
});

// ============================================================
// 4. State gating on completeness
// ============================================================

test("session enters uploaded only when mode requirements are persisted", async () => {
  const { service } = makeService();
  const session = await service.createSession({ ownerId: OWNER, mode: "complete_screenplay" });
  const { file } = await service.attachFile(
    { ownerId: OWNER, sessionId: session.id, filename: "剧本.pdf", declaredRole: "screenplay", mimeType: "application/pdf", sizeBytes: 10 },
    { contentHash: SHA("e"), objectKey: `imports/${OWNER}/${session.id}/s.pdf`, storedHash: SHA("e") },
  );
  await service.confirmUpload({ ownerId: OWNER, sessionId: session.id, fileId: file.id });
  const after = await service.getSession({ ownerId: OWNER, sessionId: session.id });
  assert.equal(after.state, "uploaded");
});

test("triplet with two files stays upload_draft", async () => {
  const { service } = makeService();
  const session = await service.createSession({ ownerId: OWNER, mode: "bible_triplet" });
  for (const [name, role] of [["世界.pdf", "world_bible"], ["角色.pdf", "character_bible"]]) {
    const { file } = await service.attachFile(
      { ownerId: OWNER, sessionId: session.id, filename: name, declaredRole: role, mimeType: "application/pdf", sizeBytes: 10 },
      { contentHash: SHA(name), objectKey: `imports/${OWNER}/${session.id}/${name}`, storedHash: SHA(name) },
    );
    await service.confirmUpload({ ownerId: OWNER, sessionId: session.id, fileId: file.id });
  }
  const after = await service.getSession({ ownerId: OWNER, sessionId: session.id });
  assert.equal(after.state, "upload_draft");
});

// ============================================================
// 5. Resume & cancel
// ============================================================

test("listSessions returns unfinished sessions for resume", async () => {
  const { service } = makeService();
  const s1 = await service.createSession({ ownerId: OWNER, mode: "bible_triplet" });
  await service.createSession({ ownerId: OWNER, mode: "complete_screenplay" });
  const list = await service.listSessions({ ownerId: OWNER, includeFinished: false });
  assert.equal(list.sessions.length, 2);
  void s1;
});

test("cancel preserves records; cancelled session rejects further writes", async () => {
  const { service, store } = makeService();
  const session = await service.createSession({ ownerId: OWNER, mode: "complete_screenplay" });
  await service.cancelSession({ ownerId: OWNER, sessionId: session.id });
  const row = store.tables.storyflow_universe_import_sessions.find((s) => s.id === session.id);
  assert.equal(row.state, "cancelled");
  assert.equal(row.cancelled_at !== null, true);
  // files remain as facts
  await assert.rejects(
    () =>
      service.attachFile({
        ownerId: OWNER, sessionId: session.id, filename: "x.pdf",
        declaredRole: "screenplay", mimeType: "application/pdf", sizeBytes: 10,
      }),
    (e) => e instanceof UniverseImportError && e.code === "conflict",
  );
});

// ============================================================
// 6. Storage privacy
// ============================================================

test("object keys are owner-scoped private paths, never public URLs", async () => {
  const { service } = makeService();
  const session = await service.createSession({ ownerId: OWNER, mode: "complete_screenplay" });
  const { file } = await service.attachFile(
    { ownerId: OWNER, sessionId: session.id, filename: "剧本.pdf", declaredRole: "screenplay", mimeType: "application/pdf", sizeBytes: 10 },
    { contentHash: SHA("f"), objectKey: `universe-source-imports/${OWNER}/${session.id}/s.pdf`, storedHash: SHA("f") },
  );
  assert.ok(file.objectKey.startsWith(`universe-source-imports/${OWNER}/`));
  assert.ok(!file.objectKey.startsWith("http"));
  assert.ok(!file.objectKey.includes("public"));
});
