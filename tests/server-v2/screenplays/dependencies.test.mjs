/**
 * Phase 3 Task 3.2 — dependency edges & stale semantics.
 *
 * Verifies (PRD Task 3.2 Step 1/3 RED):
 *   - saving downstream content records dependency edges pointing at the
 *     upstream unit version actually referenced
 *   - upstream version change only marks edges stale; downstream content is
 *     never deleted
 *   - stale resolution actions: keep_old / regenerate / manual_revise /
 *     confirm_no_impact — every action preserves the old downstream version
 *     and writes an evidence trail
 *   - stale edges are the ONLY thing flagged; downstream readiness is not
 *     reset
 *
 * Run: node --test tests/server-v2/screenplays/dependencies.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ScreenplayDependenciesService,
  ScreenplayDependenciesError,
} from "../../../lib/server/v2/screenplays/dependencies.ts";
import { ScreenplayUnitsService } from "../../../lib/server/v2/screenplays/units.ts";

const OWNER = "owner-001";
const WORK = "work-001";

function makeStore() {
  const tables = {
    storyflow_works: [{ id: WORK, owner_id: OWNER }],
    storyflow_screenplay_units: [],
    storyflow_screenplay_unit_versions: [],
    storyflow_screenplay_dependency_edges: [],
    storyflow_stale_resolutions: [],
  };
  let seq = 0;
  const nextId = (prefix) => `${prefix}-${String(++seq).padStart(3, "0")}`;

  const fetcher = async (path, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = new URL(path, "https://db.local");
    const table = url.pathname.replace("/rest/v1/", "");
    const rows = tables[table] ?? [];
    const prefer = init?.headers ? String(init.headers["Prefer"] ?? "") : "";

    if (method === "GET") {
      let filtered = [...rows];
      for (const [key, rawValue] of url.searchParams.entries()) {
        if (key === "order" || key === "limit" || key === "select") continue;
        const opMatch = /^(eq|is|in)\.(.*)$/.exec(rawValue);
        if (opMatch) {
          const [, op, value] = opMatch;
          if (op === "in") {
            const list = value.replace(/[()]/g, "").split(",").map((s) => s.trim());
            filtered = filtered.filter((row) => list.includes(String(row[key])));
          } else {
            filtered = filtered.filter((row) =>
              op === "is" && value === "null" ? row[key] === null : String(row[key]) === value,
            );
          }
        } else {
          filtered = filtered.filter((row) => String(row[key]) === rawValue);
        }
      }
      const order = url.searchParams.get("order");
      if (order) {
        const [field, dir] = order.split(".");
        filtered = filtered.sort((a, b) => (dir === "desc" ? String(b[field]).localeCompare(String(a[field])) : String(a[field]).localeCompare(String(a[field]))));
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
      return prefer.includes("return=representation") ? inserted : null;
    }

    if (method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const idCond = url.searchParams.get("id");
      const targets = idCond ? rows.filter((r) => r.id === idCond.slice(3)) : [];
      for (const t of targets) Object.assign(t, body);
      return prefer.includes("return=representation") ? targets : null;
    }

    throw new Error(`Unsupported ${method} ${path}`);
  };

  return { fetcher, tables };
}

async function makeServices() {
  const store = makeStore();
  return {
    units: new ScreenplayUnitsService(store.fetcher),
    deps: new ScreenplayDependenciesService(store.fetcher),
    store,
  };
}

async function seedEpisodeWithScene(services) {
  const { units } = services;
  const world = await units.createUnit({ ownerId: OWNER, workId: WORK, type: "world", title: "世界观", parentId: null, order: 1 });
  const worldV1 = await units.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: world.unit.id, content: { body: "世界规则" }, baseVersionId: null });
  await units.markFinalized({ ownerId: OWNER, workId: WORK, unitId: world.unit.id, versionId: worldV1.version.id });
  const character = await units.createUnit({ ownerId: OWNER, workId: WORK, type: "character", title: "主角", parentId: null, order: 1 });
  const characterV1 = await units.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: character.unit.id, content: { body: "角色圣经" }, baseVersionId: null });
  await units.markFinalized({ ownerId: OWNER, workId: WORK, unitId: character.unit.id, versionId: characterV1.version.id });
  const outline = await units.createUnit({ ownerId: OWNER, workId: WORK, type: "outline", title: "总大纲", parentId: null, order: 1 });
  const outlineV1 = await units.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: outline.unit.id, content: { body: "三幕结构" }, baseVersionId: null, references: [{ unitId: null, unitVersionId: null }] });
  await units.markFinalized({ ownerId: OWNER, workId: WORK, unitId: outline.unit.id, versionId: outlineV1.version.id });
  const ep = await units.createUnit({ ownerId: OWNER, workId: WORK, type: "episode", title: "第1集", parentId: outline.unit.id, order: 1 });
  const epV1 = await units.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: ep.unit.id, content: { body: "第一集梗概" }, baseVersionId: null, references: [{ unitId: outline.unit.id, unitVersionId: outlineV1.version.id }] });
  await units.markFinalized({ ownerId: OWNER, workId: WORK, unitId: ep.unit.id, versionId: epV1.version.id });
  const scene = await units.createUnit({ ownerId: OWNER, workId: WORK, type: "scene", title: "开场", parentId: ep.unit.id, order: 1 });
  const sceneV1 = await units.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: scene.unit.id, content: { body: "夜。废墟。" }, baseVersionId: null, references: [{ unitId: ep.unit.id, unitVersionId: epV1.version.id }] });
  return { outline, outlineV1, ep, epV1, scene, sceneV1 };
}

// ============================================================
// 1. Edge recording
// ============================================================

test("saving downstream content records dependency edge at the referenced upstream version", async () => {
  const services = await makeServices();
  const { ep, epV1, scene, sceneV1 } = await seedEpisodeWithScene(services);
  const edges = services.store.tables.storyflow_screenplay_dependency_edges;
  const edge = edges.find((e) => e.target_unit_version_id === sceneV1.version.id);
  assert.ok(edge, "edge recorded for scene version");
  assert.equal(edge.source_unit_id, ep.unit.id);
  assert.equal(edge.source_unit_version_id, epV1.version.id);
  assert.equal(edge.state, "current");
});

// ============================================================
// 2. Upstream change → stale only, never delete
// ============================================================

test("upstream version change marks downstream edge stale; content untouched", async () => {
  const services = await makeServices();
  const { ep, scene, sceneV1 } = await seedEpisodeWithScene(services);
  // upstream saves a new version
  const epV2 = await services.units.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: ep.unit.id, content: { body: "第一集梗概（改）" }, baseVersionId: (await latestVersion(services, ep.unit.id)).id });
  // recompute stale
  await services.deps.recomputeStale({ ownerId: OWNER, workId: WORK });
  const edges = services.store.tables.storyflow_screenplay_dependency_edges;
  const edge = edges.find((e) => e.target_unit_version_id === sceneV1.version.id);
  assert.equal(edge.state, "stale");
  // downstream content NOT deleted
  const sceneRows = services.store.tables.storyflow_screenplay_unit_versions.filter((r) => r.unit_id === scene.unit.id);
  assert.equal(sceneRows.length, 1);
  assert.equal(sceneRows[0].content_json.body, "夜。废墟。");
  void epV2;
});

async function latestVersion(services, unitId) {
  const rows = services.store.tables.storyflow_screenplay_unit_versions.filter((r) => r.unit_id === unitId);
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last = sorted[sorted.length - 1];
  return { id: last.id };
}

// ============================================================
// 3. Stale resolution actions
// ============================================================

test("each stale resolution action preserves the old downstream version and writes evidence", async () => {
  const services = await makeServices();
  const { ep, scene, sceneV1 } = await seedEpisodeWithScene(services);
  await services.units.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: ep.unit.id, content: { body: "改" }, baseVersionId: (await latestVersion(services, ep.unit.id)).id });
  await services.deps.recomputeStale({ ownerId: OWNER, workId: WORK });

  for (const action of ["keep_old", "regenerate", "manual_revise", "confirm_no_impact"]) {
    const result = await services.deps.resolveStale({ ownerId: OWNER, workId: WORK, action, upstreamUnitId: ep.unit.id, downstreamUnitId: scene.unit.id, note: `handled via ${action}` });
    assert.equal(result.resolved, true);
    assert.equal(result.action, action);
    // downstream version rows untouched
    const sceneRows = services.store.tables.storyflow_screenplay_unit_versions.filter((r) => r.unit_id === scene.unit.id);
    assert.equal(sceneRows.length, 1);
    assert.equal(sceneRows[0].id, sceneV1.version.id);
    // re-trigger staleness for the next action: upstream saves again
    await services.units.saveUnitContent({ ownerId: OWNER, workId: WORK, unitId: ep.unit.id, content: { body: `改(${action})` }, baseVersionId: (await latestVersion(services, ep.unit.id)).id });
    await services.deps.recomputeStale({ ownerId: OWNER, workId: WORK });
  }
  const resolutions = services.store.tables.storyflow_stale_resolutions;
  assert.equal(resolutions.length, 4);
  assert.ok(resolutions.every((r) => r.downstream_unit_id === scene.unit.id));
});

test("resolveStale rejects unknown action and unauthenticated caller", async () => {
  const services = await makeServices();
  const { ep, scene } = await seedEpisodeWithScene(services);
  await assert.rejects(
    () => services.deps.resolveStale({ ownerId: OWNER, workId: WORK, action: "delete_downstream", upstreamUnitId: ep.unit.id, downstreamUnitId: scene.unit.id }),
    (e) => e instanceof ScreenplayDependenciesError && e.code === "validation_failed",
  );
  await assert.rejects(
    () => services.deps.resolveStale({ ownerId: "", workId: WORK, action: "keep_old", upstreamUnitId: ep.unit.id, downstreamUnitId: scene.unit.id }),
    (e) => e instanceof ScreenplayDependenciesError && e.code === "unauthenticated",
  );
});
