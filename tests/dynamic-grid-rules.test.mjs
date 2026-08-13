/**
 * tests/dynamic-grid-rules.test.mjs
 * K21-SB-001..006, K21-SB-009: 动态宫格分镜契约与导演规则
 */
import assert from "node:assert/strict";
import test from "node:test";

const {
  parseDynamicGridScene,
  DynamicGridError,
  DYNAMIC_GRID_COUNTS,
  DYNAMIC_GRID_SCHEMA_VERSION,
} = await import("../lib/storyboard/dynamic-grid-contract.ts");

const {
  validateDirectorRules,
  recommendGridCount,
} = await import("../lib/storyboard/dynamic-grid-rules.ts");

function makeFrame(overrides = {}) {
  return {
    id: "frame-1",
    order: 1,
    aspectRatio: "9:16",
    visualDescription: "Dark room, moonlight through window",
    characterIds: [],
    shotSize: "wide",
    cameraMovement: "slow dolly forward",
    emotion: "tense",
    dialogue: "",
    action: "Isa looks around",
    timecode: "00:00:01",
    locked: false,
    userEdited: false,
    ...overrides,
  };
}

function makeScene(overrides = {}) {
  return {
    schemaVersion: "kiikis.dynamic-grid-storyboard/1",
    handoffId: "handoff-1",
    sceneId: "scene-06-01",
    continuityMode: "NEW",
    gridCount: 4,
    gridRationale: "Low density scene with single character",
    spatialPlan: {
      axis: "180-degree",
      entrances: ["left"],
      screenDirections: ["left-to-right"],
    },
    sharedCinematography: "Cool blue tones, low key lighting",
    negativePrompt: "text, watermark, subtitle",
    frames: [
      makeFrame({ id: "frame-1", order: 1, characterIds: [], cameraMovement: "slow dolly forward" }),
      makeFrame({ id: "frame-2", order: 2, characterIds: ["char-isa"], shotSize: "medium", cameraMovement: "static hold" }),
      makeFrame({ id: "frame-3", order: 3, characterIds: ["char-isa"], shotSize: "close-up", cameraMovement: "subtle tilt up" }),
      makeFrame({ id: "frame-4", order: 4, characterIds: ["char-isa"], shotSize: "wide", cameraMovement: "slow zoom out" }),
    ],
    ...overrides,
  };
}

// ============================================================
// K21-SB-001: 宫格数量契约
// ============================================================

test("K21-SB-001: DYNAMIC_GRID_COUNTS = [4, 6, 9, 12]", () => {
  assert.deepEqual([...DYNAMIC_GRID_COUNTS], [4, 6, 9, 12]);
});

test("K21-SB-001: recommendGridCount 低密度 → 4", () => {
  assert.equal(recommendGridCount({ sceneBlockCount: 2, characterCount: 1, hasAction: false, hasMontage: false }), 4);
});

test("K21-SB-001: recommendGridCount 中等密度 → 6", () => {
  assert.equal(recommendGridCount({ sceneBlockCount: 5, characterCount: 2, hasAction: false, hasMontage: false }), 6);
});

test("K21-SB-001: recommendGridCount 动作密集 → 9", () => {
  assert.equal(recommendGridCount({ sceneBlockCount: 8, characterCount: 3, hasAction: true, hasMontage: false }), 9);
});

test("K21-SB-001: recommendGridCount montage → 12", () => {
  assert.equal(recommendGridCount({ sceneBlockCount: 12, characterCount: 4, hasAction: true, hasMontage: true }), 12);
});

// ============================================================
// K21-SB-004: 每格 aspectRatio = 9:16
// ============================================================

test("K21-SB-004: parseDynamicGridScene 校验每格 aspectRatio=9:16", () => {
  const parsed = parseDynamicGridScene(makeScene());
  for (const frame of parsed.frames) {
    assert.equal(frame.aspectRatio, "9:16");
  }
});

