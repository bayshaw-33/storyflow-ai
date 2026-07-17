/**
 * storyboard-prompts tests — KIIKIS-P1-KIMI-002 §6
 *
 * Approved-version binding into referenceVersionIds, single-source
 * appearance in imagePrompt, inputHash stability/sensitivity, per-shot
 * isolation (SHOT_NOT_FOUND item + HTTP-200-level success for the rest),
 * zh jimeng memo structure, verbatim ES dialogue, en variant.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  runPromptBuild,
  validatePromptRequest,
  parsePromptJsonBody,
  isPromptFailure,
} from "../lib/storyboard/prompts/index.ts";
import { PROMPT_TEMPLATE_VERSION } from "../lib/storyboard/prompts/templates.ts";

function persistedShot(overrides = {}) {
  return {
    id: "shot-server-1",
    clientId: "shot-server-1",
    idSource: "server",
    sceneId: "scene-1",
    order: 1,
    sourceText: "Isa entra.",
    storyBeat: "女主发现秘密",
    visualDescription: "林晚把婚戒举到沈砚眼前",
    characterAssetIds: ["asset-char-1"],
    sceneAssetId: "asset-loc-1",
    propAssetIds: ["asset-prop-1"],
    shotSize: "特写",
    cameraMovement: "缓推",
    angle: "平视",
    durationSeconds: 4,
    dialogue: "¿Dónde estuviste anoche, Isa?",
    emotion: "震惊",
    continuity: "保持礼服一致",
    imagePrompt: "",
    jimengPromptZh: "",
    locked: false,
    userEdited: false,
    confirmed: false,
    revision: 1,
    analysisVersion: 1,
    sourceHash: "sha256:source",
    ...overrides,
  };
}

function approvedInfo(overrides = {}) {
  return {
    assetId: "asset-char-1",
    name: "林晚",
    description: "原始资产描述：黑长直发的年轻女性（不应直接出现在提示词里）",
    versionId: "version-char-1",
    storagePath: "u/p/generated/asset-char-1/0.png",
    previewUrl: "https://example.test/signed/0.png",
    appearanceSummary: "approved look: 银色短发造型，湿礼服",
    ...overrides,
  };
}

function makeDeps({ shots = [persistedShot()], approved = new Map() } = {}) {
  return {
    loadShots: async () => ({ shots, visualStyle: "写实豪门短剧", aspectRatio: "9:16" }),
    loadApprovedVersions: async () => approved,
  };
}

function makeRequest(overrides = {}) {
  const result = validatePromptRequest({
    projectId: "project-1",
    sourceUnitId: "episode-1",
    analysisVersion: 1,
    shotIds: ["shot-server-1"],
    language: "zh",
    expectedRevision: 4,
    idempotencyKey: "prompt-1",
    ...overrides,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
}

function fullApprovedMap() {
  return new Map([
    ["asset-char-1", approvedInfo()],
    [
      "asset-loc-1",
      approvedInfo({
        assetId: "asset-loc-1",
        name: "沈家花园",
        description: "原始场景描述",
        versionId: "version-loc-1",
        appearanceSummary: "approved look: 雨后欧式庭院",
      }),
    ],
    [
      "asset-prop-1",
      approvedInfo({
        assetId: "asset-prop-1",
        name: "婚戒",
        description: "原始道具描述",
        versionId: "version-prop-1",
        appearanceSummary: "approved look: 铂金素圈",
      }),
    ],
  ]);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test("prompts: invalid body / non-JSON → 422 codes", () => {
  assert.equal(parsePromptJsonBody("nope{").code, "INVALID_JSON");
  const emptyShots = validatePromptRequest({ shotIds: [] });
  assert.equal(emptyShots.code, "MISSING_FIELD");
  const tooMany = validatePromptRequest({
    projectId: "p",
    sourceUnitId: "s",
    analysisVersion: 1,
    shotIds: Array.from({ length: 201 }, (_, i) => `shot-${i}`),
    expectedRevision: 0,
    idempotencyKey: "k",
  });
  assert.equal(tooMany.code, "MISSING_FIELD");
  assert.ok(tooMany.details.fields.some((f) => f.startsWith("shotIds")));
});

test("prompts: language defaults to zh", () => {
  const result = validatePromptRequest({
    projectId: "p",
    sourceUnitId: "s",
    analysisVersion: 1,
    shotIds: ["a"],
    expectedRevision: 0,
    idempotencyKey: "k",
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.language, "zh");
});

// ---------------------------------------------------------------------------
// Approved-version binding + single-source appearance
// ---------------------------------------------------------------------------

test("prompts: approved version ids bound into referenceVersionIds; appearance single-sourced", async () => {
  const approved = fullApprovedMap();
  // Prop has NO approved version → contributes nothing, prompt falls back to description.
  approved.set("asset-prop-1", { ...approved.get("asset-prop-1"), versionId: null, storagePath: null, appearanceSummary: "复古铂金素圈婚戒（资产描述兜底）" });

  const result = await runPromptBuild(makeDeps({ approved }), makeRequest(), { ownerId: "u1" });
  assert.equal(result.revision, 5);
  assert.equal(result.prompts.length, 1);

  const item = result.prompts[0];
  assert.ok(!isPromptFailure(item));
  assert.deepEqual([...item.referenceVersionIds].sort(), ["version-char-1", "version-loc-1"]);
  assert.match(item.inputHash, /^sha256:[a-f0-9]{64}$/);

  // imagePrompt carries the APPROVED appearance, not the raw asset description.
  assert.ok(item.imagePrompt.includes("银色短发造型"), item.imagePrompt);
  assert.ok(!item.imagePrompt.includes("原始资产描述"), "raw asset description must not be duplicated in");
  // Prop without approved version falls back to its description.
  assert.ok(item.imagePrompt.includes("复古铂金素圈婚戒"), item.imagePrompt);
  assert.ok(item.negativePrompt.includes("watermark"));
});

// ---------------------------------------------------------------------------
// inputHash stability / sensitivity
// ---------------------------------------------------------------------------

test("prompts: same input → same inputHash; selectedVersionId change → hash changes", async () => {
  const deps = makeDeps({ approved: fullApprovedMap() });
  const first = await runPromptBuild(deps, makeRequest(), { ownerId: "u1" });
  const second = await runPromptBuild(deps, makeRequest(), { ownerId: "u1" });
  assert.equal(first.prompts[0].inputHash, second.prompts[0].inputHash);

  const changed = fullApprovedMap();
  changed.set("asset-char-1", { ...changed.get("asset-char-1"), versionId: "version-char-2" });
  const third = await runPromptBuild(makeDeps({ approved: changed }), makeRequest(), { ownerId: "u1" });
  assert.notEqual(third.prompts[0].inputHash, first.prompts[0].inputHash, "hash MUST change when a selectedVersionId changes");
});

// ---------------------------------------------------------------------------
// Per-shot isolation
// ---------------------------------------------------------------------------

test("prompts: one missing shotId → SHOT_NOT_FOUND item, others succeed (200-level result)", async () => {
  const shots = [persistedShot(), persistedShot({ id: "shot-server-2", clientId: "shot-server-2", order: 2 })];
  const result = await runPromptBuild(
    makeDeps({ shots, approved: fullApprovedMap() }),
    makeRequest({ shotIds: ["shot-server-1", "ghost-shot", "shot-server-2"] }),
    { ownerId: "u1" },
  );

  assert.equal(result.prompts.length, 3);
  assert.ok(!isPromptFailure(result.prompts[0]));
  assert.equal(result.prompts[1].code, "SHOT_NOT_FOUND");
  assert.equal(result.prompts[1].shotId, "ghost-shot");
  assert.ok(result.prompts[1].error.length > 0);
  assert.ok(!isPromptFailure(result.prompts[2]));
  assert.equal(result.revision, 5, "revision = expectedRevision + 1");
});

// ---------------------------------------------------------------------------
// zh jimeng memo structure + verbatim dialogue + en variant
// ---------------------------------------------------------------------------

test("prompts: zh jimeng prompt has the required memo sections, no placeholders, ES dialogue verbatim", async () => {
  const result = await runPromptBuild(makeDeps({ approved: fullApprovedMap() }), makeRequest(), { ownerId: "u1" });
  const item = result.prompts[0];
  const prompt = item.jimengVideoPrompt;

  for (const section of ["主体", "动作", "表情情绪", "场景", "景别", "镜头运动", "光线与画面质感", "时长感", "画幅", "连贯性限制", "负面限制"]) {
    assert.ok(prompt.includes(section), `jimeng prompt missing section ${section}: ${prompt}`);
  }
  assert.ok(!prompt.includes("["), "no leftover placeholders");
  assert.ok(!prompt.includes("]"), "no leftover placeholders");
  assert.ok(prompt.includes("约4秒"), "durationSeconds → 时长感");
  assert.ok(prompt.includes("台词：“¿Dónde estuviste anoche, Isa?”"), "ES dialogue verbatim in zh prompt");
});

test("prompts: en variant builds with English structure and verbatim dialogue", async () => {
  const result = await runPromptBuild(
    makeDeps({ approved: fullApprovedMap() }),
    makeRequest({ language: "en" }),
    { ownerId: "u1" },
  );
  const item = result.prompts[0];
  assert.ok(item.jimengVideoPrompt.includes("Subject:"), item.jimengVideoPrompt);
  assert.ok(item.jimengVideoPrompt.includes("Camera movement:"), item.jimengVideoPrompt);
  assert.ok(item.jimengVideoPrompt.includes("Aspect ratio:"), item.jimengVideoPrompt);
  assert.ok(item.jimengVideoPrompt.includes('Dialogue: "¿Dónde estuviste anoche, Isa?"'), "dialogue never translated");
  // language participates in the hash → different from zh build of same shot.
  const zh = await runPromptBuild(makeDeps({ approved: fullApprovedMap() }), makeRequest(), { ownerId: "u1" });
  assert.notEqual(item.inputHash, zh.prompts[0].inputHash);
});

test("prompts: template version is pinned", () => {
  assert.equal(PROMPT_TEMPLATE_VERSION, "sb-prompts/1");
});
