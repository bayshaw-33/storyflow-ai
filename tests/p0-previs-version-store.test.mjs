import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultPrevisScene } from "../lib/director/previs.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function persistedState(overrides = {}) {
  return {
    projectId: "project-1",
    sourceUnitId: "episode-1",
    revision: 7,
    idMap: {},
    scenes: [{
      id: "scene-1",
      idSource: "server",
      order: 1,
      heading: "INT. STUDIO - NIGHT",
      location: "Studio",
      timeOfDay: "Night",
      summary: "",
      sourceText: "",
      characterAssetIds: [],
      propAssetIds: [],
      locked: false,
      userEdited: false,
      confirmed: true,
      revision: 7,
      analysisVersion: 1,
      sourceHash: "source-hash",
      shots: [{
        id: "shot-1",
        idSource: "server",
        sceneId: "scene-1",
        order: 1,
        sourceText: "",
        storyBeat: "Entrance",
        visualDescription: "Mara enters the room.",
        characterAssetIds: [],
        sceneAssetId: null,
        propAssetIds: [],
        shotSize: "Medium",
        cameraMovement: "Track in",
        angle: "Eye level",
        durationSeconds: 6,
        dialogue: "",
        emotion: "Tense",
        continuity: "",
        imagePrompt: "Mara in the studio",
        jimengPromptZh: "camera follows Mara",
        locked: false,
        userEdited: false,
        confirmed: true,
        revision: 7,
        analysisVersion: 1,
        sourceHash: "source-hash",
        ...overrides,
      }],
    }],
  };
}

function validInput() {
  return {
    projectId: "project-1",
    workId: "work-1",
    sourceUnitId: "episode-1",
    storyboardRevision: 7,
    shotId: "shot-1",
    scene: createDefaultPrevisScene(),
    promptInputHash: "prompt-input-hash",
    referenceVersionIds: ["asset-version-1"],
  };
}

async function loadStore() {
  return import("../lib/server/previs-versions.ts");
}

test("save resolves the exact completed image job before inserting a version", async () => {
  const { savePrevisVersion } = await loadStore();
  const calls = [];
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init });
    if (path === "/rest/v1/rpc/get_storyboard_state") return persistedState();
    if (path.includes("storyflow_generation_jobs")) {
      assert.match(path, /owner_id=eq\./);
      assert.match(path, /project_id=eq\.project-1/);
      assert.match(path, /job_type=eq\.image/);
      assert.match(path, /target_id=eq\.shot-1/);
      assert.match(path, /status=eq\.completed/);
      return [{ id: "image-job-1", result_url: "https://storage.test/frame.png", status: "completed" }];
    }
    if (path.includes("storyflow_versions") && init.method !== "POST") return [{ version_no: 2 }];
    if (path === "/rest/v1/storyflow_versions" && init.method === "POST") {
      const body = JSON.parse(init.body);
      return [{ id: body.id, version_no: body.version_no, snapshot_json: body.snapshot_json }];
    }
    throw new Error(`UNEXPECTED_FETCH:${path}`);
  };

  const version = await savePrevisVersion({
    userId: USER_ID,
    input: validInput(),
    fetcher,
    now: () => "2026-08-30T10:00:00.000Z",
    createId: () => "previs-version-3",
  });

  assert.equal(version.id, "previs-version-3");
  assert.equal(version.versionNo, 3);
  assert.equal(version.snapshot.adoptedInput.firstframeJobId, "image-job-1");
  assert.equal(version.snapshot.adoptedInput.firstframeUrlAtSave, "https://storage.test/frame.png");
  assert.equal(version.snapshot.adoptedInput.prompt, "camera follows Mara");
  assert.match(version.snapshot.snapshotHash, /^[a-f0-9]{64}$/);

  const insert = calls.find((call) => call.path === "/rest/v1/storyflow_versions" && call.init.method === "POST");
  const insertedBody = JSON.parse(insert.init.body);
  assert.equal(insertedBody.user_id, USER_ID);
  assert.equal(insertedBody.entity_type, "previs_scene");
  assert.equal(insertedBody.entity_id, "shot-1");
  assert.equal(insertedBody.step_key, "storyboard");
  assert.deepEqual(insertedBody.snapshot_json, insertedBody.content_snapshot);
});

test("save fails closed for a missing shot, stale revision, unconfirmed shot, or missing frame", async () => {
  const { savePrevisVersion } = await loadStore();
  const run = (input, state = persistedState(), jobs = []) => savePrevisVersion({
    userId: USER_ID,
    input,
    fetcher: async (path) => {
      if (path === "/rest/v1/rpc/get_storyboard_state") return state;
      if (path.includes("storyflow_generation_jobs")) return jobs;
      if (path.includes("storyflow_versions")) return [];
      throw new Error(`UNEXPECTED_FETCH:${path}`);
    },
  });

  await assert.rejects(() => run({ ...validInput(), shotId: "other" }), /PREVIS_SHOT_NOT_FOUND/);
  await assert.rejects(() => run({ ...validInput(), storyboardRevision: 6 }), /PREVIS_REVISION_STALE/);
  await assert.rejects(() => run(validInput(), persistedState({ confirmed: false })), /PREVIS_SHOT_NOT_CONFIRMED/);
  await assert.rejects(() => run(validInput()), /PREVIS_FIRSTFRAME_NOT_FOUND/);
});

test("read operations enforce owner, project, source unit, entity type, and shot scope", async () => {
  const { readLatestPrevisVersion, readPrevisVersion } = await loadStore();
  const snapshot = {
    schemaVersion: 1,
    kind: "kiikis.previs.version",
    projectId: "project-1",
    workId: "work-1",
    sourceUnitId: "episode-1",
    storyboardRevision: 7,
    sceneId: "scene-1",
    shotId: "shot-1",
    shotLabel: "场 1 · 镜头 1",
    previs: createDefaultPrevisScene(),
    adoptedInput: {
      firstframeJobId: "image-job-1",
      firstframeUrlAtSave: "https://storage.test/frame.png",
      prompt: "camera follows Mara",
      promptInputHash: "prompt-input-hash",
      referenceVersionIds: [],
      durationSeconds: 5,
      aspectRatio: "9:16",
    },
    capabilityTranslation: {
      mode: "firstframe_prompt",
      preserved: ["first_frame"],
      lossy: ["camera_path"],
    },
    snapshotHash: "a".repeat(64),
    createdAt: "2026-08-30T10:00:00.000Z",
  };
  const paths = [];
  const fetcher = async (path) => {
    paths.push(path);
    return [{ id: "previs-version-3", version_no: 3, snapshot_json: snapshot }];
  };

  await readLatestPrevisVersion({ userId: USER_ID, projectId: "project-1", sourceUnitId: "episode-1", shotId: "shot-1", fetcher });
  await readPrevisVersion({ userId: USER_ID, projectId: "project-1", sourceUnitId: "episode-1", shotId: "shot-1", versionId: "previs-version-3", fetcher });

  for (const path of paths) {
    assert.match(path, new RegExp(`user_id=eq\\.${USER_ID}`));
    assert.match(path, /project_id=eq\.project-1/);
    assert.match(path, /entity_type=eq\.previs_scene/);
    assert.match(path, /entity_id=eq\.shot-1/);
    assert.match(path, /snapshot_json-%3E%3EsourceUnitId=eq\.episode-1/);
  }
  assert.match(paths[0], /order=version_no\.desc/);
  assert.match(paths[1], /id=eq\.previs-version-3/);
});
