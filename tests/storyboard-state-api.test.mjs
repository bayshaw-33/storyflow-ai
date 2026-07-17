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

test("snapshot rejects a stale revision before it writes a version", async () => {
  const calls = [];
  await assert.rejects(
    () => createStoryboardSnapshot(OWNER, {
      projectId: "project-1",
      sourceUnitId: "episode-1",
      expectedRevision: 2,
      reason: "manual",
    }, async (path, init) => {
      calls.push({ path, init });
      return [{ id: "production-1", revision: 3 }];
    }),
    (error) => error instanceof RevisionConflictError && error.currentRevision === 3,
  );
  assert.equal(calls.length, 1, "stale snapshots must not write storyflow_versions");
});
