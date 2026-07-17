import assert from "node:assert/strict";
import test from "node:test";

import {
  RevisionConflictError,
  createStoryboardSnapshot,
  loadStoryboardState,
  saveStoryboardState,
} from "../lib/storyboard/state-api.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const request = {
  projectId: "project-1",
  sourceUnitId: "episode-1",
  expectedRevision: 0,
  scenes: [],
  deletedSceneIds: [],
  deletedShotIds: [],
};

test("save forwards only the authenticated owner and returns the RPC stable ID mapping", async () => {
  const calls = [];
  const result = await saveStoryboardState(OWNER, request, async (path, init) => {
    calls.push({ path, init });
    return {
      projectId: "project-1",
      sourceUnitId: "episode-1",
      revision: 1,
      scenes: [],
      idMap: { "client-shot-1": "22222222-2222-4222-8222-222222222222" },
    };
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/rest/v1/rpc/save_storyboard_state");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    p_owner_id: OWNER,
    p_project_id: "project-1",
    p_source_unit_id: "episode-1",
    p_expected_revision: 0,
    p_scenes: [],
    p_deleted_scene_ids: [],
    p_deleted_shot_ids: [],
  });
  assert.equal(result.idMap["client-shot-1"], "22222222-2222-4222-8222-222222222222");
});

test("save translates a stale RPC revision into a typed conflict", async () => {
  await assert.rejects(
    () => saveStoryboardState(OWNER, request, async () => {
      throw new Error("SUPABASE_SERVICE_ERROR:400:REVISION_CONFLICT:7");
    }),
    (error) => error instanceof RevisionConflictError && error.currentRevision === 7,
  );
});

test("load scopes the current state by authenticated owner, project, and source unit", async () => {
  const calls = [];
  const result = await loadStoryboardState(OWNER, "project-1", "episode-1", async (path, init) => {
    calls.push({ path, init });
    return { projectId: "project-1", sourceUnitId: "episode-1", revision: 4, scenes: [], idMap: {} };
  });
  assert.equal(calls[0].path, "/rest/v1/rpc/get_storyboard_state");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    p_owner_id: OWNER,
    p_project_id: "project-1",
    p_source_unit_id: "episode-1",
  });
  assert.equal(result.revision, 4);
});

// P3 BLOCKER v2: createStoryboardSnapshot 不再做 CAS 校验
//   - 不查 current state（不读 storyflow_production_projects）
//   - 不调 save_storyboard_state RPC（不触碰当前工作态）
//   - 直接 INSERT storyflow_versions（含完整 scenes）
//   - expectedRevision 任意值都成功（snapshot 与 CAS 体系完全隔离）
test("snapshot writes a version without CAS check (P3 BLOCKER v2: never touches current state)", async () => {
  const calls = [];
  const result = await createStoryboardSnapshot(OWNER, {
    projectId: "project-1",
    sourceUnitId: "episode-1",
    expectedRevision: 2,
    reason: "manual",
    scenes: [],
    deletedSceneIds: [],
    deletedShotIds: [],
  }, async (path, init) => {
    calls.push({ path, init });
    if (path.startsWith("/rest/v1/storyflow_versions")) {
      return [{ id: "version-1" }];
    }
    throw new Error(`UNEXPECTED FETCH: ${path}`);
  });
  assert.equal(result.snapshotId, "version-1", "返回新 version id");
  assert.equal(result.revision, 2, "返回本地基线 revision");
  assert.equal(calls.length, 1, "仅一次 fetch（直接写 version，不查 current state）");
  assert.ok(calls[0].path.startsWith("/rest/v1/storyflow_versions"), "唯一 fetch 是 versions 表");
  // 验证不触碰 current state
  for (const c of calls) {
    assert.ok(!c.path.includes("save_storyboard_state"), "不调 save_storyboard_state RPC");
    assert.ok(!c.path.includes("storyflow_production_projects"), "不查 current state 表");
  }
});
