import assert from "node:assert/strict";
import test, { after } from "node:test";

import { extractUniverseInboxItems, runCanonCheck } from "../lib/ai/universe.ts";
import { buildActorBasePrompt, mergeActorPromptInput, normalizeActorInput } from "../lib/actors.ts";

const realFetch = globalThis.fetch;
const realKey = process.env.DEEPSEEK_API_KEY;

after(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = realKey;
});

function clearDeepSeekKey() {
  delete process.env.DEEPSEEK_API_KEY;
}

function stubDeepSeekJson(payload) {
  process.env.DEEPSEEK_API_KEY = "test-key";
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: typeof payload === "string" ? payload : JSON.stringify(payload) } }],
      usage: null,
    }),
  });
}

function sampleProject() {
  return {
    id: "proj-1",
    title: "夜色温柔",
    workflowType: "script",
    market: "cn",
    genre: "drama",
    idea: "",
    importedScript: "",
    brief: "女主林晚回到灰色庄园调查母亲死亡真相，逐步揭开身世秘密。",
    characters: "",
    relationshipDiagram: "",
    outline: "",
    chineseScript: "",
    continuationScript: "",
    finalScript: "",
    finalScriptForeign: "",
    finalScriptChinese: "",
    storyboardScript: "",
    storyboardEpisodes: [],
    deliveryPackage: "",
    formatCheck: "",
    novelBrief: "",
    novelBible: "",
    novelCharacters: "",
    novelVolumeOutline: "",
    novelChapters: [],
    novelContinuityNotes: "",
    novelChapterDraft: "",
    seasonNumber: 1,
    characterCards: [
      { name: "林晚", role: "女主", identity: "庄园继承人", goal: "查明母亲死因", secret: "她是被收养的", line: "冷静克制", arc: "从逃避到直面" },
    ],
    storyBible: { lockedCanon: "母亲始终活着，死亡记录是伪造的。", confirmedFacts: "", mainConflict: "身世之谜" },
  };
}

function emptyBundle() {
  return {
    universe: { id: "uni-1", name: "空宇宙", description: "" },
    entities: [],
    relationships: [],
    timeline: [],
    canonFacts: [],
    snapshots: [],
    inbox: [],
    links: [],
    reports: [],
  };
}

test("extract: AI 不可用时返回 degraded:true + 错误信息，fallback 产出明确标注", async () => {
  clearDeepSeekKey();
  const result = await extractUniverseInboxItems({ universeId: "uni-1", project: sampleProject(), userId: "user-1" });

  assert.equal(result.degraded, true);
  assert.equal(result.source, "fallback");
  assert.ok(result.error && result.error.includes("MISSING_DEEPSEEK_API_KEY"), `error 应包含缺失 key 信息，实际: ${result.error}`);
  assert.ok(result.items.length > 0, "degraded 模式仍保留 heuristic 产出");
  for (const item of result.items) {
    assert.equal(item.confidence, 0.3, "fallback 产出置信度必须降为 0.3");
    assert.equal(item.proposed_payload.source, "fallback", "fallback 产出必须标注 source=fallback");
  }
});

test("extract: AI 成功时 degraded:false 且保留 AI 原始置信度", async () => {
  stubDeepSeekJson({
    characters: [{ title: "林晚", summary: "庄园继承人", source_excerpt: "林晚回到庄园", confidence: 0.9 }],
  });
  const result = await extractUniverseInboxItems({ universeId: "uni-1", project: sampleProject(), userId: "user-1" });

  assert.equal(result.degraded, false);
  assert.equal(result.source, "ai");
  assert.equal(result.error, null);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, "林晚");
  assert.equal(result.items[0].confidence, 0.9);
  assert.equal(result.items[0].proposed_payload.source, undefined);
});

test("canon-check: AI 不可用时显式报错，空宇宙不再静默给固定 92 分", async () => {
  clearDeepSeekKey();
  await assert.rejects(
    runCanonCheck({ bundle: emptyBundle(), project: sampleProject(), userId: "user-1" }),
    /CANON_CHECK_AI_UNAVAILABLE: MISSING_DEEPSEEK_API_KEY/,
  );
});

test("canon-check: AI 成功时使用 AI 评分而非固定兜底分", async () => {
  stubDeepSeekJson({ score: 65, issues: [], suggestions: ["保持母亲存活设定"] });
  const report = await runCanonCheck({ bundle: emptyBundle(), project: sampleProject(), userId: "user-1" });

  assert.equal(report.score, 65);
  assert.notEqual(report.score, 92);
  assert.equal(report.universe_id, "uni-1");
  assert.deepEqual(report.issues_json, []);
});

test("generate-prompt: 只传 actorId 时空输入不覆盖已有 prompt 数据", () => {
  const existing = {
    name: "林晚",
    age_range: "25-30",
    gender_expression: "female",
    ethnicity_style: "East Asian",
    face_description: "杏仁眼，清冷气质",
    hair_description: "黑色长直发",
    body_description: "高挑",
    temperament: ["冷静", "克制"],
    playable_roles: ["复仇女主"],
    bio: "灰色庄园继承人",
    visibility: "team",
    team_id: "team-1",
    base_prompt: "existing prompt",
    negative_prompt: "existing negative",
  };

  // bug 根源：直接 normalize 空输入会得到全空字段，合并时覆盖已有数据
  const bare = normalizeActorInput({});
  assert.equal(bare.name, "");
  assert.equal(bare.face_description, "");

  // 合并判空后：空输入保留已有数据，生成的 prompt 不被清空
  const merged = mergeActorPromptInput(existing, {});
  assert.equal(merged.name, "林晚");
  assert.equal(merged.visibility, "team");
  assert.equal(merged.team_id, "team-1");
  assert.deepEqual(merged.temperament, ["冷静", "克制"]);
  assert.equal(merged.base_prompt, "existing prompt");
  const prompt = buildActorBasePrompt(merged);
  assert.match(prompt, /林晚/);
  assert.match(prompt, /杏仁眼，清冷气质/);

  // 非空字段仍然可以覆盖
  const overridden = mergeActorPromptInput(existing, { name: "苏离" });
  assert.equal(overridden.name, "苏离");
  assert.equal(overridden.face_description, "杏仁眼，清冷气质");
});
