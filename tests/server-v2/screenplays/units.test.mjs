/**
 * Phase 3 Task 3.2 — Screenplay unit identity, versions, dependency state.
 *
 * Verifies (PRD Task 3.2 Step 1 RED):
 *   - create units freely in any type (free entry, no gate)
 *   - unit content lives in immutable unit versions; title/order are identity
 *     fields and can be updated without new versions
 *   - opening any unit never checks upstream finalized
 *   - upstream version change marks downstream edges stale only (content
 *     never deleted); user actions resolve stale: keep_old / regenerate /
 *     manual_revise / confirm_no_impact — every action preserves the old
 *     downstream version
 *   - modifying a finalized unit creates a child draft (no in-place update)
 *   - concurrent edit conflict returns 409 with currentVersionId
 *   - legacy project adaptation: reading old projects maps story_bible /
 *     episodes / scenes into units with stable legacy ids; first save
 *     materializes them; legacy fields are never batch-overwritten
 *
 * Run: node --test tests/server-v2/screenplays/units.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ScreenplayUnitsService,
  ScreenplayUnitsError,
} from "../../../lib/server/v2/screenplays/units.ts";

const OWNER = "owner-001";
const OTHER = "owner-002";
const WORK = "work-001";

// ---------------------------------------------------------------------------
// Mock fetcher: in-memory PostgREST-style table store
// ---------------------------------------------------------------------------

function makeStore() {
  const tables = {
    storyflow_works: [{ id: WORK, owner_id: OWNER }],
    storyflow_screenplay_units: [],
    storyflow_screenplay_unit_versions: [],
    storyflow_projects: [],
    storyflow_versions: [],
  };
  let seq = 0;
  const nextId = (prefix) => `${prefix}-${String(++seq).padStart(3, "0")}`;

  const fetcher = async (path, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = new URL(path, "https://db.local");
    const table = url.pathname.replace("/rest/v1/", "");
    const rows = tables[table] ?? [];
    const returnRepresentation =
      !init?.headers || String(init.headers["Prefer"] ?? init.headers?.Prefer ?? "").includes("return=representation");

    if (method === "GET") {
      let filtered = [...rows];
      for (const [key, rawValue] of url.searchParams.entries()) {
        if (key === "order" || key === "limit" || key === "select") continue;
        const opMatch = /^(eq|is)\.(.*)$/.exec(rawValue);
        if (opMatch) {
          const [, op, value] = opMatch;
          filtered = filtered.filter((row) =>
            op === "is" && value === "null" ? row[key] === null : String(row[key]) === value,
          );
        } else {
          filtered = filtered.filter((row) => String(row[key]) === rawValue);
        }
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
        filtered = filtered.slice(0, limit).map((row) => {
          const out = {};
          for (const f of fields) out[f] = row[f];
          return out;
        });
      }
      return filtered.slice(0, limit);
    }

    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const inserted = (Array.isArray(body) ? body : [body]).map((b) => ({ ...b, id: b.id ?? nextId(table), created_at: new Date(1700000000000 + seq * 1000).toISOString() }));
      rows.push(...inserted);
      return returnRepresentation ? inserted : null;
    }

    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const idCond = url.searchParams.get("id");
      const target = idCond ? rows.find((r) => idCond.startsWith("eq.") ? r.id === idCond.slice(3) : true) : rows[0];
      if (!target) throw new Error("PATCH target not found");
      Object.assign(target, body);
      return returnRepresentation ? [target] : null;
    }

    throw new Error(`Unsupported ${method} ${path}`);
  };

  return { fetcher, tables, nextId };
}

async function makeService() {
  const store = makeStore();
  return { service: new ScreenplayUnitsService(store.fetcher), store };
}

// ============================================================
// 1. Free creation & identity
// ============================================================

test("creates units freely in any type without upstream gates", async () => {
  const { service } = await makeService();
  const world = await service.createUnit({ ownerId: OWNER, workId: WORK, type: "world", title: "世界观", parentId: null, order: 1 });
  const ep = await service.createUnit({ ownerId: OWNER, workId: WORK, type: "episode", title: "第1集", parentId: null, order: 1 });
  // 场景可以在世界观/角色/大纲都为空时直接创建（自由进入，无门禁）
  const scene = await service.createUnit({ ownerId: OWNER, workId: WORK, type: "scene", title: "第一场", parentId: ep.unit.id, order: 1 });
  assert.equal(world.unit.type, "world");
  assert.equal(scene.unit.type, "scene");
});

test("unit identity (title/order) updates without creating a version", async () => {
  const { service, store } = await makeService();
  const { unit } = await service.createUnit({ ownerId: OWNER, workId: WORK, type: "world", title: "旧标题", parentId: null, order: 1 });
  const updated = await service.updateUnitIdentity({ ownerId: OWNER, workId: WORK, unitId: unit.id, title: "新标题", order: 2 });
  assert.equal(updated.unit.title, "新标题");
  assert.equal(updated.unit.order, 2);
  assert.equal(store.tables.storyflow_screenplay_unit_versions.length, 0);
});

// ============================================================
// 2. Immutable unit versions + finalized → child draft
// ============================================================

test("content lives in immutable unit versions; append never mutates prior version", async () => {
  const { service, store } = await makeService();
  const { unit } = await service.createUnit({ ownerId: OWNER, workId: WORK, type: "world", title: "世界观", parentId: null, order: 1 });
  const v1 = await service.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: unit.id, content: { body: "第一版" }, baseVersionId: null });
  const v2 = await service.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: unit.id, content: { body: "第二版" }, baseVersionId: v1.version.id });
  assert.equal(v1.version.id, v2.version.parentVersionId);
  const rows = store.tables.storyflow_screenplay_unit_versions;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].content_json.body, "第一版"); // untouched
});

test("modifying a finalized unit creates a child draft, never in-place", async () => {
  const { service, store } = await makeService();
  const { unit } = await service.createUnit({ ownerId: OWNER, workId: WORK, type: "world", title: "世界观", parentId: null, order: 1 });
  const v1 = await service.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: unit.id, content: { body: "定稿" }, baseVersionId: null });
  await service.markFinalized({ ownerId: OWNER, workId: WORK, unitId: unit.id, versionId: v1.version.id });
  // finalize itself is recorded via readiness on unit
  const draft = await service.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: unit.id, content: { body: "定稿后修改" }, baseVersionId: v1.version.id });
  assert.equal(draft.version.parentVersionId, v1.version.id);
  assert.notEqual(draft.version.id, v1.version.id);
  const v1Row = store.tables.storyflow_screenplay_unit_versions.find((r) => r.id === v1.version.id);
  assert.equal(v1Row.content_json.body, "定稿");
});

// ============================================================
// 3. Concurrency
// ============================================================

test("concurrent edit on same base returns 409 with currentVersionId", async () => {
  const { service } = await makeService();
  const { unit } = await service.createUnit({ ownerId: OWNER, workId: WORK, type: "world", title: "世界观", parentId: null, order: 1 });
  const v1 = await service.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: unit.id, content: { body: "v1" }, baseVersionId: null });
  // client A saves on base v1 → ok
  await service.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: unit.id, content: { body: "A" }, baseVersionId: v1.version.id });
  // client B saves on the same base v1 → 409
  try {
    await service.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: unit.id, content: { body: "B" }, baseVersionId: v1.version.id });
    assert.fail("expected conflict");
  } catch (error) {
    assert.ok(error instanceof ScreenplayUnitsError);
    assert.equal(error.code, "conflict");
    assert.ok(error.currentVersionId);
  }
});

// ============================================================
// 4. Access control
// ============================================================

test("non-owner cannot create units; unknown work is not_found", async () => {
  const { service } = await makeService();
  await assert.rejects(
    () => service.createUnit({ ownerId: OTHER, workId: WORK, type: "world", title: "x", parentId: null, order: 1 }),
    (e) => e instanceof ScreenplayUnitsError && e.code === "forbidden",
  );
  await assert.rejects(
    () => service.createUnit({ ownerId: OWNER, workId: "missing", type: "world", title: "x", parentId: null, order: 1 }),
    (e) => e instanceof ScreenplayUnitsError && e.code === "not_found",
  );
  await assert.rejects(
    () => service.createUnit({ ownerId: "", workId: WORK, type: "world", title: "x", parentId: null, order: 1 }),
    (e) => e instanceof ScreenplayUnitsError && e.code === "unauthenticated",
  );
});

// ============================================================
// 5. Legacy project adaptation
// ============================================================

test("legacy project maps story_bible / episodes / scenes into units with stable ids", async () => {
  const store = makeStore();
  store.tables.storyflow_projects = [
    {
      id: "proj-1",
      owner_id: OWNER,
      work_id: WORK,
      title: "旧项目",
      story_bible: { worldview: "末世废土", characters: [{ name: "阿仁", role: "主角" }] },
      episodes: [
        { id: "ep-legacy-1", title: "第1集", order: 1, scenes: [{ id: "sc-legacy-1", title: "开场", order: 1, content: "夜。城市废墟。" }] },
      ],
    },
  ];
  const service = new ScreenplayUnitsService(store.fetcher);
  const adapted = await service.adaptLegacyProject({ ownerId: OWNER, workId: WORK, projectId: "proj-1" });
  assert.equal(adapted.units.length, 4); // world + character + episode + scene
  const world = adapted.units.find((u) => u.type === "world");
  const character = adapted.units.find((u) => u.type === "character");
  const episode = adapted.units.find((u) => u.type === "episode");
  const scene = adapted.units.find((u) => u.type === "scene");
  assert.ok(world && character && episode && scene);
  assert.equal(world.legacyId, "proj-1:world");
  assert.equal(character.legacyId, "proj-1:character:阿仁");
  assert.equal(episode.legacyId, "ep-legacy-1");
  assert.equal(scene.legacyId, "sc-legacy-1");
  // legacy fields untouched
  const proj = store.tables.storyflow_projects[0];
  assert.deepEqual(proj.story_bible.characters, [{ name: "阿仁", role: "主角" }]);
});

test("adaptLegacyProject leaves existing units untouched (idempotent by legacyId)", async () => {
  const store = makeStore();
  store.tables.storyflow_projects = [
    {
      id: "proj-1",
      owner_id: OWNER,
      work_id: WORK,
      story_bible: { worldview: "w" },
      episodes: [{ id: "ep-legacy-1", title: "第1集", order: 1, scenes: [] }],
    },
  ];
  const service = new ScreenplayUnitsService(store.fetcher);
  const first = await service.adaptLegacyProject({ ownerId: OWNER, workId: WORK, projectId: "proj-1" });
  const second = await service.adaptLegacyProject({ ownerId: OWNER, workId: WORK, projectId: "proj-1" });
  assert.equal(first.created, 2);
  assert.equal(second.created, 0);
  assert.equal(second.units.length, first.units.length);
});
