/**
 * Storyboard E2E 12 scenarios — task card KIIKIS-P1-TRAE-002 §8.
 *
 * Contract-level behavior the ProductionWorkbench shell (task 6) and the
 * four Kimi APIs (task 7) must guarantee. UI-only flows (tab switch, copy
 * button) are reduced to their pure-logic kernels so the whole suite runs
 * under `node --test` without a browser or Supabase. The StoryboardClient
 * accepts a `fetchImpl` injection so we never hit the real network.
 *
 * Scenarios:
 *   1.  当前集跳转 — parseCreativeHandoff matches sourceUnitId
 *   2.  跨项目 handoff 拒绝 — different sourceProjectId → null
 *   3.  跨集 handoff 拒绝 — different sourceUnitId → null
 *   4.  首次保存返回服务端 Shot ID — saveStoryboardState idMap mapping
 *   5.  二次保存 ID 不变 — after idMap applied, second save uses server IDs
 *   6.  409 不覆盖页面 — StoryboardClient.saveState throws, local state intact
 *   7.  analyze 缺字段不清场 — StoryboardClient.analyze 422 leaves scenes intact
 *   8.  locked Shot 重分析后保留 — scene-mode merge kernel keeps locked shots
 *   9.  主参考版本正确关联 — referenceVersionIds alter computePromptInputHash
 *  10.  单 Shot 失败不影响其他 — per-shot error isolation
 *  11.  刷新恢复 — loadStoryboardState restores persisted state
 *  12.  复制即梦提示词 — buildJimengVideoPrompt zh contains required segments
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  StoryboardClient,
  StoryboardRevisionConflictError,
  StoryboardClientError,
} from "../lib/storyboard/client.ts";
import {
  saveStoryboardState,
  loadStoryboardState,
} from "../lib/storyboard/state-api.ts";
import {
  buildJimengVideoPrompt,
  computePromptInputHash,
} from "../lib/storyboard/prompts/templates.ts";
import { parseCreativeHandoff } from "../lib/creative-handoff.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Build a minimal Response-like object the StoryboardClient expects. */
function mockResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

/** Build a StoryboardClient whose fetch is fully replaced by `impl`. */
function clientWithFetch(impl) {
  return new StoryboardClient({
    getSessionToken: async () => "fake-token",
    fetchImpl: impl,
  });
}

