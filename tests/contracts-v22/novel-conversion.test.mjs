/**
 * 2026-08-16 novel→script conversion contracts.
 *
 * Owner decision: the 45 retired-novel projects are converted to script
 * projects (migration 20260829040000) instead of being deleted. These tests
 * pin the app-side behaviors that make converted projects openable:
 *   - isRetiredNovelRecord no longer fires after markers become 'script'
 *   - adaptLegacyProject understands the novel bible shape (world as text,
 *     characterRelationships as prose)
 *
 * Run: node --test tests/contracts-v22/novel-conversion.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import { isRetiredNovelRecord } from "../../lib/v2/retired-novel.ts";
import { ScreenplayUnitsService, ScreenplayUnitsError } from "../../lib/server/v2/screenplays/units.ts";

// ---------------------------------------------------------------------------
// Marker semantics after conversion
// ---------------------------------------------------------------------------

test("isRetiredNovelRecord: false after markers are converted to script", () => {
  const converted = {
    workflow_type: "script",
    mode: null,
    data: { workflowType: "script" },
  };
  assert.equal(isRetiredNovelRecord(converted), false);
});

test("isRetiredNovelRecord: still true for unconverted novel markers (safety net)", () => {
  assert.equal(isRetiredNovelRecord({ workflow_type: "novel" }), true);
  assert.equal(isRetiredNovelRecord({ data: { workType: "novel" } }), true);
  assert.equal(isRetiredNovelRecord({ mode: "novel" }), true);
});

test("isRetiredNovelRecord: never inspects titles or content", () => {
  assert.equal(isRetiredNovelRecord({ title: "我的小说", workflow_type: "script" }), false);
});

// ---------------------------------------------------------------------------
// adaptLegacyProject: novel bible shape
// ---------------------------------------------------------------------------

function makeFetcher() {
  const rowsByPath = new Map();
  const postRowsByPath = new Map();
  const calls = [];
  const fetcher = async (path, init) => {
    calls.push({ path, init });
    if (init?.method === "POST") {
      for (const [prefix, rows] of postRowsByPath) {
        if (path.startsWith(prefix)) return typeof rows === "function" ? rows(path, init) : rows;
      }
    }
    for (const [prefix, rows] of rowsByPath) {
      if (path.startsWith(prefix)) return typeof rows === "function" ? rows(path, init) : rows;
    }
    return [];
  };
  return {
    calls,
    fetcher,
    respond(prefix, rows) { rowsByPath.set(prefix, rows); },
    respondPost(prefix, rows) { postRowsByPath.set(prefix, rows); },
  };
}

const OWNER = "11111111-1111-1111-1111-111111111111";
const WORK = "22222222-2222-2222-2222-222222222222";
const PROJECT = "proj_novel_1";

test("adaptLegacyProject: maps novel bible world + characterRelationships into units", async () => {
  const fx = makeFetcher();
  fx.respond(`/rest/v1/storyflow_works?`, [{ id: WORK, owner_id: OWNER }]);
  fx.respond(`/rest/v1/storyflow_projects?`, [{
    id: PROJECT,
    owner_id: OWNER,
    story_bible: {
      world: "近未来首尔，记忆可以交易。",
      characterRelationships: "李真与管家是对立共生关系。",
      logline: "一个记忆商人发现自己在卖的回忆。",
    },
  }]);
  fx.respond(`/rest/v1/storyflow_episodes?`, []);
  fx.respond(`/rest/v1/storyflow_scenes?`, []);

  let seq = 0;
  const createdUnits = [];
  // units GET: by id when present, else the full (growing) list
  fx.respond(`/rest/v1/storyflow_screenplay_units?`, (path) => {
    const m = path.match(/id=eq\.([^&]+)/);
    if (m) return createdUnits.filter((u) => u.id === m[1]);
    return createdUnits;
  });
  fx.respondPost("/rest/v1/storyflow_screenplay_units", (path, init) => {
    const body = JSON.parse(init.body);
    seq += 1;
    const row = { id: `unit-${seq}`, work_id: WORK, type: body.type, parent_id: body.parent_id ?? null, order_index: body.order_index ?? 1, title: body.title ?? "", readiness: "empty", current_version_id: null, finalized_version_id: null, legacy_id: body.legacy_id ?? null };
    createdUnits.push(row);
    return [row];
  });
  fx.respondPost("/rest/v1/storyflow_screenplay_unit_versions", (path, init) => {
    const body = JSON.parse(init.body);
    return [{ id: `ver-${seq}`, work_id: WORK, unit_id: body.unit_id, parent_version_id: null, content_schema: "kiikis.screenplay-unit/1", content_json: body.content_json, content_hash: "hash", source: "manual", source_message_ids: [], created_at: new Date().toISOString() }];
  });

  const service = new ScreenplayUnitsService(fx.fetcher);
  const { created } = await service.adaptLegacyProject({ ownerId: OWNER, workId: WORK, projectId: PROJECT });

  // world + character relationship units created; no episodes/scenes exist
  assert.equal(created, 2);
  const inserts = fx.calls.filter((c) => c.path === "/rest/v1/storyflow_screenplay_units" && c.init?.method === "POST");
  const types = inserts.map((c) => JSON.parse(c.init.body).type).sort();
  assert.deepEqual(types, ["character", "world"]);
  const worldInsert = inserts.map((c) => JSON.parse(c.init.body)).find((b) => b.type === "world");
  assert.equal(worldInsert.legacy_id, `${PROJECT}:world`);
  const charInsert = inserts.map((c) => JSON.parse(c.init.body)).find((b) => b.type === "character");
  assert.equal(charInsert.legacy_id, `${PROJECT}:character:relationships`);
});

test("adaptLegacyProject: idempotent — existing legacy ids are not recreated", async () => {
  const fx = makeFetcher();
  fx.respond(`/rest/v1/storyflow_works?`, [{ id: WORK, owner_id: OWNER }]);
  fx.respond(`/rest/v1/storyflow_projects?`, [{
    id: PROJECT, owner_id: OWNER,
    story_bible: { world: "w", characterRelationships: "r" },
  }]);
  fx.respond(`/rest/v1/storyflow_episodes?`, []);
  fx.respond(`/rest/v1/storyflow_scenes?`, []);
  // both units already adapted previously
  fx.respond(`/rest/v1/storyflow_screenplay_units?`, [
    { id: "u1", work_id: WORK, type: "world", parent_id: null, order_index: 1, title: "世界观", readiness: "draft", current_version_id: "v1", finalized_version_id: null, legacy_id: `${PROJECT}:world` },
    { id: "u2", work_id: WORK, type: "character", parent_id: null, order_index: 1, title: "角色关系", readiness: "draft", current_version_id: "v2", finalized_version_id: null, legacy_id: `${PROJECT}:character:relationships` },
  ]);

  const service = new ScreenplayUnitsService(fx.fetcher);
  const { created } = await service.adaptLegacyProject({ ownerId: OWNER, workId: WORK, projectId: PROJECT });
  assert.equal(created, 0);
});

test("adaptLegacyProject: rejects foreign projects", async () => {
  const fx = makeFetcher();
  fx.respond(`/rest/v1/storyflow_works?`, [{ id: WORK, owner_id: OWNER }]);
  fx.respond(`/rest/v1/storyflow_projects?`, [{ id: PROJECT, owner_id: "99999999-9999-9999-9999-999999999999", story_bible: {} }]);
  const service = new ScreenplayUnitsService(fx.fetcher);
  await assert.rejects(
    () => service.adaptLegacyProject({ ownerId: OWNER, workId: WORK, projectId: PROJECT }),
    (e) => e instanceof ScreenplayUnitsError && e.code === "forbidden",
  );
});
