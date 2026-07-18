/**
 * storyboard-ai-routing tests — PRD v1.0 §5 (TRAE-PW-P0-001)
 *
 * 验证 storyboard_script 分析的 Provider chain：
 *   DeepSeek primary → Atlas Cloud Gemini fallback (仅一次) → 显式失败
 *
 * 核心断言：
 *   1. DeepSeek 成功时只调用 DeepSeek，fallbackUsed=false；
 *   2. DeepSeek 429/5xx/超时/空输出 → fallback 到 Atlas Gemini（fallbackUsed=true）；
 *   3. MiniMax 在 storyboard_script 链路零调用；
 *   4. DeepSeek 4xx 输入错误不触发 fallback；
 *   5. 两者都失败时抛 AI_CALL_FAILED（502），不返回空 Scene/Shot；
 *   6. Atlas 返回内容但仍无法通过 Schema 时 → ANALYZE_OUTPUT_INVALID (422)。
 *
 * 运行：node --test tests/storyboard-ai-routing.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import { callRoutedProvider } from "../lib/ai/providers/index.ts";

// ===== 测试工具 =====

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const ATLAS_URL = "https://api.atlascloud.ai/v1/chat/completions";

/** 记录所有 fetch 调用的 URL，用于验证 MiniMax 零调用。 */
let fetchLog = [];

function setupEnv() {
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  process.env.DEEPSEEK_MODEL = "deepseek-chat";
  process.env.ATLASCLOUD_API_KEY = "test-atlas-key";
  process.env.ATLASCLOUD_LLM_BASE_URL = "https://api.atlascloud.ai/v1";
  process.env.ATLASCLOUD_LLM_MODEL = "gemini-2.5-flash";
  // 确保没有 MiniMax key（即便有，storyboard chain 也不该走 MiniMax）
  delete process.env.MINIMAX_API_KEY;
  delete process.env.MINIMAX_TOKEN;
  delete process.env.MINIMAX_APIKEY;
}

