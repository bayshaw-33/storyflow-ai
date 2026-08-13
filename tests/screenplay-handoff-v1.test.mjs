/**
 * tests/screenplay-handoff-v1.test.mjs
 * K21-HO-001..004: 版本化 handoff 契约
 *
 * 覆盖：
 * - 完整合法样本解析
 * - 稳定 scene ID
 * - 9:16 aspect ratio
 * - NEW/CONTINUOUS continuityMode
 * - 角色/场景母版版本
 * - 前后转场
 * - Canon/source hash 稳定性
 * - 非法缺字段拒绝
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

const {
  parseScreenplayHandoffV1,
  ScreenplayHandoffError,
  HANDOFF_SCHEMA_VERSION,
} = await import("../lib/screenplay-handoff/contracts.ts");

const { validateHandoff } = await import("../lib/screenplay-handoff/validate.ts");

const { hashHandoffContent } = await import("../lib/screenplay-handoff/hash.ts");

// ============================================================
// 测试样本
// ============================================================

function sampleHandoff(overrides = {}) {
  return {
    schemaVersion: "kiikis.screenplay-handoff/1",
    projectId: "proj-umbral-ep06",
    universeId: "uni-umbral-001",
    episodeId: "ep-06",
    episodeNo: 6,
    episodeTitle: "The Threshold",
    sourceUnitId: "unit-06",
    sourceVersion: "v3",
    sourceHash: "sha256:abc123",
    aspectRatio: "9:16",
    screenplayFormat: "international_production",
    screenplayLanguage: "en",
    dialogueLanguage: "en",
    canonSnapshot: {
      characters: [
        { id: "char-isa", name: "Isa", masterVersion: "v2", assetVersion: "v1" },
        { id: "char-umbral", name: "Umbral", masterVersion: "v1", assetVersion: "v1" },
      ],
      locations: [
        { id: "loc-threshold", name: "Threshold Room", masterVersion: "v1" },
      ],
      props: [
        { id: "prop-key", name: "Silver Key", masterVersion: "v1" },
      ],
    },
    scenes: [
      {
        id: "scene-06-01",
        sceneNo: 1,
        heading: "INT. THRESHOLD ROOM - NIGHT",
        location: "Threshold Room",
        interiorExterior: "INT",
        timeOfDay: "NIGHT",
        characters: ["char-isa"],
        continuityMode: "NEW",
        precedingTransition: null,
        succeedingTransition: "CUT TO:",
        blocks: [
          { id: "blk-1", type: "action", character: "", text: "Isa enters the dark room.", translation: "" },
          { id: "blk-2", type: "dialogue", character: "ISA", text: "I can feel it.", translation: "我能感觉到。" },
        ],
      },
      {
        id: "scene-06-02",
        sceneNo: 2,
        heading: "INT. THRESHOLD ROOM - CONTINUOUS",
        location: "Threshold Room",
        interiorExterior: "INT",
        timeOfDay: "NIGHT",
        characters: ["char-isa", "char-umbral"],
        continuityMode: "CONTINUOUS",
        precedingTransition: null,
        succeedingTransition: null,
        blocks: [
          { id: "blk-3", type: "action", character: "", text: "Umbral appears behind Isa.", translation: "" },
        ],
      },
    ],
    confirmedBy: null,
    createdAt: "2026-08-13T10:00:00.000Z",
    ...overrides,
  };
}

// ============================================================
// K21-HO-001: schemaVersion 契约
// ============================================================

test("K21-HO-001: 合法样本解析成功，schemaVersion = kiikis.screenplay-handoff/1", () => {
  const parsed = parseScreenplayHandoffV1(sampleHandoff());
  assert.equal(parsed.schemaVersion, "kiikis.screenplay-handoff/1");
  assert.equal(HANDOFF_SCHEMA_VERSION, "kiikis.screenplay-handoff/1");
});

test("K21-HO-001: schemaVersion 错误 — 拒绝", () => {
  assert.throws(
    () => parseScreenplayHandoffV1(sampleHandoff({ schemaVersion: "kiikis.screenplay-handoff/2" })),
    (err) => err instanceof ScreenplayHandoffError && /schemaVersion/.test(err.message)
  );
});

test("K21-HO-001: schemaVersion 缺失 — 拒绝", () => {
  const bad = sampleHandoff();
  delete bad.schemaVersion;
  assert.throws(
    () => parseScreenplayHandoffV1(bad),
    (err) => err instanceof ScreenplayHandoffError
  );
});

// ============================================================
// K21-HO-002: 稳定 Project/Universe/Episode/Scene/Actor/Location/Prop 版本
// ============================================================

test("K21-HO-002: projectId/universeId/episodeId 必须非空", () => {
  assert.throws(
    () => parseScreenplayHandoffV1(sampleHandoff({ projectId: "" })),
    (err) => err instanceof ScreenplayHandoffError && /projectId/.test(err.message)
  );
  assert.throws(
    () => parseScreenplayHandoffV1(sampleHandoff({ universeId: "" })),
    (err) => err instanceof ScreenplayHandoffError && /universeId/.test(err.message)
  );
  assert.throws(
    () => parseScreenplayHandoffV1(sampleHandoff({ episodeId: "" })),
    (err) => err instanceof ScreenplayHandoffError && /episodeId/.test(err.message)
  );
});

test("K21-HO-002: 场景稳定 ID — scene.id 必须非空且唯一", () => {
  // scene id 缺失
  const bad1 = sampleHandoff();
  delete bad1.scenes[0].id;
  assert.throws(
    () => parseScreenplayHandoffV1(bad1),
    (err) => err instanceof ScreenplayHandoffError && /scene.*id/i.test(err.message)
  );

  // scene id 重复
  const bad2 = sampleHandoff();
  bad2.scenes[1].id = bad2.scenes[0].id;
  assert.throws(
    () => parseScreenplayHandoffV1(bad2),
    (err) => err instanceof ScreenplayHandoffError && /duplicate.*scene.*id/i.test(err.message)
  );
});

test("K21-HO-002: 角色/场景/道具母版版本 — masterVersion 必须存在", () => {
  // character 缺 masterVersion
  const bad = sampleHandoff();
  delete bad.canonSnapshot.characters[0].masterVersion;
  assert.throws(
    () => parseScreenplayHandoffV1(bad),
    (err) => err instanceof ScreenplayHandoffError && /masterVersion/i.test(err.message)
  );

  // location 缺 masterVersion
  const bad2 = sampleHandoff();
  delete bad2.canonSnapshot.locations[0].masterVersion;
  assert.throws(
    () => parseScreenplayHandoffV1(bad2),
    (err) => err instanceof ScreenplayHandoffError && /masterVersion/i.test(err.message)
  );
});

// ============================================================
// 9:16 aspect ratio
// ============================================================

test("aspectRatio 必须为 9:16", () => {
  assert.equal(parseScreenplayHandoffV1(sampleHandoff()).aspectRatio, "9:16");

  assert.throws(
    () => parseScreenplayHandoffV1(sampleHandoff({ aspectRatio: "16:9" })),
    (err) => err instanceof ScreenplayHandoffError && /aspectRatio/.test(err.message)
  );

  assert.throws(
    () => parseScreenplayHandoffV1(sampleHandoff({ aspectRatio: "" })),
    (err) => err instanceof ScreenplayHandoffError && /aspectRatio/.test(err.message)
  );
});

// ============================================================
// NEW/CONTINUOUS continuityMode
// ============================================================

test("continuityMode 必须为 NEW 或 CONTINUOUS", () => {
  const parsed = parseScreenplayHandoffV1(sampleHandoff());
  assert.equal(parsed.scenes[0].continuityMode, "NEW");
  assert.equal(parsed.scenes[1].continuityMode, "CONTINUOUS");

  // 非法值
  const bad = sampleHandoff();
  bad.scenes[0].continuityMode = "FLASHBACK";
  assert.throws(
    () => parseScreenplayHandoffV1(bad),
    (err) => err instanceof ScreenplayHandoffError && /continuityMode/.test(err.message)
  );
});

// ============================================================
// 前后转场
// ============================================================

test("precedingTransition/succeedingTransition 接受 string 或 null", () => {
  const parsed = parseScreenplayHandoffV1(sampleHandoff());
  assert.equal(parsed.scenes[0].precedingTransition, null);
  assert.equal(parsed.scenes[0].succeedingTransition, "CUT TO:");
  assert.equal(parsed.scenes[1].precedingTransition, null);
  assert.equal(parsed.scenes[1].succeedingTransition, null);
});

test("succeedingTransition 非字符串非 null — 拒绝", () => {
  const bad = sampleHandoff();
  bad.scenes[0].succeedingTransition = 123;
  assert.throws(
    () => parseScreenplayHandoffV1(bad),
    (err) => err instanceof ScreenplayHandoffError
  );
});

// ============================================================
// K21-HO-003: sourceHash 稳定性
// ============================================================

test("sourceHash 必须存在且为非空字符串", () => {
  assert.equal(parseScreenplayHandoffV1(sampleHandoff()).sourceHash, "sha256:abc123");

  assert.throws(
    () => parseScreenplayHandoffV1(sampleHandoff({ sourceHash: "" })),
    (err) => err instanceof ScreenplayHandoffError && /sourceHash/.test(err.message)
  );
});

// ============================================================
// K21-HO-004: hashHandoffContent 稳定性
// ============================================================

test("K21-HO-004: hashHandoffContent — 相同输入产生相同 hash", async () => {
  const sample = sampleHandoff();
  const h1 = await hashHandoffContent(sample);
  const h2 = await hashHandoffContent(structuredClone(sample));
  assert.equal(h1, h2);
  assert.ok(h1.startsWith("sha256:"));
  assert.ok(h1.length > "sha256:".length + 32);
});

test("K21-HO-004: hashHandoffContent — 不同输入产生不同 hash", async () => {
  const sample = sampleHandoff();
  const h1 = await hashHandoffContent(sample);

  const modified = structuredClone(sample);
  modified.episodeTitle = "Different Title";
  const h2 = await hashHandoffContent(modified);

  assert.notEqual(h1, h2);
});

test("K21-HO-004: hashHandoffContent — 字段顺序不影响 hash (确定性)", async () => {
  const sample = sampleHandoff();
  const h1 = await hashHandoffContent(sample);

  // 重新排列 scenes 数组中 block 的 key 顺序 (JSON.stringify 受 key 顺序影响，
  // 所以 hashHandoffContent 必须做规范化排序)
  const reordered = structuredClone(sample);
  const scene = reordered.scenes[0];
  const block = scene.blocks[0];
  // 用不同 key 顺序重建 block
  scene.blocks[0] = {
    text: block.text,
    translation: block.translation,
    type: block.type,
    character: block.character,
    id: block.id,
  };
  const h2 = await hashHandoffContent(reordered);

  assert.equal(h1, h2, "key 顺序不应影响 hash");
});

test("K21-HO-004: hashHandoffContent — sourceHash 字段本身不参与 hash 计算", async () => {
  const sample = sampleHandoff();
  const h1 = await hashHandoffContent(sample);

  const modified = structuredClone(sample);
  modified.sourceHash = "sha256:different";
  const h2 = await hashHandoffContent(modified);

  // sourceHash 是派生字段，不应自我引用
  assert.equal(h1, h2);
});

test("K21-HO-004: hashHandoffContent — confirmedBy/createdAt 不参与 hash", async () => {
  const sample = sampleHandoff();
  const h1 = await hashHandoffContent(sample);

  const modified = structuredClone(sample);
  modified.confirmedBy = "user-123";
  modified.createdAt = "2026-08-14T00:00:00.000Z";
  const h2 = await hashHandoffContent(modified);

  assert.equal(h1, h2, "元数据字段不参与内容 hash");
});

// ============================================================
// validateHandoff: 综合校验
// ============================================================

test("validateHandoff: 合法样本返回 { valid: true, errors: [] }", () => {
  const result = validateHandoff(sampleHandoff());
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateHandoff: 多个错误一次性收集", () => {
  const bad = sampleHandoff({
    projectId: "",
    aspectRatio: "16:9",
    sourceHash: "",
  });
  const result = validateHandoff(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 3);
});

test("validateHandoff: scenes 为空数组 — 报错 (至少需要一场)", () => {
  const bad = sampleHandoff({ scenes: [] });
  const result = validateHandoff(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /scene/i.test(e.field) || /scene/i.test(e.message)));
});

test("validateHandoff: scene 缺 location — 报错", () => {
  const bad = sampleHandoff();
  delete bad.scenes[0].location;
  const result = validateHandoff(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /location/i.test(e.field) || /location/i.test(e.message)));
});

test("validateHandoff: scene characters 引用 canonSnapshot 中不存在的角色 — 报错", () => {
  const bad = sampleHandoff();
  bad.scenes[0].characters = ["char-unknown"];
  const result = validateHandoff(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /character.*canon/i.test(e.field + " " + e.message) || /canon.*character/i.test(e.field + " " + e.message)));
});

// ============================================================
// 冻结对象
// ============================================================

test("parseScreenplayHandoffV1 返回冻结对象 — 不可变", () => {
  const parsed = parseScreenplayHandoffV1(sampleHandoff());
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.scenes));
  assert.ok(Object.isFrozen(parsed.scenes[0]));
  assert.ok(Object.isFrozen(parsed.canonSnapshot));
});

// ============================================================
// ScreenplayHandoffError 结构
// ============================================================

test("ScreenplayHandoffError 携带 field 和 code", () => {
  try {
    parseScreenplayHandoffV1(sampleHandoff({ projectId: "" }));
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof ScreenplayHandoffError);
    assert.ok(err.field);
    assert.equal(err.code, "invalid_handoff");
  }
});
