/**
 * TRAE-V2-04 AI Director + Scene/Shot Breakdown
 * 纯函数 + AI 调用 mock 契约测试
 *
 * PRD §10.1 单元/契约测试要求：AI 修改先 Preview，再 Apply；锁定 Shot 不被覆盖
 *
 * 验证目标：
 *   1. filterLockedPreviews 过滤已锁定的 scene/shot
 *   2. runDirectorBreakdown 调用 AI → 解析 JSON → 组装 Preview
 *   3. AI 调用失败时抛 DirectorError(PROVIDER_TIMEOUT | AI_CALL_FAILED)
 *   4. AI 输出非法 JSON 时抛 DirectorError(AI_OUTPUT_INVALID)
 *   5. AI 输出缺字段时抛 DirectorError(AI_OUTPUT_INVALID)
 *   6. duration_seconds 被 clamp 到 [2, 10]
 *   7. preview sceneId / shotId 以 preview- 前缀开头（client 临时 ID）
 *   8. DirectorError 携带 code 和 details
 *
 * 运行：node --test tests/v2-director.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  filterLockedPreviews,
  runDirectorBreakdown,
} from "../lib/director/breakdown.ts";
import {
  DirectorError,
  isDirectorError,
} from "../lib/director/types.ts";

// ============================================================
// 测试数据
// ============================================================

const baseRequest = {
  projectId: "proj-1",
  sourceUnitId: "ep-1",
  source: "剧本原文...",
  aspectRatio: "9:16",
  targetDurationSeconds: 60,
  visualStyle: "电影感",
  outputLanguage: "zh-CN",
  mode: "full",
  sceneId: null,
};

const validAiOutput = {
  scenes: [
    {
      heading: "开场",
      location: "咖啡馆",
      time_of_day: "日",
      summary: "主角进入咖啡馆",
      source_text: "原文片段1",
      characters: ["小明"],
      props: ["咖啡杯"],
      scene_function: "建立",
      conflict: "无",
      emotion: "平静",
      value_shift: "无 → 期待",
      blocking: "小明走到吧台",
      source_quote_range: { start: 0, end: 100 },
      shots: [
        {
          source_text: "小明推门进入",
          story_beat: "登场",
          visual_description: "全景，门推开",
          characters: ["小明"],
          location: "咖啡馆门口",
          props: [],
          shot_size: "全景",
          camera_movement: "固定",
          angle: "平视",
          duration_seconds: 5,
          dialogue: "",
          emotion: "平静",
          continuity: "无",
          focal_length: "35mm",
          blocking: "无",
          camera_start: "门外",
          movement_path: "无",
          speed_curve: "匀速",
          parallax: "无",
          focus_change: "无",
          end_frame: "门完全打开",
          transition_interface: "硬切",
          lighting: "自然光",
          color: "暖色调",
          sound_effects: "门铃",
        },
      ],
    },
  ],
};

function makeMockCallAI(output) {
  return async () => typeof output === "string" ? output : JSON.stringify(output);
}

// ============================================================
// 1. filterLockedPreviews
// ============================================================

test("filterLockedPreviews 过滤已锁定的 scene", () => {
  const previews = [
    { sceneId: "s1", shots: [{ shotId: "sh1" }] },
    { sceneId: "s2", shots: [{ shotId: "sh2" }] },
  ];
  const result = filterLockedPreviews(
    previews,
    new Set(["s1"]),
    new Set(),
  );
  assert.equal(result.kept.length, 1);
  assert.equal(result.kept[0].sceneId, "s2");
  assert.equal(result.skipped, 1);
});

test("filterLockedPreviews 过滤已锁定的 shot", () => {
  const previews = [
    {
      sceneId: "s1",
      shots: [
        { shotId: "sh1" },
        { shotId: "sh2" },
        { shotId: "sh3" },
      ],
    },
  ];
  const result = filterLockedPreviews(
    previews,
    new Set(),
    new Set(["sh2"]),
  );
  assert.equal(result.kept.length, 1);
  assert.equal(result.kept[0].shots.length, 2);
  assert.equal(result.skipped, 1);
});

test("filterLockedPreviews 同时过滤 scene 和 shot", () => {
  const previews = [
    { sceneId: "s1", shots: [{ shotId: "sh1" }] },
    { sceneId: "s2", shots: [{ shotId: "sh2" }, { shotId: "sh3" }] },
  ];
  const result = filterLockedPreviews(
    previews,
    new Set(["s1"]),
    new Set(["sh3"]),
  );
  assert.equal(result.kept.length, 1);
  assert.equal(result.kept[0].sceneId, "s2");
  assert.equal(result.kept[0].shots.length, 1);
  assert.equal(result.skipped, 2);
});

test("filterLockedPreviews 无锁定时全部保留", () => {
  const previews = [
    { sceneId: "s1", shots: [{ shotId: "sh1" }] },
    { sceneId: "s2", shots: [{ shotId: "sh2" }] },
  ];
  const result = filterLockedPreviews(previews, new Set(), new Set());
  assert.equal(result.kept.length, 2);
  assert.equal(result.skipped, 0);
});

// ============================================================
// 2. runDirectorBreakdown 正常流程
// ============================================================

test("runDirectorBreakdown 调用 AI 并返回 Preview", async () => {
  const result = await runDirectorBreakdown(
    { callAI: makeMockCallAI(validAiOutput) },
    baseRequest,
    { ownerId: "owner-1" },
  );
  assert.ok(result.analysisId.startsWith("director-"));
  assert.equal(result.scenes.length, 1);
  assert.equal(result.scenes[0].heading, "开场");
  assert.equal(result.scenes[0].location, "咖啡馆");
  assert.equal(result.scenes[0].shots.length, 1);
  assert.equal(result.scenes[0].shots[0].shotSize, "全景");
});

test("runDirectorBreakdown preview sceneId/shotId 以 preview- 前缀开头", async () => {
  const result = await runDirectorBreakdown(
    { callAI: makeMockCallAI(validAiOutput) },
    baseRequest,
    { ownerId: "owner-1" },
  );
  assert.ok(result.scenes[0].sceneId.startsWith("preview-scene-"));
  assert.ok(result.scenes[0].shots[0].shotId.startsWith("preview-shot-"));
});

test("runDirectorBreakdown directorMeta 包含 ai_generated=true", async () => {
  const result = await runDirectorBreakdown(
    { callAI: makeMockCallAI(validAiOutput) },
    baseRequest,
    { ownerId: "owner-1" },
  );
  assert.equal(result.scenes[0].directorMeta.ai_generated, true);
  assert.equal(result.scenes[0].directorMeta.user_confirmed, false);
  assert.equal(result.scenes[0].shots[0].directorMeta.ai_generated, true);
});

test("runDirectorBreakdown 支持 provider 信息回传", async () => {
  const callAI = async () => ({
    output: JSON.stringify(validAiOutput),
    provider: { provider: "deepseek", model: "deepseek-chat", fallbackUsed: false },
  });
  const result = await runDirectorBreakdown(
    { callAI },
    baseRequest,
    { ownerId: "owner-1" },
  );
  assert.ok(result.provider);
  assert.equal(result.provider.provider, "deepseek");
  assert.equal(result.provider.fallbackUsed, false);
});

// ============================================================
// 3. duration_seconds clamp
// ============================================================

test("runDirectorBreakdown duration_seconds 被 clamp 到 [2, 10]", async () => {
  const tooShort = {
    scenes: [{
      ...validAiOutput.scenes[0],
      shots: [{ ...validAiOutput.scenes[0].shots[0], duration_seconds: 0.5 }],
    }],
  };
  const result = await runDirectorBreakdown(
    { callAI: makeMockCallAI(tooShort) },
    baseRequest,
    { ownerId: "owner-1" },
  );
  assert.equal(result.scenes[0].shots[0].durationSeconds, 2);
});

test("runDirectorBreakdown duration_seconds 超过 10 被截断", async () => {
  const tooLong = {
    scenes: [{
      ...validAiOutput.scenes[0],
      shots: [{ ...validAiOutput.scenes[0].shots[0], duration_seconds: 30 }],
    }],
  };
  const result = await runDirectorBreakdown(
    { callAI: makeMockCallAI(tooLong) },
    baseRequest,
    { ownerId: "owner-1" },
  );
  assert.equal(result.scenes[0].shots[0].durationSeconds, 10);
});

// ============================================================
// 4. AI 调用失败
// ============================================================

test("runDirectorBreakdown AI 超时抛 PROVIDER_TIMEOUT", async () => {
  const callAI = async () => { throw new Error("request timeout after 30s"); };
  await assert.rejects(
    () => runDirectorBreakdown({ callAI }, baseRequest, { ownerId: "owner-1" }),
    (err) => {
      assert.ok(err instanceof DirectorError);
      assert.equal(err.code, "PROVIDER_TIMEOUT");
      return true;
    },
  );
});

test("runDirectorBreakdown AI 其他错误抛 AI_CALL_FAILED", async () => {
  const callAI = async () => { throw new Error("connection refused"); };
  await assert.rejects(
    () => runDirectorBreakdown({ callAI }, baseRequest, { ownerId: "owner-1" }),
    (err) => {
      assert.ok(err instanceof DirectorError);
      assert.equal(err.code, "AI_CALL_FAILED");
      return true;
    },
  );
});

test("runDirectorBreakdown AI 返回空输出抛 AI_CALL_FAILED", async () => {
  const callAI = async () => "";
  await assert.rejects(
    () => runDirectorBreakdown({ callAI }, baseRequest, { ownerId: "owner-1" }),
    (err) => {
      assert.ok(err instanceof DirectorError);
      assert.equal(err.code, "AI_CALL_FAILED");
      return true;
    },
  );
});

test("runDirectorBreakdown AI 返回纯空白抛 AI_CALL_FAILED", async () => {
  const callAI = async () => "   \n  ";
  await assert.rejects(
    () => runDirectorBreakdown({ callAI }, baseRequest, { ownerId: "owner-1" }),
    (err) => {
      assert.ok(err instanceof DirectorError);
      assert.equal(err.code, "AI_CALL_FAILED");
      return true;
    },
  );
});

// ============================================================
// 5. AI 输出非法
// ============================================================

test("runDirectorBreakdown AI 返回非 JSON 抛 AI_OUTPUT_INVALID", async () => {
  const callAI = async () => "不是 JSON 的字符串";
  await assert.rejects(
    () => runDirectorBreakdown({ callAI }, baseRequest, { ownerId: "owner-1" }),
    (err) => {
      assert.ok(err instanceof DirectorError);
      assert.equal(err.code, "AI_OUTPUT_INVALID");
      return true;
    },
  );
});

test("runDirectorBreakdown AI 输出缺少 scenes 数组抛 AI_OUTPUT_INVALID", async () => {
  const callAI = async () => JSON.stringify({ foo: "bar" });
  await assert.rejects(
    () => runDirectorBreakdown({ callAI }, baseRequest, { ownerId: "owner-1" }),
    (err) => {
      assert.ok(err instanceof DirectorError);
      assert.equal(err.code, "AI_OUTPUT_INVALID");
      return true;
    },
  );
});

test("runDirectorBreakdown Scene 缺少 heading 抛 AI_OUTPUT_INVALID", async () => {
  const invalid = {
    scenes: [{ ...validAiOutput.scenes[0], heading: undefined }],
  };
  const callAI = async () => JSON.stringify(invalid);
  await assert.rejects(
    () => runDirectorBreakdown({ callAI }, baseRequest, { ownerId: "owner-1" }),
    (err) => {
      assert.ok(err instanceof DirectorError);
      assert.equal(err.code, "AI_OUTPUT_INVALID");
      return true;
    },
  );
});

test("runDirectorBreakdown Scene 缺少 shots 数组抛 AI_OUTPUT_INVALID", async () => {
  const invalid = {
    scenes: [{ ...validAiOutput.scenes[0], shots: undefined }],
  };
  const callAI = async () => JSON.stringify(invalid);
  await assert.rejects(
    () => runDirectorBreakdown({ callAI }, baseRequest, { ownerId: "owner-1" }),
    (err) => {
      assert.ok(err instanceof DirectorError);
      assert.equal(err.code, "AI_OUTPUT_INVALID");
      return true;
    },
  );
});

// ============================================================
// 6. DirectorError 与 isDirectorError
// ============================================================

test("DirectorError 携带 code 和 details", () => {
  const err = new DirectorError("INVALID_INPUT", "无效输入", { field: "source" });
  assert.equal(err.name, "DirectorError");
  assert.equal(err.code, "INVALID_INPUT");
  assert.equal(err.message, "无效输入");
  assert.deepEqual(err.details, { field: "source" });
  assert.ok(err instanceof Error);
});

test("isDirectorError 识别 DirectorError", () => {
  assert.ok(isDirectorError(new DirectorError("INVALID_INPUT", "x")));
  assert.ok(!isDirectorError(new Error("普通")));
  assert.ok(!isDirectorError(null));
  assert.ok(!isDirectorError("string"));
});

// ============================================================
// 7. 多 scene 多 shot
// ============================================================

test("runDirectorBreakdown 支持多 scene 多 shot", async () => {
  const multi = {
    scenes: [
      validAiOutput.scenes[0],
      {
        ...validAiOutput.scenes[0],
        heading: "第二场",
        shots: [
          validAiOutput.scenes[0].shots[0],
          { ...validAiOutput.scenes[0].shots[0], story_beat: "第二镜" },
        ],
      },
    ],
  };
  const result = await runDirectorBreakdown(
    { callAI: makeMockCallAI(multi) },
    baseRequest,
    { ownerId: "owner-1" },
  );
  assert.equal(result.scenes.length, 2);
  assert.equal(result.scenes[1].shots.length, 2);
});

console.log("✅ V2-04 AI Director 契约测试完成");
