/**
 * tests/creation-handoff-action.test.mjs
 * Task 2.3: 从 CreationUnit 构建 handoff 输入 + 跳转 URL
 */
import assert from "node:assert/strict";
import test from "node:test";

const {
  buildHandoffInputFromCreation,
  buildProductionRedirectUrl,
} = await import("../lib/screenplay-handoff/from-creation.ts");

function makeWorkspace(overrides = {}) {
  return {
    version: 2,
    documents: {
      backgroundWorld: { content: "", updatedAt: "", status: "finalized" },
      characterBible: { content: "", updatedAt: "", status: "finalized" },
      plotOutline: { content: "", updatedAt: "", status: "finalized" },
    },
    novel: { arcs: [], units: [] },
    screenplay: { arcs: [], units: [] },
    settings: {
      activeMode: "screenplay",
      interfaceLanguage: "zh-CN",
      targetMarket: "global",
      genre: "drama",
      sourceLanguage: "en",
      translationLanguage: "zh-CN",
      translationEnabled: true,
      screenplayLanguage: "en",
      dialogueLanguage: "en",
      screenplayFormat: "international_production",
      generationScope: "unit",
      ...overrides,
    },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
  };
}

function makeUnit(overrides = {}) {
  return {
    id: "unit-06",
    number: 6,
    title: "EP06 The Threshold",
    outline: "Isa crosses the threshold.",
    content: "screenplay text...",
    screenplay: {
      id: "ep-06",
      episodeNo: 6,
      title: "The Threshold",
      logline: "Isa faces the unknown.",
      scenes: [
        {
          id: "scene-06-01",
          sceneNo: 1,
          heading: "INT. THRESHOLD ROOM - NIGHT",
          location: "Threshold Room",
          interiorExterior: "INT",
          timeOfDay: "NIGHT",
          characters: ["ISA"],
          blocks: [
            { id: "blk-1", type: "action", character: "", text: "Isa enters.", translation: "" },
            { id: "blk-2", type: "dialogue", character: "ISA", text: "I can feel it.", translation: "我能感觉到。" },
            { id: "blk-3", type: "transition", character: "", text: "CUT TO:", translation: "" },
          ],
          status: "finalized",
        },
        {
          id: "scene-06-02",
          sceneNo: 2,
          heading: "INT. THRESHOLD ROOM - CONTINUOUS",
          location: "Threshold Room",
          interiorExterior: "INT",
          timeOfDay: "NIGHT",
          characters: ["ISA", "UMBRAL"],
          blocks: [
            { id: "blk-4", type: "action", character: "", text: "Umbral appears.", translation: "" },
          ],
          status: "finalized",
        },
      ],
    },
    continuityNotes: "",
    status: "finalized",
    versions: [],
    translation: "",
    localizedContent: "",
    localizationChanges: "",
    similarityReport: "",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-13T00:00:00.000Z",
    ...overrides,
  };
}

function makeCanon() {
  return {
    canonCharacters: [
      { id: "char-isa", name: "Isa", masterVersion: "v2", assetVersion: "v1" },
      { id: "char-umbral", name: "Umbral", masterVersion: "v1", assetVersion: "v1" },
    ],
    canonLocations: [{ id: "loc-threshold", name: "Threshold Room", masterVersion: "v1" }],
    canonProps: [],
  };
}

// ============================================================
// 基本转换
// ============================================================

test("buildHandoffInputFromCreation: 合法输入成功转换", () => {
  const result = buildHandoffInputFromCreation(
    makeWorkspace(),
    makeUnit(),
    { projectId: "proj-1", universeId: "uni-1", ...makeCanon() }
  );

  assert.equal(result.issues.length, 0);
  assert.ok(result.input);
  assert.equal(result.input.projectId, "proj-1");
  assert.equal(result.input.universeId, "uni-1");
  assert.equal(result.input.episodeId, "ep-06");
  assert.equal(result.input.episodeNo, 6);
  assert.equal(result.input.episodeTitle, "The Threshold");
  assert.equal(result.input.sourceUnitId, "unit-06");
  assert.equal(result.input.aspectRatio, undefined); // aspectRatio 由 service 层固定为 9:16
  assert.equal(result.input.screenplayFormat, "international_production");
  assert.equal(result.input.scenes.length, 2);
});

test("buildHandoffInputFromCreation: summary 包含正确统计", () => {
  const result = buildHandoffInputFromCreation(
    makeWorkspace(),
    makeUnit(),
    { projectId: "proj-1", universeId: "uni-1", ...makeCanon() }
  );

  assert.equal(result.summary.episodeNo, 6);
  assert.equal(result.summary.episodeTitle, "The Threshold");
  assert.equal(result.summary.sceneCount, 2);
  assert.equal(result.summary.characterCount, 2);
  assert.equal(result.summary.locationCount, 1);
});

// ============================================================
// continuityMode 推断
// ============================================================

test("buildHandoffInputFromCreation: heading 含 CONTINUOUS → continuityMode=CONTINUOUS", () => {
  const result = buildHandoffInputFromCreation(
    makeWorkspace(),
    makeUnit(),
    { projectId: "proj-1", universeId: "uni-1", ...makeCanon() }
  );

  assert.equal(result.input.scenes[0].continuityMode, "NEW"); // INT. THRESHOLD ROOM - NIGHT
  assert.equal(result.input.scenes[1].continuityMode, "CONTINUOUS"); // ... - CONTINUOUS
});

