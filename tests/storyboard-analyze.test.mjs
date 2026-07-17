/**
 * storyboard-analyze tests — KIIKIS-P1-KIMI-002 §6
 *
 * Covers: request validation (422 INVALID_JSON / MISSING_FIELD), garbage AI
 * output (ANALYZE_OUTPUT_INVALID, never 200-with-empty-scenes), per-fixture
 * happy paths via mock-ai/*.json, server-assigned ids, verbatim dialogue,
 * asset dedupe, unresolved-name auto-creation, duration normalization.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { runAnalyze } from "../lib/storyboard/analyze/index.ts";
import { parseAnalyzeOutput } from "../lib/storyboard/analyze/parse.ts";
import { parseAnalyzeJsonBody, validateAnalyzeRequest } from "../lib/storyboard/analyze/schema.ts";
import { StoryboardError } from "../lib/storyboard/analyze/types.ts";

const FIXTURES = new URL("./fixtures/storyboard/", import.meta.url);
const MOCK_AI = new URL("./fixtures/storyboard/mock-ai/", import.meta.url);

function readFixture(name) {
  return readFileSync(new URL(`${name}.txt`, FIXTURES), "utf8");
}

function readMock(name) {
  return readFileSync(new URL(`${name}.json`, MOCK_AI), "utf8");
}

function makeRequest(overrides = {}) {
  return {
    projectId: "project-1",
    sourceUnitId: "episode-1",
    source: "剧本",
    aspectRatio: "9:16",
    targetDurationSeconds: 60,
    visualStyle: "写实豪门短剧",
    outputLanguage: "zh-CN",
    mode: "full",
    sceneId: null,
    expectedRevision: 3,
    idempotencyKey: "req-1",
    ...overrides,
  };
}

function makeDeps(mockRaw, existingScenes = []) {
  return {
    callAI: async () => mockRaw,
    loadExistingState: async () => ({ scenes: existingScenes }),
  };
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

test("analyze: non-JSON body → 422 INVALID_JSON", () => {
  const result = parseAnalyzeJsonBody("{not json");
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.code, "INVALID_JSON");
});

test("analyze: missing fields → 422 MISSING_FIELD with details.fields", () => {
  const result = validateAnalyzeRequest({ projectId: "p" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.equal(result.code, "MISSING_FIELD");
  assert.ok(Array.isArray(result.details.fields));
  for (const field of ["sourceUnitId", "source", "aspectRatio", "targetDurationSeconds", "outputLanguage", "mode", "expectedRevision", "idempotencyKey"]) {
    assert.ok(result.details.fields.includes(field), `expected ${field} in details.fields`);
  }
});

test("analyze: invalid enums / ranges rejected", () => {
  for (const patch of [
    { aspectRatio: "4:3" },
    { targetDurationSeconds: 0 },
    { targetDurationSeconds: 601 },
    { targetDurationSeconds: "60" },
    { mode: "partial" },
    { mode: "scene", sceneId: null },
    { source: "" },
    { expectedRevision: -1 },
  ]) {
    const result = validateAnalyzeRequest(makeRequest(patch));
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.equal(result.code, "MISSING_FIELD");
  }
});

test("analyze: valid request passes (aspectRatio 1:1 allowed at runtime)", () => {
  const result = validateAnalyzeRequest(makeRequest({ aspectRatio: "1:1" }));
  assert.equal(result.ok, true);
  assert.equal(result.value.aspectRatio, "1:1");
});

// ---------------------------------------------------------------------------
// Garbage AI output — fail visibly, never 200-with-empty-scenes
// ---------------------------------------------------------------------------

test("analyze: garbage AI output → ANALYZE_OUTPUT_INVALID (parse)", () => {
  for (const garbage of [
    "Here is your storyboard! Hope this helps.",
    '{"scenes": []}',
    '{"scenes": [{"heading": "x"}]}',
    "```json\n{not json}\n```",
    "[1,2,3]",
  ]) {
    assert.throws(
      () => parseAnalyzeOutput(garbage),
      (error) => {
        assert.ok(error instanceof StoryboardError);
        assert.equal(error.code, "ANALYZE_OUTPUT_INVALID");
        return true;
      },
      JSON.stringify(garbage),
    );
  }
});

test("analyze: garbage AI output → runAnalyze rejects, never resolves with empty scenes", async () => {
  await assert.rejects(
    runAnalyze(makeDeps("definitely not json"), makeRequest(), { ownerId: "u1" }),
    (error) => {
      assert.equal(error.code, "ANALYZE_OUTPUT_INVALID");
      return true;
    },
  );
});

test("analyze: missing AI fields are reported with paths", () => {
  const raw = JSON.stringify({ scenes: [{ heading: "INT. X - DAY", location: "X", shots: [{ sourceText: "a" }] }] });
  try {
    parseAnalyzeOutput(raw);
    assert.fail("should have thrown");
  } catch (error) {
    assert.equal(error.code, "ANALYZE_OUTPUT_INVALID");
    const paths = error.details.paths;
    assert.ok(paths.some((p) => p.includes("scenes[0].timeOfDay")));
    assert.ok(paths.some((p) => p.includes("scenes[0].sourceText")));
    assert.ok(paths.some((p) => p.includes("scenes[0].shots[0].visualDescription")));
    assert.ok(paths.some((p) => p.includes("scenes[0].shots[0].durationSeconds")));
  }
});

test("analyze: numeric-string durationSeconds is coerced", () => {
  const mock = JSON.parse(readMock("non-standard"));
  mock.scenes[0].shots[0].durationSeconds = "6";
  const output = parseAnalyzeOutput(JSON.stringify(mock));
  assert.equal(output.scenes[0].shots[0].durationSeconds, 6);
});

// ---------------------------------------------------------------------------
// Fixture happy paths
// ---------------------------------------------------------------------------

const FIXTURE_CASES = [
  { name: "cn-short-drama", target: 60, scenes: 3 },
  { name: "es-dialogue", target: 45, scenes: 2 },
  { name: "multi-scene", target: 75, scenes: 5 },
  { name: "multi-character", target: 30, scenes: 1 },
  { name: "non-standard", target: 30, scenes: 2 },
  { name: "key-props", target: 40, scenes: 3 },
];

for (const { name, target, scenes: sceneCount } of FIXTURE_CASES) {
  test(`analyze fixture ${name}: order, durations, ids`, async () => {
    const request = makeRequest({ source: readFixture(name), targetDurationSeconds: target });
    const validated = validateAnalyzeRequest(request);
    assert.equal(validated.ok, true);
    const response = await runAnalyze(makeDeps(readMock(name)), validated.value, { ownerId: "u1" });

    assert.ok(response.analysisId.length > 0);
    assert.equal(response.analysisVersion, 1);
    assert.match(response.sourceHash, /^sha256:[a-f0-9]{64}$/);
    assert.equal(response.revision, request.expectedRevision + 1);

    assert.equal(response.scenes.length, sceneCount);
    let shotTotal = 0;
    response.scenes.forEach((scene, sceneIndex) => {
      assert.equal(scene.order, sceneIndex + 1);
      assert.equal(scene.idSource, "client");
      assert.match(scene.clientId, new RegExp(`^p_scene_${sceneIndex + 1}$`));
      assert.equal(scene.id, undefined, "client scenes must not carry a server id");
      assert.ok(scene.shots.length > 0);
      scene.shots.forEach((shot, shotIndex) => {
        assert.equal(shot.order, shotIndex + 1);
        assert.equal(shot.idSource, "client");
        assert.match(shot.clientId, /^p_shot_\d+_\d+$/);
        assert.equal(typeof shot.durationSeconds, "number");
        assert.ok(Number.isFinite(shot.durationSeconds));
        assert.equal(shot.imagePrompt, "");
        assert.equal(shot.jimengPromptZh, "");
        shotTotal += shot.durationSeconds;
      });
    });
    const deviation = Math.abs(shotTotal - target) / target;
    assert.ok(deviation <= 0.2, `duration sum ${shotTotal} deviates >20% from target ${target}`);

    // Server-assigned asset ids only.
    for (const kind of ["characters", "locations", "props"]) {
      for (const asset of response.assets[kind]) {
        assert.match(asset.assetId, /^p_asset_(character|location|prop)_\d+$/);
        assert.equal(asset.selectedVersionId, null);
        assert.ok(asset.prompt.length > 0, "art prompt built for every asset");
      }
    }
  });
}

test("analyze: model-provided ids never survive (evil ids in mock)", async () => {
  const validated = validateAnalyzeRequest(makeRequest({ source: readFixture("cn-short-drama") }));
  const response = await runAnalyze(makeDeps(readMock("cn-short-drama")), validated.value, { ownerId: "u1" });
  const serialized = JSON.stringify(response);
  assert.ok(!serialized.includes("evil-model-scene-id-1"));
  assert.ok(!serialized.includes("evil-model-shot-id-1"));
  assert.ok(!serialized.includes("evil-model-asset-id-1"));
});

test("analyze: es-dialogue keeps Spanish dialogue verbatim", async () => {
  const validated = validateAnalyzeRequest(
    makeRequest({ source: readFixture("es-dialogue"), targetDurationSeconds: 45, outputLanguage: "zh-CN" }),
  );
  const response = await runAnalyze(makeDeps(readMock("es-dialogue")), validated.value, { ownerId: "u1" });
  const dialogues = response.scenes.flatMap((scene) => scene.shots.map((shot) => shot.dialogue));
  assert.ok(dialogues.includes("¿Dónde estuviste anoche, Isa?"));
  assert.ok(dialogues.includes("No me vigiles. No eres mi marido todavía."));
  assert.ok(dialogues.includes("Ya lo perdimos todo el día que te conocimos."));
});

test("analyze: key-props dedupes 婚戒/手机/合同 exactly once, richest description wins", async () => {
  const validated = validateAnalyzeRequest(makeRequest({ source: readFixture("key-props"), targetDurationSeconds: 40 }));
  const response = await runAnalyze(makeDeps(readMock("key-props")), validated.value, { ownerId: "u1" });

  const propNames = response.assets.props.map((asset) => asset.name);
  assert.equal(propNames.filter((name) => name === "婚戒").length, 1, "婚戒 must appear exactly once");
  assert.ok(propNames.includes("手机"));
  assert.ok(propNames.includes("股权转让合同"));

  const ring = response.assets.props.find((asset) => asset.name === "婚戒");
  // The richer (longer) description from the second occurrence wins.
  assert.ok(ring.description.includes("对戒"), ring.description);
  // Aliases unioned from both occurrences.
  assert.ok(ring.aliases.includes("戒指"));
  assert.ok(ring.aliases.includes("铂金戒指"));
  // Keywords unioned.
  assert.ok(ring.visualKeywords.includes("婚姻象征"));
});

test("analyze: unresolved character name auto-creates a minimal asset", async () => {
  const validated = validateAnalyzeRequest(makeRequest({ source: readFixture("cn-short-drama") }));
  const response = await runAnalyze(makeDeps(readMock("cn-short-drama")), validated.value, { ownerId: "u1" });

  // The mock references 管家 in a shot without listing it in assets.characters.
  const steward = response.assets.characters.find((asset) => asset.name === "管家");
  assert.ok(steward, "auto-created minimal asset for 管家");
  assert.match(steward.assetId, /^p_asset_character_\d+$/);
  assert.equal(steward.selectedVersionId, null);

  // And the shot reference resolves to it (no dangling references).
  const studyScene = response.scenes[1];
  const confrontationShot = studyScene.shots[2];
  assert.ok(confrontationShot.characterAssetIds.includes(steward.assetId));
});

test("analyze: duration normalization scales >20% deviation into range", async () => {
  // Skewed mock: two shots of 20s + 30s (sum 50) against a 100s target.
  const skewed = JSON.stringify({
    scenes: [
      {
        heading: "INT. 房间 - 夜",
        location: "房间",
        timeOfDay: "夜",
        summary: "测试",
        sourceText: "测试原文",
        characters: [],
        props: [],
        shots: [
          { sourceText: "a", storyBeat: "a", visualDescription: "画面a", characters: [], location: null, props: [], shotSize: "中景", cameraMovement: "固定", angle: "平视", durationSeconds: 20, dialogue: "", emotion: "", continuity: "" },
          { sourceText: "b", storyBeat: "b", visualDescription: "画面b", characters: [], location: null, props: [], shotSize: "中景", cameraMovement: "固定", angle: "平视", durationSeconds: 30, dialogue: "", emotion: "", continuity: "" },
        ],
      },
    ],
    assets: { characters: [], locations: [], props: [] },
  });
  const validated = validateAnalyzeRequest(makeRequest({ targetDurationSeconds: 100 }));
  const response = await runAnalyze(makeDeps(skewed), validated.value, { ownerId: "u1" });

  const durations = response.scenes[0].shots.map((shot) => shot.durationSeconds);
  assert.deepEqual(durations, [10, 10], "scaled then clamped into [2,10]");
  for (const duration of durations) {
    assert.ok(duration >= 2 && duration <= 10, "clamped within short-drama shot bounds");
  }
});

test("analyze: same idempotencyKey + source still returns a fresh analysisId (read-only proposal)", async () => {
  const validated = validateAnalyzeRequest(makeRequest({ source: readFixture("non-standard"), targetDurationSeconds: 30 }));
  const deps = makeDeps(readMock("non-standard"));
  const first = await runAnalyze(deps, validated.value, { ownerId: "u1" });
  const second = await runAnalyze(deps, validated.value, { ownerId: "u1" });
  assert.notEqual(first.analysisId, second.analysisId);
  assert.equal(first.sourceHash, second.sourceHash);
});
