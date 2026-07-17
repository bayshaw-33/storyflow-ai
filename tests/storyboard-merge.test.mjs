/**
 * storyboard-merge tests — KIIKIS-P1-KIMI-002 §6
 *
 * Full mode: locked/userEdited shots preserved verbatim (idSource "server",
 * original order positions), AI shots re-sequenced around them, the rest
 * superseded. Scene mode: only the target scene in the response,
 * SCENE_NOT_FOUND on a bad id.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { runAnalyze } from "../lib/storyboard/analyze/index.ts";
import { mergeSceneShots } from "../lib/storyboard/analyze/merge.ts";
import { validateAnalyzeRequest } from "../lib/storyboard/analyze/schema.ts";

const MOCK_AI = new URL("./fixtures/storyboard/mock-ai/", import.meta.url);
const FIXTURES = new URL("./fixtures/storyboard/", import.meta.url);

function readMock(name) {
  return readFileSync(new URL(`${name}.json`, MOCK_AI), "utf8");
}

function readFixture(name) {
  return readFileSync(new URL(`${name}.txt`, FIXTURES), "utf8");
}

function persistedShot(overrides) {
  return {
    id: crypto.randomUUID(),
    clientId: "c-shot",
    idSource: "server",
    sceneId: "scene-1",
    order: 1,
    sourceText: "旧原文",
    storyBeat: "旧节拍",
    visualDescription: "旧画面",
    characterAssetIds: [],
    sceneAssetId: null,
    propAssetIds: [],
    shotSize: "近景",
    cameraMovement: "固定",
    angle: "平视",
    durationSeconds: 4,
    dialogue: "",
    emotion: "",
    continuity: "",
    imagePrompt: "user-edited-prompt",
    jimengPromptZh: "用户改过的即梦提示词",
    locked: false,
    userEdited: false,
    confirmed: false,
    revision: 5,
    analysisVersion: 1,
    sourceHash: "sha256:old",
    ...overrides,
  };
}

function persistedScene(order, shots, overrides = {}) {
  return {
    id: `server-scene-${order}`,
    clientId: `server-scene-${order}`,
    idSource: "server",
    order,
    heading: `INT. 旧场景${order} - 夜`,
    location: `旧场景${order}`,
    timeOfDay: "夜",
    summary: "旧摘要",
    sourceText: `场景${order}的旧原文`,
    characterAssetIds: [],
    propAssetIds: [],
    shots,
    locked: false,
    userEdited: false,
    confirmed: false,
    revision: 5,
    analysisVersion: 1,
    sourceHash: "sha256:old",
    ...overrides,
  };
}

function proposalShot(order, overrides = {}) {
  return {
    clientId: `p_shot_1_${order}`,
    idSource: "client",
    sceneId: "p_scene_1",
    order,
    sourceText: "新原文",
    storyBeat: "新节拍",
    visualDescription: "新画面",
    characterAssetIds: [],
    sceneAssetId: null,
    propAssetIds: [],
    shotSize: "中景",
    cameraMovement: "推",
    angle: "平视",
    durationSeconds: 4,
    dialogue: "",
    emotion: "",
    continuity: "",
    imagePrompt: "",
    jimengPromptZh: "",
    locked: false,
    userEdited: false,
    confirmed: false,
    revision: 6,
    analysisVersion: 1,
    sourceHash: "sha256:new",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mergeSceneShots (unit)
// ---------------------------------------------------------------------------

test("merge: locked/userEdited shots preserved verbatim at original order, AI re-sequenced around", () => {
  const lockedShot = persistedShot({ order: 1, locked: true, visualDescription: "锁定的镜头" });
  const superseded = persistedShot({ order: 2 });
  const editedShot = persistedShot({ order: 3, userEdited: true, visualDescription: "用户改的镜头" });

  const merged = mergeSceneShots(
    [lockedShot, superseded, editedShot],
    [proposalShot(1, { visualDescription: "AI镜头甲" }), proposalShot(2, { visualDescription: "AI镜头乙" })],
  );

  assert.equal(merged.length, 4, "2 preserved + 2 AI");
  // Preserved shots sit at their original positions (1 and 3).
  assert.equal(merged[0].id, lockedShot.id);
  assert.equal(merged[0].idSource, "server");
  assert.equal(merged[0].visualDescription, "锁定的镜头");
  assert.equal(merged[2].id, editedShot.id);
  assert.equal(merged[2].idSource, "server");
  assert.equal(merged[2].imagePrompt, "user-edited-prompt", "preserved verbatim");
  // AI shots fill the gaps with re-sequenced orders.
  assert.equal(merged[1].visualDescription, "AI镜头甲");
  assert.equal(merged[1].order, 2);
  assert.equal(merged[1].idSource, "client");
  assert.equal(merged[3].visualDescription, "AI镜头乙");
  assert.equal(merged[3].order, 4);
  // The non-locked, non-edited existing shot is superseded.
  assert.ok(!merged.some((shot) => shot.id === superseded.id));
});

test("merge: preserved shot with order beyond merged length is clamped to the end", () => {
  const pinned = persistedShot({ order: 9, locked: true });
  const merged = mergeSceneShots([pinned], [proposalShot(1), proposalShot(2)]);
  assert.equal(merged.length, 3);
  assert.equal(merged[2].id, pinned.id);
  assert.equal(merged[2].idSource, "server");
});

// ---------------------------------------------------------------------------
// runAnalyze full-mode merge (integration with fake loader)
// ---------------------------------------------------------------------------

function makeRequest(overrides = {}) {
  const base = {
    projectId: "project-1",
    sourceUnitId: "episode-1",
    source: readFixture("multi-scene"),
    aspectRatio: "9:16",
    targetDurationSeconds: 75,
    visualStyle: "写实",
    outputLanguage: "zh-CN",
    mode: "full",
    sceneId: null,
    expectedRevision: 5,
    idempotencyKey: "req-merge",
  };
  return validateAnalyzeRequest({ ...base, ...overrides }).value;
}

test("merge full mode: preserved shots survive re-analysis inside matched scene", async () => {
  const userShot = persistedShot({ order: 1, userEdited: true, visualDescription: "用户改过的修车铺镜头" });
  const staleShot = persistedShot({ order: 2, visualDescription: "待替换的旧镜头" });
  const existing = [
    persistedScene(1, [persistedShot({ order: 1 })]),
    persistedScene(2, [persistedShot({ order: 1 })]),
    persistedScene(3, [userShot, staleShot]),
  ];

  const response = await runAnalyze(
    {
      callAI: async () => readMock("multi-scene"),
      loadExistingState: async () => ({ scenes: existing }),
    },
    makeRequest(),
    { ownerId: "u1" },
  );

  assert.equal(response.scenes.length, 5, "AI proposal drives the scene list");
  const scene3 = response.scenes.find((scene) => scene.order === 3);
  assert.ok(scene3, "scene 3 exists in the proposal");
  const preserved = scene3.shots.find((shot) => shot.idSource === "server");
  assert.ok(preserved, "user-edited shot preserved");
  assert.equal(preserved.id, userShot.id);
  assert.equal(preserved.visualDescription, "用户改过的修车铺镜头");
  assert.equal(preserved.revision, 5, "preserved shot keeps its own revision");
  assert.ok(!scene3.shots.some((shot) => shot.id === staleShot.id), "stale shot superseded");
});

// ---------------------------------------------------------------------------
// Scene mode
// ---------------------------------------------------------------------------

test("merge scene mode: only the merged target scene is returned", async () => {
  const lockedShot = persistedShot({ order: 2, locked: true, visualDescription: "锁定的书房镜头" });
  const targetScene = persistedScene(2, [persistedShot({ order: 1 }), lockedShot], {
    sourceText: readFixture("cn-short-drama"),
  });
  const existing = [
    persistedScene(1, [persistedShot({ order: 1 })]),
    targetScene,
    persistedScene(3, [persistedShot({ order: 1 })]),
  ];

  // Scene-mode mock: a single-scene re-analysis (reuse multi-character mock).
  const response = await runAnalyze(
    {
      callAI: async () => readMock("multi-character"),
      loadExistingState: async () => ({ scenes: existing }),
    },
    makeRequest({ mode: "scene", sceneId: targetScene.id, source: readFixture("cn-short-drama"), targetDurationSeconds: 30 }),
    { ownerId: "u1" },
  );

  assert.equal(response.scenes.length, 1, "response contains ONLY the merged target scene");
  const merged = response.scenes[0];
  assert.equal(merged.order, 2, "proposal keeps the target scene order");
  const preserved = merged.shots.filter((shot) => shot.idSource === "server");
  assert.equal(preserved.length, 1);
  assert.equal(preserved[0].id, lockedShot.id);
  assert.equal(preserved[0].order, 2, "locked shot stays at its original position");
});

test("merge scene mode: unknown sceneId → 422-level SCENE_NOT_FOUND", async () => {
  await assert.rejects(
    runAnalyze(
      {
        callAI: async () => readMock("multi-character"),
        loadExistingState: async () => ({ scenes: [persistedScene(1, [persistedShot({ order: 1 })])] }),
      },
      makeRequest({ mode: "scene", sceneId: "no-such-scene" }),
      { ownerId: "u1" },
    ),
    (error) => {
      assert.equal(error.code, "SCENE_NOT_FOUND");
      return true;
    },
  );
});

test("merge scene mode: empty existing state → SCENE_NOT_FOUND (no silent full fallback)", async () => {
  await assert.rejects(
    runAnalyze(
      {
        callAI: async () => readMock("multi-character"),
        loadExistingState: async () => ({ scenes: [] }),
      },
      makeRequest({ mode: "scene", sceneId: "any" }),
      { ownerId: "u1" },
    ),
    (error) => {
      assert.equal(error.code, "SCENE_NOT_FOUND");
      return true;
    },
  );
});