// ============================================================
// 转场提取
// ============================================================

test("buildHandoffInputFromCreation: transition 从 blocks 中提取为 succeedingTransition", () => {
  const result = buildHandoffInputFromCreation(
    makeWorkspace(),
    makeUnit(),
    { projectId: "proj-1", universeId: "uni-1", ...makeCanon() }
  );

  // scene 1 有 "CUT TO:" 转场
  assert.equal(result.input.scenes[0].succeedingTransition, "CUT TO:");
  // 转场不应出现在 blocks 中
  assert.ok(!result.input.scenes[0].blocks.some((b) => b.type === "transition"));

  // scene 2 无转场
  assert.equal(result.input.scenes[1].succeedingTransition, null);
});

// ============================================================
// 缺母版校验
// ============================================================

test("buildHandoffInputFromCreation: 缺角色母版 → issues 报错", () => {
  const result = buildHandoffInputFromCreation(
    makeWorkspace(),
    makeUnit(),
    {
      projectId: "proj-1",
      universeId: "uni-1",
      canonCharacters: [], // 空
      canonLocations: makeCanon().canonLocations,
      canonProps: [],
    }
  );

  assert.ok(result.issues.length > 0);
  assert.ok(result.issues.some((i) => i.code === "missing_character_master"));
  assert.equal(result.input, null);
});

// ============================================================
// 缺场景 ID / location 校验
// ============================================================

test("buildHandoffInputFromCreation: 场景缺 location → issues 报错", () => {
  const unit = makeUnit();
  unit.screenplay.scenes[0].location = "";
  const result = buildHandoffInputFromCreation(
    makeWorkspace(),
    unit,
    { projectId: "proj-1", universeId: "uni-1", ...makeCanon() }
  );

  assert.ok(result.issues.some((i) => i.code === "missing_location"));
  assert.equal(result.input, null);
});

test("buildHandoffInputFromCreation: 场景缺稳定 ID → issues 报错", () => {
  const unit = makeUnit();
  unit.screenplay.scenes[0].id = "";
  const result = buildHandoffInputFromCreation(
    makeWorkspace(),
    unit,
    { projectId: "proj-1", universeId: "uni-1", ...makeCanon() }
  );

  assert.ok(result.issues.some((i) => i.code === "missing_scene_id"));
  assert.equal(result.input, null);
});

// ============================================================
// 缺 screenplay 校验
// ============================================================

test("buildHandoffInputFromCreation: unit 无 screenplay → issues 报错", () => {
  const unit = makeUnit();
  unit.screenplay = null;
  const result = buildHandoffInputFromCreation(
    makeWorkspace(),
    unit,
    { projectId: "proj-1", universeId: "uni-1", ...makeCanon() }
  );

  assert.ok(result.issues.some((i) => i.code === "missing_screenplay"));
  assert.equal(result.input, null);
  assert.equal(result.summary.sceneCount, 0);
});

test("buildHandoffInputFromCreation: 单集无场景 → issues 报错", () => {
  const unit = makeUnit();
  unit.screenplay.scenes = [];
  const result = buildHandoffInputFromCreation(
    makeWorkspace(),
    unit,
    { projectId: "proj-1", universeId: "uni-1", ...makeCanon() }
  );

  assert.ok(result.issues.some((i) => i.code === "no_scenes"));
  assert.equal(result.input, null);
});

// ============================================================
// sourceVersion 推断
// ============================================================

test("buildHandoffInputFromCreation: sourceVersion 基于 unit.number", () => {
  const result = buildHandoffInputFromCreation(
    makeWorkspace(),
    makeUnit({ number: 6 }),
    { projectId: "proj-1", universeId: "uni-1", ...makeCanon() }
  );

  assert.equal(result.input.sourceVersion, "unit-v6");
  assert.equal(result.input.sourceUnitId, "unit-06");
});

// ============================================================
// buildProductionRedirectUrl
// ============================================================

test("buildProductionRedirectUrl: 生成正确的跳转 URL", () => {
  const url = buildProductionRedirectUrl({
    projectId: "proj-umbral",
    sourceUnitId: "unit-06",
    handoffId: "handoff-abc",
  });

  assert.ok(url.startsWith("/production?"));
  assert.ok(url.includes("projectId=proj-umbral"));
  assert.ok(url.includes("unitId=unit-06"));
  assert.ok(url.includes("handoffId=handoff-abc"));
  assert.ok(url.includes("tab=storyboard"));
  assert.ok(!url.includes("mode="));
});

// ============================================================
// screenplay settings 传递
// ============================================================

test("buildHandoffInputFromCreation: screenplayLanguage/dialogueLanguage 从 workspace.settings 传递", () => {
  const result = buildHandoffInputFromCreation(
    makeWorkspace({ screenplayLanguage: "zh", dialogueLanguage: "en" }),
    makeUnit(),
    { projectId: "proj-1", universeId: "uni-1", ...makeCanon() }
  );

  assert.equal(result.input.screenplayLanguage, "zh");
  assert.equal(result.input.dialogueLanguage, "en");
});
