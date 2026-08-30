/**
 * Phase 5 Task 5.1 — WorkUsageLink 跨工作流关系 (RED).
 *
 * Verifies:
 *   - cross-owner source without an Active Usage Grant → forbidden
 *   - active grant (grantee=owner, scope=use, status=active) → allowed
 *   - sourceVersion not belonging to sourceWork → validation_failed
 *   - cycle (A→B then B→A, or self A→A) → conflict
 *   - duplicate create is idempotent (same link returned, no extra row)
 *   - revoking a grant blocks NEW links but keeps historical links
 *   - "update source" appends a new link, never overwrites the old one
 *   - audit: no orphaned work/version/asset/grant references
 *   - invalid usageRole rejected
 *
 * Run: node --test tests/server-v2/work-usage/work-usage.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  WorkUsageService,
  WorkUsageError,
} from "../../../lib/server/v2/work-usage/index.ts";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";

function makeStore(seed = {}) {
  const tables = {
    storyflow_works: [
      { id: "work-src", owner_id: OWNER_A, project_id: "proj-src", work_type: "screenplay" },
      { id: "work-art", owner_id: OWNER_A, project_id: "proj-1", work_type: "art" },
      { id: "work-b", owner_id: OWNER_B, project_id: "proj-b", work_type: "storyboard" },
    ],
    storyflow_work_versions: [
      { id: "wv-src-1", work_id: "work-src" },
      { id: "wv-src-2", work_id: "work-src" },
      { id: "wv-art-1", work_id: "work-art" },
      { id: "wv-b-1", work_id: "work-b" },
    ],
    storyflow_work_usage_links: [],
    storyflow_resource_grants: [],
    storyflow_asset_versions: [
      { id: "av-1", work_id: "work-art" },
    ],
    ...seed,
  };
  let seq = 0;
  const nextId = () => `link-${String(++seq).padStart(4, "0")}`;

  const fetcher = async (path, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = new URL(path, "https://db.local");
    const table = url.pathname.replace("/rest/v1/", "").split("?")[0];
    const rows = tables[table];
    if (!rows) throw new Error(`Unknown table ${table}`);

    if (method === "GET") {
      let filtered = [...rows];
      for (const [key, raw] of url.searchParams.entries()) {
        if (["order", "limit", "select"].includes(key)) continue;
        const m = /^(eq|is)\.(.*)$/.exec(raw);
        if (m) {
          filtered = filtered.filter((r) =>
            m[1] === "is" && m[2] === "null" ? r[key] == null : String(r[key]) === m[2],
          );
        }
      }
      const order = url.searchParams.get("order");
      if (order?.startsWith("created_at")) {
        filtered.sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
      }
      return filtered.slice(0, Number(url.searchParams.get("limit") ?? filtered.length));
    }

    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const row = { id: body.id ?? nextId(), created_at: "2026-08-16T00:00:00Z", ...body };
      tables[table].push(row);
      return init?.headers?.Prefer?.includes("return=representation") ? [row] : [row];
    }

    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      let updated = [];
      for (const [key, raw] of url.searchParams.entries()) {
        if (["select"].includes(key)) continue;
        const m = /^(eq|is)\.(.*)$/.exec(raw);
        if (m) {
          const matched = rows.filter((r) =>
            m[1] === "is" && m[2] === "null" ? r[key] == null : String(r[key]) === m[2],
          );
          for (const row of matched) Object.assign(row, body);
          updated = [...matched];
        }
      }
      return updated;
    }
    throw new Error(`Unsupported ${method} ${path}`);
  };
  return { fetcher, tables };
}

function makeService(seed) {
  const store = makeStore(seed);
  return { service: new WorkUsageService(store.fetcher), store };
}

const baseInput = {
  ownerId: OWNER_A,
  sourceWorkId: "work-src",
  sourceWorkVersionId: "wv-src-1",
  targetProjectId: "proj-1",
  targetWorkId: "work-art",
  targetEntityType: "asset",
  targetEntityId: "art-1",
  usageRole: "art_reference",
};

// ============================================================
// 1. Ownership & grants
// ============================================================

test("cross-owner source without a grant is forbidden", async () => {
  const { service } = makeService();
  await assert.rejects(
    () => service.createLink({ ...baseInput, ownerId: OWNER_B }),
    (e) => e instanceof WorkUsageError && e.code === "forbidden",
  );
});

test("active grant from source owner allows the link", async () => {
  const { service, store } = makeService();
  store.tables.storyflow_resource_grants.push({
    id: "grant-1",
    resource_type: "work",
    resource_id: "work-src",
    grantor_id: OWNER_A,
    grantee_id: OWNER_B,
    scope: "use",
    terms: { purpose: "art production" },
    status: "active",
    idempotency_key: "g1",
  });
  const link = await service.createLink({ ...baseInput, ownerId: OWNER_B, grantId: "grant-1", targetWorkId: "work-b", targetProjectId: "proj-b" });
  assert.equal(link.sourceWorkId, "work-src");
  assert.equal(link.rightsSnapshotId, "grant-1");
  assert.equal(link.createdAt, "2026-08-16T00:00:00Z");
});

test("revoked grant blocks a new link but keeps historical links", async () => {
  const { service, store } = makeService();
  store.tables.storyflow_resource_grants.push({
    id: "grant-1",
    resource_type: "work",
    resource_id: "work-src",
    grantor_id: OWNER_A,
    grantee_id: OWNER_B,
    scope: "use",
    terms: {},
    status: "revoked",
    idempotency_key: "g1",
  });
  // historical link (created while grant was active)
  store.tables.storyflow_work_usage_links.push({
    id: "link-historical",
    source_work_id: "work-src",
    source_work_version_id: "wv-src-1",
    target_project_id: "proj-1",
    target_work_id: "work-b",
    target_entity_type: null,
    target_entity_id: null,
    usage_role: "art_reference",
    asset_version_id: null,
    rights_snapshot_id: "grant-1",
    created_at: "2026-08-01T00:00:00Z",
  });
  await assert.rejects(
    () => service.createLink({ ...baseInput, ownerId: OWNER_B, grantId: "grant-1", targetWorkId: "work-b", targetProjectId: "proj-b" }),
    (e) => e instanceof WorkUsageError && e.code === "forbidden",
  );
  // historical link survives
  const links = await service.listLinks({ ownerId: OWNER_A, workId: "work-src", direction: "outgoing" });
  assert.equal(links.length, 1);
  assert.equal(links[0].id, "link-historical");
});

// ============================================================
// 2. Version integrity
// ============================================================

test("sourceVersion not belonging to sourceWork is rejected", async () => {
  const { service } = makeService();
  await assert.rejects(
    () => service.createLink({ ...baseInput, sourceWorkVersionId: "wv-b-1" }),
    (e) => e instanceof WorkUsageError && e.code === "validation_failed",
  );
});

test("forged target Work owned by another creator is rejected", async () => {
  const { service } = makeService();
  await assert.rejects(
    () => service.createLink({ ...baseInput, ownerId: OWNER_B, sourceWorkId: "work-b", sourceWorkVersionId: "wv-b-1", targetWorkId: "work-art", targetProjectId: "proj-1" }),
    (e) => e instanceof WorkUsageError && e.code === "forbidden",
  );
});

// ============================================================
// 3. Cycle protection
// ============================================================

test("self-cycle (A→A) is rejected", async () => {
  const { service } = makeService();
  await assert.rejects(
    () => service.createLink({ ...baseInput, targetWorkId: "work-src", targetProjectId: "proj-src" }),
    (e) => e instanceof WorkUsageError && e.code === "conflict",
  );
});

test("A→B then B→A is rejected as a cycle", async () => {
  const { service, store } = makeService();
  store.tables.storyflow_work_usage_links.push({
    id: "link-ab",
    source_work_id: "work-src",
    source_work_version_id: "wv-src-1",
    target_project_id: "proj-1",
    target_work_id: "work-art",
    target_entity_type: null,
    target_entity_id: null,
    usage_role: "art_reference",
    asset_version_id: null,
    rights_snapshot_id: null,
    created_at: "2026-08-01T00:00:00Z",
  });
  await assert.rejects(
    () => service.createLink({ ...baseInput, sourceWorkId: "work-art", sourceWorkVersionId: "wv-art-1", targetWorkId: "work-src", targetProjectId: "proj-src" }),
    (e) => e instanceof WorkUsageError && e.code === "conflict",
  );
});

// ============================================================
// 4. Idempotency & append-only
// ============================================================

test("duplicate create returns the same link (idempotent)", async () => {
  const { service } = makeService();
  const first = await service.createLink(baseInput);
  const second = await service.createLink(baseInput);
  assert.equal(second.id, first.id);
  assert.equal(second.idempotent, true);
  assert.equal(second.createdAt, first.createdAt);
});

test("updating the source appends a new link, never overwrites", async () => {
  const { service, store } = makeService();
  await service.createLink(baseInput);
  await service.createLink({ ...baseInput, sourceWorkVersionId: "wv-src-2" });
  const rows = store.tables.storyflow_work_usage_links;
  assert.equal(rows.length, 2);
  const versions = rows.map((r) => r.source_work_version_id).sort();
  assert.deepEqual(versions, ["wv-src-1", "wv-src-2"]);
  // original row unchanged (append-only)
  assert.equal(rows[0].source_work_version_id, "wv-src-1");
});

// ============================================================
// 5. Role validation & audit
// ============================================================

test("invalid usageRole is rejected", async () => {
  const { service } = makeService();
  await assert.rejects(
    () => service.createLink({ ...baseInput, usageRole: "not_a_role" }),
    (e) => e instanceof WorkUsageError && e.code === "validation_failed",
  );
});

test("audit finds no orphaned references on a clean store", async () => {
  const { service } = makeService();
  await service.createLink(baseInput);
  const orphans = await service.auditOrphans();
  assert.deepEqual(orphans, []);
});

test("audit reports orphaned target work references", async () => {
  const { service, store } = makeService();
  store.tables.storyflow_work_usage_links.push({
    id: "link-orphan",
    source_work_id: "work-src",
    source_work_version_id: "wv-src-1",
    target_project_id: "proj-1",
    target_work_id: "work-gone",
    target_entity_type: null,
    target_entity_id: null,
    usage_role: "art_reference",
    asset_version_id: null,
    rights_snapshot_id: "grant-gone",
    created_at: "2026-08-01T00:00:00Z",
  });
  const orphans = await service.auditOrphans();
  assert.ok(orphans.some((o) => o.reason === "missing_target_work" && o.linkId === "link-orphan"));
  assert.ok(orphans.some((o) => o.reason === "missing_grant" && o.linkId === "link-orphan"));
});