function mockFetch(responses) {
  fetchLog = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    fetchLog.push(url);
    const handler = responses[url];
    if (!handler) {
      // 默认返回 404，帮助发现未 mock 的调用
      return new Response(JSON.stringify({ error: { message: "not mocked" } }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return handler(init);
  };
}

function chatResponse(content, model = "test-model") {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
      model,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function errorResponse(status, message) {
  return new Response(
    JSON.stringify({ error: { message } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

const MESSAGES = [
  { role: "system", content: "你是分镜师" },
  { role: "user", content: "分析这个剧本" },
];

// ===== 测试用例 =====

test("DeepSeek 成功时只调用 DeepSeek，fallbackUsed=false", async () => {
  setupEnv();
  mockFetch({
    [DEEPSEEK_URL]: () => chatResponse("deepseek-output", "deepseek-chat"),
    [ATLAS_URL]: () => chatResponse("atlas-output", "gemini-2.5-flash"),
  });

  const result = await callRoutedProvider({
    taskType: "storyboard_script",
    messages: MESSAGES,
    temperature: 0.2,
  });

  assert.equal(result.provider, "deepseek");
  assert.equal(result.output, "deepseek-output");
  assert.equal(result.fallbackUsed, false);
  // 只调用了 DeepSeek，没调 Atlas
  assert.equal(fetchLog.length, 1);
  assert.ok(fetchLog[0].includes("deepseek.com"));
});

test("DeepSeek 429 时 fallback 一次到 Atlas Gemini", async () => {
  setupEnv();
  mockFetch({
    [DEEPSEEK_URL]: () => errorResponse(429, "rate limited"),
    [ATLAS_URL]: () => chatResponse("atlas-fallback-output", "gemini-2.5-flash"),
  });

  const result = await callRoutedProvider({
    taskType: "storyboard_script",
    messages: MESSAGES,
    temperature: 0.2,
  });

  assert.equal(result.provider, "atlas");
  assert.equal(result.output, "atlas-fallback-output");
  assert.equal(result.fallbackUsed, true);
  // 调用了 DeepSeek 一次 + Atlas 一次
  assert.equal(fetchLog.length, 2);
  assert.ok(fetchLog[0].includes("deepseek.com"));
  assert.ok(fetchLog[1].includes("atlascloud.ai"));
});

test("DeepSeek 5xx 时 fallback 到 Atlas Gemini", async () => {
  setupEnv();
  mockFetch({
    [DEEPSEEK_URL]: () => errorResponse(503, "service unavailable"),
    [ATLAS_URL]: () => chatResponse("atlas-output", "gemini-2.5-flash"),
  });

  const result = await callRoutedProvider({
    taskType: "storyboard_script",
    messages: MESSAGES,
  });

  assert.equal(result.provider, "atlas");
  assert.equal(result.fallbackUsed, true);
});

test("DeepSeek 空输出时 fallback 到 Atlas Gemini", async () => {
  setupEnv();
  mockFetch({
    [DEEPSEEK_URL]: () => chatResponse("", "deepseek-chat"),
    [ATLAS_URL]: () => chatResponse("atlas-output", "gemini-2.5-flash"),
  });

  const result = await callRoutedProvider({
    taskType: "storyboard_script",
    messages: MESSAGES,
  });

  assert.equal(result.provider, "atlas");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.output, "atlas-output");
});

test("DeepSeek 返回不合格 JSON 时由任务校验器触发 Atlas fallback", async () => {
  setupEnv();
  mockFetch({
    [DEEPSEEK_URL]: () => chatResponse("not-json", "deepseek-chat"),
    [ATLAS_URL]: () => chatResponse('{"scenes":[]}', "gemini-2.5-flash"),
  });

  const result = await callRoutedProvider({
    taskType: "storyboard_script",
    messages: MESSAGES,
    validateOutput(output) {
      JSON.parse(output);
    },
  });

  assert.equal(result.provider, "atlas");
  assert.equal(result.fallbackUsed, true);
  assert.equal(fetchLog.length, 2);
});

test("DeepSeek 与 Atlas 输出都不合格时显式抛出校验错误", async () => {
  setupEnv();
  mockFetch({
    [DEEPSEEK_URL]: () => chatResponse("deepseek-invalid", "deepseek-chat"),
    [ATLAS_URL]: () => chatResponse("atlas-invalid", "gemini-2.5-flash"),
  });

  await assert.rejects(
    () => callRoutedProvider({
      taskType: "storyboard_script",
      messages: MESSAGES,
      validateOutput() {
        throw new Error("ANALYZE_OUTPUT_INVALID");
      },
    }),
    /ANALYZE_OUTPUT_INVALID/,
  );
  assert.equal(fetchLog.length, 2);
});

test("DeepSeek 4xx 输入错误不触发 fallback（直接抛错）", async () => {
  setupEnv();
  mockFetch({
    [DEEPSEEK_URL]: () => errorResponse(400, "bad request"),
    [ATLAS_URL]: () => chatResponse("atlas-output", "gemini-2.5-flash"),
  });

  await assert.rejects(
    () => callRoutedProvider({ taskType: "storyboard_script", messages: MESSAGES }),
    (error) => {
      assert.ok(error.message.includes("DEEPSEEK_API_ERROR:400"), `got: ${error.message}`);
      return true;
    },
  );
  // 不该调用 Atlas
  assert.equal(fetchLog.length, 1);
  assert.ok(fetchLog[0].includes("deepseek.com"));
});

test("DeepSeek 和 Atlas 都失败时抛错（不返回空输出）", async () => {
  setupEnv();
  mockFetch({
    [DEEPSEEK_URL]: () => errorResponse(500, "deepseek down"),
    [ATLAS_URL]: () => errorResponse(503, "atlas down"),
  });

  await assert.rejects(
    () => callRoutedProvider({ taskType: "storyboard_script", messages: MESSAGES }),
    (error) => {
      // Atlas 失败的错误冒泡上来
      assert.ok(error.message.includes("ATLAS_LLM"), `got: ${error.message}`);
      return true;
    },
  );
  assert.equal(fetchLog.length, 2);
});

test("Atlas 未配置时 DeepSeek 失败直接抛 DeepSeek 错误", async () => {
  setupEnv();
  delete process.env.ATLASCLOUD_LLM_MODEL;
  mockFetch({
    [DEEPSEEK_URL]: () => errorResponse(500, "deepseek down"),
  });

  await assert.rejects(
    () => callRoutedProvider({ taskType: "storyboard_script", messages: MESSAGES }),
    (error) => {
      assert.ok(error.message.includes("DEEPSEEK"), `got: ${error.message}`);
      return true;
    },
  );
  // 不该调用 Atlas（未配置）
  assert.equal(fetchLog.length, 1);
});

test("MiniMax 在 storyboard_script 链路零调用（即使配置了 MiniMax key）", async () => {
  setupEnv();
  // 故意配置 MiniMax key，验证 storyboard chain 仍不调用它
  process.env.MINIMAX_API_KEY = "test-minimax-key";
  process.env.AI_PROVIDER = "hybrid";
  mockFetch({
    [DEEPSEEK_URL]: () => chatResponse("deepseek-output", "deepseek-chat"),
    [ATLAS_URL]: () => chatResponse("atlas-output", "gemini-2.5-flash"),
  });

  await callRoutedProvider({
    taskType: "storyboard_script",
    messages: MESSAGES,
  });

  // 没有任何 fetch 指向 MiniMax 域名
  for (const url of fetchLog) {
    assert.ok(!url.includes("minimax"), `MiniMax 不该被调用: ${url}`);
  }
});

test("DeepSeek 缺 key 时直接 fallback 到 Atlas（不抛 MISSING_DEEPSEEK_API_KEY）", async () => {
  setupEnv();
  delete process.env.DEEPSEEK_API_KEY;
  mockFetch({
    [ATLAS_URL]: () => chatResponse("atlas-output", "gemini-2.5-flash"),
  });

  const result = await callRoutedProvider({
    taskType: "storyboard_script",
    messages: MESSAGES,
  });

  assert.equal(result.provider, "atlas");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.output, "atlas-output");
});

test("非 storyboard_script 任务仍走原 hybrid router（不受窄链影响）", async () => {
  setupEnv();
  process.env.MINIMAX_API_KEY = "test-minimax-key";
  // 用一个非 storyboard、非 novel、非 creation 的 taskType
  // 在 hybrid 模式下应走 MiniMax
  mockFetch({
    [DEEPSEEK_URL]: () => chatResponse("deepseek-output", "deepseek-chat"),
    [ATLAS_URL]: () => chatResponse("atlas-output", "gemini-2.5-flash"),
  });

  // 用 "quality_evaluation"（在 deepSeekPreferredTasks 里）验证非 storyboard 任务仍走 DeepSeek
  const result = await callRoutedProvider({
    taskType: "quality_evaluation",
    messages: MESSAGES,
  });
  assert.equal(result.provider, "deepseek");
  assert.equal(result.fallbackUsed, undefined); // 非 storyboard chain 没有 fallbackUsed
});

test("DeepSeek 网络错误时 fallback 到 Atlas", async () => {
  setupEnv();
  mockFetch({
    [DEEPSEEK_URL]: () => {
      throw new Error("network error");
    },
    [ATLAS_URL]: () => chatResponse("atlas-output", "gemini-2.5-flash"),
  });

  const result = await callRoutedProvider({
    taskType: "storyboard_script",
    messages: MESSAGES,
  });

  assert.equal(result.provider, "atlas");
  assert.equal(result.fallbackUsed, true);
});

test("DeepSeek 超时时 fallback 到 Atlas", async () => {
  setupEnv();
  mockFetch({
    [DEEPSEEK_URL]: () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    },
    [ATLAS_URL]: () => chatResponse("atlas-output", "gemini-2.5-flash"),
  });

  const result = await callRoutedProvider({
    taskType: "storyboard_script",
    messages: MESSAGES,
  });

  assert.equal(result.provider, "atlas");
  assert.equal(result.fallbackUsed, true);
});

test("fallback 仅执行一次（Atlas 失败不二次回 DeepSeek）", async () => {
  setupEnv();
  let deepseekCallCount = 0;
  let atlasCallCount = 0;
  mockFetch({
    [DEEPSEEK_URL]: () => {
      deepseekCallCount++;
      return errorResponse(500, "deepseek down");
    },
    [ATLAS_URL]: () => {
      atlasCallCount++;
      return errorResponse(503, "atlas down");
    },
  });

  await assert.rejects(
    () => callRoutedProvider({ taskType: "storyboard_script", messages: MESSAGES }),
  );

  // DeepSeek 只调用 1 次，Atlas 只调用 1 次（不二次回 DeepSeek）
  assert.equal(deepseekCallCount, 1);
  assert.equal(atlasCallCount, 1);
});


// ============================================================================
// KIIKIS-TR-ACTOR-P0-011: Vercel 环境变量 DEEPSEEK_MODEL 被锁定为不存在的旧值
// （deepseek-v4-flash）时，代码层应自动回退到 deepseek-chat，避免 400 Model Not Exist
// 直接测试 callDeepSeek，绕过 router，纯粹验证模型名回退逻辑
// ============================================================================
import { callDeepSeek } from "../lib/ai/providers/deepseek.ts";

test("DEEPSEEK_MODEL 被锁定为不存在的 deepseek-v4-flash 时自动回退到 deepseek-chat", async () => {
  setupEnv();
  // 模拟 Vercel 锁定场景：DEEPSEEK_MODEL 被设为不存在的旧值
  process.env.DEEPSEEK_MODEL = "deepseek-v4-flash";

  let capturedModel = null;
  mockFetch({
    [DEEPSEEK_URL]: (init) => {
      const body = JSON.parse(init.body);
      capturedModel = body.model;
      return chatResponse("deepseek-output", body.model);
    },
  });

  const result = await callDeepSeek({ messages: MESSAGES });

  // 验证：实际发给 DeepSeek 的 model 是 deepseek-chat（不是 deepseek-v4-flash）
  assert.equal(capturedModel, "deepseek-chat");
  assert.equal(result.output, "deepseek-output");
});

test("DEEPSEEK_MODEL 设为合法值（如 deepseek-reasoner）时不被回退", async () => {
  setupEnv();
  process.env.DEEPSEEK_MODEL = "deepseek-reasoner";

  let capturedModel = null;
  mockFetch({
    [DEEPSEEK_URL]: (init) => {
      const body = JSON.parse(init.body);
      capturedModel = body.model;
      return chatResponse("deepseek-output", body.model);
    },
  });

  const result = await callDeepSeek({ messages: MESSAGES });

  // 验证：合法模型名透传，不被回退
  assert.equal(capturedModel, "deepseek-reasoner");
  assert.equal(result.output, "deepseek-output");
});
