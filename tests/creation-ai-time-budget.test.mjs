import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { callRoutedProvider, getProviderStatus } from "../lib/ai/providers/index.ts";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const ATLAS_URL = "https://api.atlascloud.ai/v1/chat/completions";

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("角色圣经主模型与备用模型共用 300 秒级总预算", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timeoutBudgets = [];

  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  process.env.DEEPSEEK_MODEL = "deepseek-v4-pro";
  process.env.ATLASCLOUD_API_KEY = "test-atlas-key";
  process.env.ATLASCLOUD_LLM_BASE_URL = "https://api.atlascloud.ai/v1";
  process.env.ATLASCLOUD_LLM_MODEL = "anthropic/claude-sonnet-4.6";

  globalThis.setTimeout = (_callback, timeoutMs) => {
    timeoutBudgets.push(timeoutMs);
    return timeoutBudgets.length;
  };
  globalThis.clearTimeout = () => {};
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    if (url === DEEPSEEK_URL) {
      return response(503, { error: { message: "primary unavailable" } });
    }
    if (url === ATLAS_URL) {
      return response(200, {
        choices: [{ message: { content: "# Character Bible" } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const result = await callRoutedProvider({
      taskType: "creation_character_bible",
      messages: [{ role: "user", content: "生成角色圣经" }],
    });

    assert.equal(result.provider, "atlas");
    assert.equal(timeoutBudgets.length, 2);
    assert.ok(timeoutBudgets[0] >= 290_000, "主模型至少应获得 290 秒");
    assert.ok(timeoutBudgets[1] >= 10_000, "备用模型至少应获得 10 秒");
    assert.ok(
      timeoutBudgets[0] + timeoutBudgets[1] <= 300_000,
      `Provider 总预算必须控制在 300 秒内，实际为 ${timeoutBudgets.join(" + ")}`,
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("AI 生成路由记录开始、成功和失败事件但不记录创作内容", async () => {
  const routeSource = await readFile(
    new URL("../app/api/ai/generate/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(routeSource, /event:\s*"ai_generate_start"/);
  assert.match(routeSource, /event:\s*"ai_generate_success"/);
  assert.match(routeSource, /event:\s*"ai_generate_failure"/);
  assert.match(routeSource, /request\.headers\.get\("x-vercel-id"\)/);
  assert.doesNotMatch(routeSource, /console\.(?:info|error)\([^)]*\b(?:input|context|messages)\b/s);
});

test("Provider 状态与警告不暴露误填在模型变量中的 API Key", () => {
  const previousModel = process.env.DEEPSEEK_MODEL;
  const exposedValue = "sk-test-secret-must-not-appear";
  const warnings = [];
  const originalWarn = console.warn;
  process.env.DEEPSEEK_MODEL = exposedValue;
  console.warn = (...args) => warnings.push(args.join(" "));

  try {
    const status = getProviderStatus();
    assert.equal(status.deepseek.model, "deepseek-v4-pro");
    assert.doesNotMatch(JSON.stringify(status), new RegExp(exposedValue));
    assert.doesNotMatch(warnings.join("\n"), new RegExp(exposedValue));
  } finally {
    console.warn = originalWarn;
    if (previousModel === undefined) delete process.env.DEEPSEEK_MODEL;
    else process.env.DEEPSEEK_MODEL = previousModel;
  }
});