test("K21-SB-004: 格 aspectRatio 非 9:16 — 拒绝", () => {
  const bad = makeScene();
  bad.frames[0].aspectRatio = "16:9";
  assert.throws(
    () => parseDynamicGridScene(bad),
    (err) => err instanceof DynamicGridError && /aspectRatio/.test(err.message)
  );
});

// ============================================================
// frames.length 等于 gridCount
// ============================================================

test("frames.length 必须等于 gridCount", () => {
  const parsed = parseDynamicGridScene(makeScene());
  assert.equal(parsed.frames.length, parsed.gridCount);
});

test("frames.length 不等于 gridCount — 拒绝", () => {
  const bad = makeScene({ gridCount: 6 }); // 但只有 4 帧
  assert.throws(
    () => parseDynamicGridScene(bad),
    (err) => err instanceof DynamicGridError && /frames\.length.*gridCount/.test(err.message)
  );
});

test("gridCount=12 时需要 12 帧", () => {
  const frames = Array.from({ length: 12 }, (_, i) =>
    makeFrame({ id: `frame-${i + 1}`, order: i + 1, characterIds: i === 0 ? [] : ["char-isa"] })
  );
  const parsed = parseDynamicGridScene(makeScene({ gridCount: 12, frames }));
  assert.equal(parsed.frames.length, 12);
});

// ============================================================
// K21-SB-002: NEW 首格无人空镜
// ============================================================

test("K21-SB-002: NEW 首格有人物 → 违例", () => {
  const scene = makeScene({ continuityMode: "NEW" });
  scene.frames[0].characterIds = ["char-isa"];
  const parsed = parseDynamicGridScene(scene);
  const result = validateDirectorRules(parsed);

  assert.ok(result.violations.some((v) => v.rule === "K21-SB-002" && /无人空镜/.test(v.message)));
});

test("K21-SB-002: NEW 首格无运镜 → 违例", () => {
  const scene = makeScene({ continuityMode: "NEW" });
  scene.frames[0].cameraMovement = "";
  const parsed = parseDynamicGridScene(scene);
  // 空运镜会在 parse 阶段被拒绝 (cameraMovement 必须是 string，空字符串允许)
  // 但 K21-SB-002 规则要求有明确运镜
  const result = validateDirectorRules(parsed);

  assert.ok(result.violations.some((v) => v.rule === "K21-SB-002" && /运镜/.test(v.message)));
});

test("K21-SB-002: NEW 首格无人且有运镜 → 无违例", () => {
  const parsed = parseDynamicGridScene(makeScene({ continuityMode: "NEW" }));
  const result = validateDirectorRules(parsed);

  assert.ok(
    !result.violations.some((v) => v.rule === "K21-SB-002"),
    "NEW 首格合规时不应有 K21-SB-002 违例"
  );
});

// ============================================================
// K21-SB-003: CONTINUOUS 不强制空镜
// ============================================================

test("K21-SB-003: CONTINUOUS 首格有人物 → 无违例 (不强制空镜)", () => {
  const scene = makeScene({ continuityMode: "CONTINUOUS" });
  scene.frames[0].characterIds = ["char-isa"];
  const parsed = parseDynamicGridScene(scene);
  const result = validateDirectorRules(parsed);

  assert.ok(
    !result.violations.some((v) => v.rule === "K21-SB-002"),
    "CONTINUOUS 场不应触发 K21-SB-002 (NEW 首格空镜规则)"
  );
});

// ============================================================
// K21-SB-005: 相邻格变化
// ============================================================

test("K21-SB-005: 相邻格景别和运镜完全相同 → 违例", () => {
  const scene = makeScene();
  scene.frames[1].shotSize = "wide"; // 与 frame-1 相同
  scene.frames[1].cameraMovement = "slow dolly forward"; // 与 frame-1 相同
  const parsed = parseDynamicGridScene(scene);
  const result = validateDirectorRules(parsed);

  assert.ok(
    result.violations.some((v) => v.rule === "K21-SB-005" && /景别.*运镜.*相同/.test(v.message)),
    "相邻格完全相同应有违例"
  );
});