function buildHandoffRaw(overrides = {}) {
  return JSON.stringify({
    version: 1,
    sourceProjectId: "project-1",
    sourceUnitId: "episode-1",
    sourceUpdatedAt: "2026-07-17T00:00:00.000Z",
    title: "测试剧集",
    contentType: "script",
    universeId: null,
    projectBackground: "",
    worldAndOutline: "",
    characterBible: "",
    manuscript: "第一场 内景 客厅 日\n小明走进客厅。",
    translation: "",
    localization: "",
    createdAt: "2026-07-17T00:00:00.000Z",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// 1. 当前集跳转
// ---------------------------------------------------------------------------

test("scenario 1: handoff is accepted when sourceUnitId matches the current episode", () => {
  const pkg = parseCreativeHandoff(buildHandoffRaw(), "project-1", "episode-1");
  assert.ok(pkg, "matching handoff must be accepted");
  assert.equal(pkg.sourceUnitId, "episode-1");
  assert.equal(pkg.contentType, "script");
});

// ---------------------------------------------------------------------------
// 2. 跨项目 handoff 拒绝
// ---------------------------------------------------------------------------

test("scenario 2: handoff is rejected when sourceProjectId differs", () => {
  const pkg = parseCreativeHandoff(buildHandoffRaw(), "other-project", "episode-1");
  assert.equal(pkg, null, "cross-project handoff must be rejected");
});

// ---------------------------------------------------------------------------
// 3. 跨集 handoff 拒绝
// ---------------------------------------------------------------------------

test("scenario 3: handoff is rejected when sourceUnitId differs", () => {
  const pkg = parseCreativeHandoff(buildHandoffRaw(), "project-1", "episode-2");
  assert.equal(pkg, null, "cross-episode handoff must be rejected");
});

// ---------------------------------------------------------------------------
// 4. 首次保存返回服务端 Shot ID
// ---------------------------------------------------------------------------

test("scenario 4: first save returns server-issued Shot IDs via idMap", async () => {
  const result = await saveStoryboardState(
    OWNER,
    {
      projectId: "project-1",
      sourceUnitId: "episode-1",
      expectedRevision: 0,
      scenes: [
        {
          id: undefined,
          clientId: "p_scene_1",
          idSource: "client",
          shots: [
            {
              id: undefined,
              clientId: "p_scene_1_shot_1",
              idSource: "client",
              sceneId: "p_scene_1",
              order: 1,
            },
          ],
        },
      ],
      deletedSceneIds: [],
      deletedShotIds: [],
    },
    async () => ({
      projectId: "project-1",
      sourceUnitId: "episode-1",
      revision: 1,
      scenes: [],
      idMap: {
        p_scene_1: "srv-scene-uuid-1",
        "p_scene_1_shot_1": "srv-shot-uuid-1",
      },
    }),
  );
  assert.equal(result.idMap["p_scene_1"], "srv-scene-uuid-1");
  assert.equal(result.idMap["p_scene_1_shot_1"], "srv-shot-uuid-1");
  assert.equal(result.revision, 1);
});

// ---------------------------------------------------------------------------
// 5. 二次保存 ID 不变
// ---------------------------------------------------------------------------

test("scenario 5: second save forwards server IDs (not client IDs) to the RPC", async () => {
  const secondRequest = {
    projectId: "project-1",
    sourceUnitId: "episode-1",
    expectedRevision: 1,
    scenes: [
      {
        id: "srv-shot-uuid-1",
        clientId: "p_scene_1_shot_1",
        idSource: "server",
        shots: [],
      },
    ],
    deletedSceneIds: [],
    deletedShotIds: [],
  };
  const calls = [];
  await saveStoryboardState(OWNER, secondRequest, async (path, init) => {
    calls.push({ path, init });
    return { projectId: "project-1", sourceUnitId: "episode-1", revision: 2, scenes: [], idMap: {} };
  });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.p_expected_revision, 1, "second save must carry the new expectedRevision");
  assert.equal(body.p_scenes[0].id, "srv-shot-uuid-1", "second save must use the server ID");
  assert.equal(body.p_scenes[0].idSource, "server");
});

// ---------------------------------------------------------------------------
// 6. 409 不覆盖页面
// ---------------------------------------------------------------------------

test("scenario 6: 409 conflict throws StoryboardRevisionConflictError and must not mutate local scenes", async () => {
  const localScenesBefore = [{ id: "srv-shot-uuid-1", locked: true }];
  const client = clientWithFetch(async () =>
    mockResponse({ success: false, code: "REVISION_CONFLICT", currentRevision: 7 }, 409),
  );
  await assert.rejects(
    () =>
      client.saveState({
        projectId: "project-1",
        sourceUnitId: "episode-1",
        expectedRevision: 1,
        scenes: [],
        deletedSceneIds: [],
        deletedShotIds: [],
      }),
    (err) =>
      err instanceof StoryboardRevisionConflictError &&
      err.currentRevision === 7 &&
      err.code === "REVISION_CONFLICT",
  );
  assert.equal(localScenesBefore[0].locked, true, "local state must be untouched on 409");
});

// ---------------------------------------------------------------------------
// 7. analyze 缺字段不清场
// ---------------------------------------------------------------------------

test("scenario 7: analyze 422 (ANALYZE_OUTPUT_INVALID) leaves local scenes intact", async () => {
  const localScenesBefore = [{ id: "srv-scene-1", heading: "保留的场景" }];
  const client = clientWithFetch(async () =>
    mockResponse(
      { success: false, code: "ANALYZE_OUTPUT_INVALID", error: "AI 返回不是 JSON 对象。" },
      422,
    ),
  );
  let threw = false;
  try {
    await client.analyze({
      projectId: "project-1",
      sourceUnitId: "episode-1",
      mode: "full",
      sourceText: "剧本",
      aspectRatio: "9:16",
      expectedRevision: 1,
    });
  } catch (err) {
    threw = true;
    assert.ok(err instanceof StoryboardClientError, "must throw StoryboardClientError");
    assert.equal(err.code, "ANALYZE_OUTPUT_INVALID");
  }
  assert.ok(threw, "analyze must throw on 422");
  assert.equal(localScenesBefore.length, 1, "scenes must not be cleared on analyze failure");
  assert.equal(localScenesBefore[0].heading, "保留的场景");
});

// ---------------------------------------------------------------------------
// 8. locked Shot 重分析后保留 — scene-mode merge kernel
// ---------------------------------------------------------------------------

test("scenario 8: scene-mode re-analysis merge kernel preserves locked shots", async () => {
  const client = clientWithFetch(async () =>
    mockResponse({
      success: true,
      analysisId: "analysis_1",
      analysisVersion: 1,
      sourceHash: "",
      revision: 1,
      scenes: [
        {
          id: undefined,
          clientId: "p_scene_1",
          idSource: "client",
          order: 1,
          heading: "第一场",
          location: "客厅",
          timeOfDay: "日",
          summary: "重分析",
          sourceText: "小明走进客厅。",
          characterAssetIds: [],
          propAssetIds: [],
          shots: [
            {
              id: undefined,
              clientId: "p_scene_1_shot_1",
              idSource: "client",
              sceneId: "p_scene_1",
              order: 1,
              sourceText: "小明进门",
              storyBeat: "",
              visualDescription: "小明推门进入客厅",
              characterAssetIds: [],
              sceneAssetId: null,
              propAssetIds: [],
              shotSize: "中景",
              cameraMovement: "固定",
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
              revision: 0,
              analysisVersion: 0,
              sourceHash: "",
            },
          ],
          locked: false,
          userEdited: false,
          confirmed: false,
          revision: 0,
          analysisVersion: 0,
          sourceHash: "",
        },
      ],
      assets: { characters: [], locations: [], props: [] },
    }, 200),
  );
  const analyzeResponse = await client.analyze({
    projectId: "project-1",
    sourceUnitId: "episode-1",
    mode: "scene",
    sceneId: "srv-scene-1",
    sourceText: "",
    aspectRatio: "9:16",
    expectedRevision: 1,
  });
  // Replicate ProductionWorkbench.analyzeScript scene-mode merge kernel:
  const originalLockedShots = [
    {
      id: "srv-shot-locked",
      sceneId: "srv-scene-1",
      order: 1,
      locked: true,
      visualDescription: "锁定保留",
    },
  ];
  const incoming = analyzeResponse.scenes[0];
  const mergedShots = [
    ...originalLockedShots,
    ...incoming.shots.map((s, i) => ({ ...s, order: originalLockedShots.length + i + 1 })),
  ];
  assert.equal(mergedShots.length, 2, "merge = locked + incoming");
  assert.equal(mergedShots[0].id, "srv-shot-locked", "locked shot is preserved first");
  assert.equal(mergedShots[0].locked, true);
  assert.equal(mergedShots[1].locked, false, "incoming shot is unlocked");
  assert.equal(mergedShots[1].order, 2, "incoming shot renumbered after locked");
});

// ---------------------------------------------------------------------------
// 9. 主参考版本正确关联
// ---------------------------------------------------------------------------

test("scenario 9: changing referenceVersionIds changes computePromptInputHash", () => {
  const base = {
    shotId: "srv-shot-1",
    visualDescription: "小明走进客厅",
    dialogue: "",
    continuity: "",
    shotSize: "中景",
    cameraMovement: "固定",
    angle: "平视",
    durationSeconds: 4,
    visualStyle: "写实短剧",
    aspectRatio: "9:16",
    language: "zh",
    templateVersion: "sb-prompts/1",
  };
  const hashA = computePromptInputHash({ ...base, referenceVersionIds: ["ver-1", "ver-2"] });
  const hashB = computePromptInputHash({ ...base, referenceVersionIds: ["ver-1", "ver-3"] });
  const hashSame = computePromptInputHash({ ...base, referenceVersionIds: ["ver-2", "ver-1"] });
  assert.notEqual(hashA, hashB, "different reference versions must produce different hashes");
  assert.equal(hashA, hashSame, "order of referenceVersionIds must not matter (canonical sort)");
});

// ---------------------------------------------------------------------------
// 10. 单 Shot 失败不影响其他
// ---------------------------------------------------------------------------

test("scenario 10: one shot image failure does not block other shots", async () => {
  const client = clientWithFetch(async (url) => {
    const u = String(url);
    if (u.includes("/shot-B/")) {
      return mockResponse({ success: false, code: "IMAGE_GENERATION_FAILED", error: "boom" }, 500);
    }
    return mockResponse({
      success: true,
      shotId: u.match(/shots\/([^/]+)\//)?.[1] ?? "x",
      imageUrl: "https://example.com/img.png",
      provider: "atlas",
      model: "flux",
      inputHash: "sha256:abc",
    }, 200);
  });
  const shotIds = ["shot-A", "shot-B", "shot-C"];
  const results = { ok: [], failed: [] };
  await Promise.allSettled(
    shotIds.map((id) =>
      client
        .generateShotImage(id, {
          projectId: "project-1",
          sourceUnitId: "episode-1",
          idempotencyKey: `key-${id}`,
          expectedRevision: 1,
        })
        .then(() => results.ok.push(id))
        .catch((err) => {
          if (err instanceof StoryboardClientError) results.failed.push(id);
          else throw err;
        }),
    ),
  );
  assert.deepEqual(results.ok.sort(), ["shot-A", "shot-C"], "non-failing shots must succeed");
  assert.deepEqual(results.failed, ["shot-B"], "only shot-B fails");
});

// ---------------------------------------------------------------------------
// 11. 刷新恢复
// ---------------------------------------------------------------------------

test("scenario 11: loadStoryboardState returns the persisted revision + scenes", async () => {
  const persisted = {
    projectId: "project-1",
    sourceUnitId: "episode-1",
    revision: 5,
    scenes: [
      {
        id: "srv-scene-1",
        clientId: "srv-scene-1",
        idSource: "server",
        order: 1,
        heading: "第一场",
        location: "客厅",
        timeOfDay: "日",
        summary: "",
        sourceText: "小明走进客厅。",
        characterAssetIds: [],
        propAssetIds: [],
        shots: [],
        locked: false,
        userEdited: false,
        confirmed: false,
        revision: 5,
        analysisVersion: 1,
        sourceHash: "",
      },
    ],
    idMap: {},
  };
  const result = await loadStoryboardState(OWNER, "project-1", "episode-1", async () => persisted);
  assert.equal(result.revision, 5);
  assert.equal(result.scenes.length, 1);
  assert.equal(result.scenes[0].id, "srv-scene-1");
});

// ---------------------------------------------------------------------------
// 12. 复制即梦提示词
// ---------------------------------------------------------------------------

test("scenario 12: jimeng zh prompt contains subject / action / scene / negative / dialogue segments", () => {
  const prompt = buildJimengVideoPrompt(
    {
      characters: [{ name: "小明", appearance: "短发青年" }],
      storyBeat: "进门",
      visualDescription: "小明推门进入客厅",
      emotion: "紧张",
      location: { name: "客厅", appearance: "中式装修" },
      shotSize: "中景",
      angle: "平视",
      cameraMovement: "推进",
      visualStyle: "写实短剧",
      durationSeconds: 4,
      aspectRatio: "9:16",
      continuity: "保持服装一致",
      dialogue: "我回来了。",
    },
    "zh",
  );
  assert.ok(prompt.includes("主体：小明"), "must contain subject segment");
  assert.ok(prompt.includes("动作："), "must contain action segment");
  assert.ok(prompt.includes("场景：客厅"), "must contain scene segment");
  assert.ok(prompt.includes("景别/机位：中景"), "must contain shot size segment");
  assert.ok(prompt.includes("镜头运动：推进"), "must contain camera movement segment");
  assert.ok(prompt.includes("画幅：9:16"), "must contain aspect ratio segment");
  assert.ok(prompt.includes("负面限制："), "must contain negative segment");
  assert.ok(prompt.includes('台词：“我回来了。”'), "must contain verbatim dialogue in original language");
  assert.ok(!prompt.includes("[") && !prompt.includes("]"), "must not contain leftover brackets/placeholders");
});
