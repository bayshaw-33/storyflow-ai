/**
 * Phase 3 Task 3.5 — long-screenplay continuity & impact analysis.
 *
 * Verifies (PRD Task 3.5 Step 1 RED):
 *   - conflicts (character name / relationship / timeline / prop rules) are
 *     located to episode, scene, unit version and text range — never a bare
 *     "possible conflict"
 *   - incremental index: modifying one scene only reindexes affected units,
 *     not the whole screenplay
 *   - reference list exposes Context Packet universe objects with version and
 *     reason; never the raw prompt blob
 *   - dispositions (ignore / revise / candidate / universe proposal) each
 *     write an evidence event
 *
 * Run: node --test tests/server-v2/screenplays/continuity.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ScreenplayContinuityService,
  ScreenplayContinuityError,
} from "../../../lib/server/v2/screenplays/continuity.ts";

const OWNER = "owner-001";
const WORK = "work-001";

function makeStore() {
  const tables = {
    storyflow_works: [{ id: WORK, owner_id: OWNER }],
    storyflow_screenplay_units: [],
    storyflow_screenplay_unit_versions: [],
    storyflow_continuity_index: [],
    storyflow_continuity_findings: [],
    storyflow_evidence_events: [],
  };
  let seq = 0;
  const nextId = (prefix) => `${prefix}-${String(++seq).padStart(3, "0")}`;

  const fetcher = async (path, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = new URL(path, "https://db.local");
    const table = url.pathname.replace("/rest/v1/", "");
    const rows = tables[table] ?? [];

    if (method === "GET") {
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
      const inserted = (Array.isArray(body) ? body : [body]).map((b) => ({ ...b, id: b.id ?? nextId(table), created_at: new Date(1700000000000 + seq * 1000).toISOString() }));
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

    if (method === "DELETE") {
      const idCond = url.searchParams.get("id");
      const idx = rows.findIndex((r) => r.id === idCond?.slice(3));
      if (idx >= 0) rows.splice(idx, 1);
      return [];
    }

    throw new Error(`Unsupported ${method} ${path}`);
  };

  return { fetcher, tables };
}

function seedUnits(store) {
  // 2 episodes × 2 scenes; episode 2 scene 1 references a character name
  // inconsistently ("阿仁" vs "阿任") for conflict detection.
  const units = [
    { id: "u-ep-1", work_id: WORK, type: "episode", parent_id: null, order_index: 1, title: "第1集", readiness: "draft", current_version_id: "uv-ep1", finalized_version_id: null, legacy_id: null },
    { id: "u-sc-1", work_id: WORK, type: "scene", parent_id: "u-ep-1", order_index: 1, title: "第1场", readiness: "draft", current_version_id: "uv-sc1", finalized_version_id: null, legacy_id: null },
    { id: "u-sc-2", work_id: WORK, type: "scene", parent_id: "u-ep-1", order_index: 2, title: "第2场", readiness: "draft", current_version_id: "uv-sc2", finalized_version_id: null, legacy_id: null },
    { id: "u-ep-2", work_id: WORK, type: "episode", parent_id: null, order_index: 2, title: "第2集", readiness: "draft", current_version_id: "uv-ep2", finalized_version_id: null, legacy_id: null },
    { id: "u-sc-3", work_id: WORK, type: "scene", parent_id: "u-ep-2", order_index: 1, title: "第3场", readiness: "draft", current_version_id: "uv-sc3", finalized_version_id: null, legacy_id: null },
    { id: "u-sc-4", work_id: WORK, type: "scene", parent_id: "u-ep-2", order_index: 2, title: "第4场", readiness: "draft", current_version_id: "uv-sc4", finalized_version_id: null, legacy_id: null },
  ];
  const versions = [
    { id: "uv-ep1", work_id: WORK, unit_id: "u-ep-1", parent_version_id: null, content_schema: "kiikis.screenplay-unit/1", content_json: { body: "阿仁进入废墟。", names: ["阿仁"] }, content_hash: "h1", source: "manual", source_message_ids: [], created_at: new Date(1700000000000).toISOString() },
    { id: "uv-sc1", work_id: WORK, unit_id: "u-sc-1", parent_version_id: null, content_schema: "kiikis.screenplay-unit/1", content_json: { body: "阿仁抬头看天。", names: ["阿仁"] }, content_hash: "h2", source: "manual", source_message_ids: [], created_at: new Date(1700000001000).toISOString() },
    { id: "uv-sc2", work_id: WORK, unit_id: "u-sc-2", parent_version_id: null, content_schema: "kiikis.screenplay-unit/1", content_json: { body: "阿任（错别字）跑过街道。", names: ["阿任"] }, content_hash: "h3", source: "manual", source_message_ids: [], created_at: new Date(1700000002000).toISOString() },
    { id: "uv-ep2", work_id: WORK, unit_id: "u-ep-2", parent_version_id: null, content_schema: "kiikis.screenplay-unit/1", content_json: { body: "第二集。", names: [] }, content_hash: "h4", source: "manual", source_message_ids: [], created_at: new Date(1700000003000).toISOString() },
    { id: "uv-sc3", work_id: WORK, unit_id: "u-sc-3", parent_version_id: null, content_schema: "kiikis.screenplay-unit/1", content_json: { body: "阿仁与阿任对话。", names: ["阿仁", "阿任"] }, content_hash: "h5", source: "manual", source_message_ids: [], created_at: new Date(1700000004000).toISOString() },
    { id: "uv-sc4", work_id: WORK, unit_id: "u-sc-4", parent_version_id: null, content_schema: "kiikis.screenplay-unit/1", content_json: { body: "夜。", names: [] }, content_hash: "h6", source: "manual", source_message_ids: [], created_at: new Date(1700000005000).toISOString() },
  ];
  store.tables.storyflow_screenplay_units.push(...units);
  store.tables.storyflow_screenplay_unit_versions.push(...versions);
  return { units, versions };
}

// ============================================================
// 1. Conflict localization
// ============================================================

test("name conflict is located to episode, scene, unit version and text range", async () => {
  const store = makeStore();
  seedUnits(store);
  const service = new ScreenplayContinuityService(store.fetcher);
  const { findings } = await service.analyze({ ownerId: OWNER, workId: WORK });
  assert.ok(findings.length > 0, "findings must exist");
  const nameConflict = findings.find((f) => f.kind === "name_inconsistency");
  assert.ok(nameConflict, "name inconsistency finding exists");
  // localization contract
  assert.ok(nameConflict.locations.length > 0);
  for (const loc of nameConflict.locations) {
    assert.ok(loc.episodeId, "episode id");
    assert.ok(loc.sceneId, "scene id");
    assert.ok(loc.unitVersionId, "unit version id");
    assert.ok(typeof loc.textStart === "number" && typeof loc.textEnd === "number", "text range");
    assert.ok(loc.textStart <= loc.textEnd);
  }
});

test("findings never return a bare 'possible conflict' without location", async () => {
  const store = makeStore();
  seedUnits(store);
  const service = new ScreenplayContinuityService(store.fetcher);
  const { findings } = await service.analyze({ ownerId: OWNER, workId: WORK });
  for (const f of findings) {
    assert.ok(f.locations && f.locations.length > 0, `finding ${f.kind} must carry locations`);
  }
});

// ============================================================
// 2. Incremental indexing
// ============================================================

test("reindexing one scene only touches that unit's index entries", async () => {
  const store = makeStore();
  seedUnits(store);
  const service = new ScreenplayContinuityService(store.fetcher);
  await service.reindexAll({ ownerId: OWNER, workId: WORK });
  const before = store.tables.storyflow_continuity_index.length;
  assert.ok(before > 0);

  // update scene 4's content
  const sc4 = store.tables.storyflow_screenplay_unit_versions.find((v) => v.unit_id === "u-sc-4");
  sc4.content_json = { body: "夜。阿仁独自离开。", names: ["阿仁"] };
  const result = await service.reindexUnit({ ownerId: OWNER, workId: WORK, unitId: "u-sc-4" });
  assert.ok(result.reindexedVersionIds.includes("uv-sc4"));
  assert.ok(!result.reindexedVersionIds.includes("uv-sc1"), "other units untouched");
  const sc4Entries = store.tables.storyflow_continuity_index.filter((e) => e.unit_version_id === "uv-sc4");
  assert.ok(sc4Entries.some((e) => e.term === "阿仁"), "new name indexed");
});

// ============================================================
// 3. Reference list (Context Packet visibility)
// ============================================================

test("reference list exposes universe objects with version and reason, not prompt blob", async () => {
  const store = makeStore();
  seedUnits(store);
  const service = new ScreenplayContinuityService(store.fetcher);
  const { references } = await service.listReferences({ ownerId: OWNER, workId: WORK, packetId: "packet-1" });
  for (const ref of references) {
    assert.ok(ref.type && ref.id && ref.versionId, "object identity");
    assert.ok(ref.reason, "reason is visible");
    assert.ok(!("prompt" in ref) && !("promptBlob" in ref), "no raw prompt");
  }
});

// ============================================================
// 4. Dispositions write evidence
// ============================================================

test("every disposition writes an evidence event", async () => {
  const store = makeStore();
  seedUnits(store);
  const service = new ScreenplayContinuityService(store.fetcher);
  const { findings } = await service.analyze({ ownerId: OWNER, workId: WORK });
  const finding = findings[0];
  for (const action of ["ignore", "revise", "create_candidate", "universe_proposal"]) {
    const result = await service.disposeFinding({ ownerId: OWNER, workId: WORK, findingId: finding.id, action, note: `via ${action}` });
    assert.equal(result.disposed, true);
  }
  const events = store.tables.storyflow_evidence_events.filter((e) => e.work_id === WORK);
  assert.equal(events.length, 4);
  assert.ok(events.every((e) => e.kind === "continuity_disposition"));
});

test("dispose rejects unknown action", async () => {
  const store = makeStore();
  seedUnits(store);
  const service = new ScreenplayContinuityService(store.fetcher);
  const { findings } = await service.analyze({ ownerId: OWNER, workId: WORK });
  await assert.rejects(
    () => service.disposeFinding({ ownerId: OWNER, workId: WORK, findingId: findings[0].id, action: "delete_everything" }),
    (e) => e instanceof ScreenplayContinuityError && e.code === "validation_failed",
  );
});