test("K21-SB-005: 相邻格景别不同 → 无违例", () => {
  const parsed = parseDynamicGridScene(makeScene());
  const result = validateDirectorRules(parsed);

  assert.ok(
    !result.violations.some((v) => v.rule === "K21-SB-005" && /相同/.test(v.message)),
    "相邻格景别不同时不应有变化违例"
  );
});

// ============================================================
// K21-SB-006: 不烧录可读文字
// ============================================================

test("K21-SB-006: visualDescription 含台词引号 → 违例", () => {
  const scene = makeScene();
  scene.frames[1].visualDescription = 'Isa says "hello" to the darkness';
  const parsed = parseDynamicGridScene(scene);
  const result = validateDirectorRules(parsed);

  assert.ok(result.violations.some((v) => v.rule === "K21-SB-006" && /可读文字/.test(v.message)));
});

test("K21-SB-006: visualDescription 含格编号 → 违例", () => {
  const scene = makeScene();
  scene.frames[1].visualDescription = "第2格：Isa stands in darkness";
  const parsed = parseDynamicGridScene(scene);
  const result = validateDirectorRules(parsed);

  assert.ok(result.violations.some((v) => v.rule === "K21-SB-006" && /编号/.test(v.message)));
});

test("K21-SB-006: dialogue 字段独立存在不烧录画面 — 无违例", () => {
  const scene = makeScene();
  scene.frames[1].dialogue = "I can feel it";
  scene.frames[1].visualDescription = "Isa stands in the dark room";
  const parsed = parseDynamicGridScene(scene);
  const result = validateDirectorRules(parsed);

  assert.ok(
    !result.violations.some((v) => v.rule === "K21-SB-006"),
    "dialogue 字段独立存在不应触发文字烧录违例"
  );
});

// ============================================================
// K21-SB-009: 完整摄影提示词
// ============================================================

test("K21-SB-009: cameraMovement 过短 → 违例", () => {
  const scene = makeScene();
  scene.frames[1].cameraMovement = "ok";
  const parsed = parseDynamicGridScene(scene);
  const result = validateDirectorRules(parsed);

  assert.ok(result.violations.some((v) => v.rule === "K21-SB-009" && /过短/.test(v.message)));
});

test("K21-SB-009: cameraMovement 足够长 → 无违例", () => {
  const parsed = parseDynamicGridScene(makeScene());
  const result = validateDirectorRules(parsed);

  assert.ok(
    !result.violations.some((v) => v.rule === "K21-SB-009"),
    "cameraMovement 足够长时不应有违例"
  );
});

// ============================================================
// 冻结对象
// ============================================================

test("parseDynamicGridScene 返回冻结对象", () => {
  const parsed = parseDynamicGridScene(makeScene());
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.frames));
  assert.ok(Object.isFrozen(parsed.frames[0]));
  assert.ok(Object.isFrozen(parsed.spatialPlan));
});

// ============================================================
// schemaVersion 契约
// ============================================================

test("schemaVersion 错误 — 拒绝", () => {
  const bad = makeScene({ schemaVersion: "kiikis.dynamic-grid-storyboard/2" });
  assert.throws(
    () => parseDynamicGridScene(bad),
    (err) => err instanceof DynamicGridError && /schemaVersion/.test(err.message)
  );
});

test("gridCount 非法值 (5) — 拒绝", () => {
  const bad = makeScene({ gridCount: 5 });
  assert.throws(
    () => parseDynamicGridScene(bad),
    (err) => err instanceof DynamicGridError && /gridCount/.test(err.message)
  );
});

test("continuityMode 非法值 — 拒绝", () => {
  const bad = makeScene({ continuityMode: "FLASHBACK" });
  assert.throws(
    () => parseDynamicGridScene(bad),
    (err) => err instanceof DynamicGridError && /continuityMode/.test(err.message)
  );
});

// ============================================================
// 完整合法场景无违例
// ============================================================

test("完整合法 NEW 场景 — validateDirectorRules 返回 valid=true", () => {
  const parsed = parseDynamicGridScene(makeScene());
  const result = validateDirectorRules(parsed);
  assert.equal(result.valid, true);
  assert.equal(result.violations.length, 0);
});
