/**
 * TRAE-V2-05 Video Model Gateway V1
 * Catalog + 类型 + 错误契约测试
 *
 * PRD §10.1 单元/契约测试要求：Job 幂等、Provider 不可用显式禁用
 *
 * 验证目标：
 *   1. PROVIDER_CATALOG 包含 atlas/minimax/runway/seedance 四个 provider
 *   2. runway / seedance 可用性根据 env 动态计算（已从 stub 升级为真实实现）
 *   3. getProviderEntry 未知 provider 返回 null
 *   4. getProviderCatalog 不暴露 API Key / Secret / 内部端点
 *   5. VideoGatewayError 携带 code 和 details
 *   6. isVideoGatewayError 类型守卫
 *   7. AUTO_ROUTE_ORDER 顺序：atlas → minimax → seedance → runway
 *   8. atlas / minimax / runway / seedance 可用性根据 env 动态计算
 *
 * 运行：node --test tests/v2-video-gateway.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  PROVIDER_CATALOG,
  getProviderCatalog,
  getProviderEntry,
  AUTO_ROUTE_ORDER,
} from "../lib/video-gateway/catalog.ts";
import {
  VideoGatewayError,
  isVideoGatewayError,
} from "../lib/video-gateway/types.ts";

// ============================================================
// 1. PROVIDER_CATALOG 静态结构
// ============================================================

test("PROVIDER_CATALOG 包含四个 provider", () => {
  const names = PROVIDER_CATALOG.map((p) => p.name);
  assert.ok(names.includes("atlas"));
  assert.ok(names.includes("minimax"));
  assert.ok(names.includes("runway"));
  assert.ok(names.includes("seedance"));
  assert.equal(names.length, 4);
});

test("每个 catalog entry 都有必需字段", () => {
  for (const entry of PROVIDER_CATALOG) {
    assert.ok(typeof entry.name === "string" && entry.name.length > 0);
    assert.ok(typeof entry.displayName === "string" && entry.displayName.length > 0);
    assert.ok(typeof entry.description === "string");
    assert.ok(Array.isArray(entry.capabilities));
    assert.ok(typeof entry.available === "boolean");
    assert.ok(typeof entry.defaultModel === "string" && entry.defaultModel.length > 0);
    assert.ok(Array.isArray(entry.tags));
  }
});

test("runway catalog entry 默认模型为 gen4_turbo", () => {
  const entry = getProviderEntry("runway");
  assert.ok(entry);
  assert.equal(entry.defaultModel, "gen4_turbo");
});

test("seedance catalog entry 默认模型为 doubao-seedance-2-0-260128", () => {
  const entry = getProviderEntry("seedance");
  assert.ok(entry);
  assert.equal(entry.defaultModel, "doubao-seedance-2-0-260128");
});

// ============================================================
// 2. runway / seedance 可用性根据 env（已升级为真实实现）
// ============================================================

test("runway 可用性取决于 RUNWAY_API_KEY", () => {
  const saved = process.env.RUNWAY_API_KEY;
  try {
    delete process.env.RUNWAY_API_KEY;
    const entry = getProviderEntry("runway");
    assert.equal(entry.available, false);
    process.env.RUNWAY_API_KEY = "test-key";
    const entry2 = getProviderEntry("runway");
    assert.equal(entry2.available, true);
    assert.equal(entry2.unavailableReason, undefined);
  } finally {
    if (saved === undefined) delete process.env.RUNWAY_API_KEY;
    else process.env.RUNWAY_API_KEY = saved;
  }
});

test("seedance 可用性取决于 ARK_API_KEY 或 VOLC_ARK_API_KEY", () => {
  const savedArk = process.env.ARK_API_KEY;
  const savedVolc = process.env.VOLC_ARK_API_KEY;
  try {
    delete process.env.ARK_API_KEY;
    delete process.env.VOLC_ARK_API_KEY;
    assert.equal(getProviderEntry("seedance").available, false);

    process.env.ARK_API_KEY = "test-key";
    assert.equal(getProviderEntry("seedance").available, true);

    delete process.env.ARK_API_KEY;
    process.env.VOLC_ARK_API_KEY = "test-key";
    assert.equal(getProviderEntry("seedance").available, true);
  } finally {
    if (savedArk === undefined) delete process.env.ARK_API_KEY;
    else process.env.ARK_API_KEY = savedArk;
    if (savedVolc === undefined) delete process.env.VOLC_ARK_API_KEY;
    else process.env.VOLC_ARK_API_KEY = savedVolc;
  }
});

// ============================================================
// 3. 未知 provider
// ============================================================

test("getProviderEntry 未知 provider 返回 null", () => {
  // 任意非四者之一的字符串
  assert.equal(getProviderEntry("kling"), null);
  assert.equal(getProviderEntry("veo"), null);
  assert.equal(getProviderEntry(""), null);
});

// ============================================================
// 4. 不暴露敏感信息
// ============================================================

test("getProviderCatalog 不暴露 API Key / Secret / 端点", () => {
  const catalog = getProviderCatalog();
  const serialized = JSON.stringify(catalog);
  // 不应包含任何敏感字段
  assert.ok(!serialized.toLowerCase().includes("apikey"));
  assert.ok(!serialized.toLowerCase().includes("api_key"));
  assert.ok(!serialized.toLowerCase().includes("secret"));
  assert.ok(!serialized.toLowerCase().includes("bearer"));
  assert.ok(!serialized.toLowerCase().includes("authorization"));
  // 不应包含完整 URL（端点）
  assert.ok(!/https?:\/\/[^"]+/.test(serialized), "catalog 不应暴露完整 URL 端点");
});

test("catalog entry 不包含 raw config 字段", () => {
  for (const entry of PROVIDER_CATALOG) {
    assert.equal(entry.apiKey, undefined);
    assert.equal(entry.api_key, undefined);
    assert.equal(entry.secret, undefined);
    assert.equal(entry.endpoint, undefined);
    assert.equal(entry.baseUrl, undefined);
  }
});

// ============================================================
// 5. AUTO_ROUTE_ORDER
// ============================================================

test("AUTO_ROUTE_ORDER 顺序为 atlas → minimax → seedance → runway", () => {
  assert.deepEqual(AUTO_ROUTE_ORDER, ["atlas", "minimax", "seedance", "runway"]);
});

test("AUTO_ROUTE_ORDER 覆盖所有 provider", () => {
  const catalogNames = new Set(PROVIDER_CATALOG.map((p) => p.name));
  for (const name of AUTO_ROUTE_ORDER) {
    assert.ok(catalogNames.has(name), `AUTO_ROUTE_ORDER 中的 ${name} 应在 catalog 中`);
  }
});

// ============================================================
// 6. VideoGatewayError
// ============================================================

test("VideoGatewayError 携带 code 和 message", () => {
  const err = new VideoGatewayError("PROVIDER_UNAVAILABLE", "Provider 不可用");
  assert.equal(err.name, "VideoGatewayError");
  assert.equal(err.code, "PROVIDER_UNAVAILABLE");
  assert.equal(err.message, "Provider 不可用");
  assert.equal(err.details, undefined);
  assert.ok(err instanceof Error);
});

test("VideoGatewayError 携带 details", () => {
  const err = new VideoGatewayError(
    "PROVIDER_CALL_FAILED",
    "调用失败",
    { provider: "atlas", statusCode: 500 },
  );
  assert.equal(err.code, "PROVIDER_CALL_FAILED");
  assert.deepEqual(err.details, { provider: "atlas", statusCode: 500 });
});

test("isVideoGatewayError 识别 VideoGatewayError", () => {
  const err = new VideoGatewayError("INVALID_INPUT", "无效");
  assert.ok(isVideoGatewayError(err));
});

test("isVideoGatewayError 拒绝普通 Error", () => {
  const err = new Error("普通错误");
  assert.ok(!isVideoGatewayError(err));
});

test("isVideoGatewayError 拒绝非 Error 值", () => {
  assert.ok(!isVideoGatewayError("string"));
  assert.ok(!isVideoGatewayError(null));
  assert.ok(!isVideoGatewayError(undefined));
  assert.ok(!isVideoGatewayError(42));
});

// ============================================================
// 7. 各 provider 可用性根据 env 动态计算
// ============================================================

test("atlas 可用性取决于 ATLASCLOUD_API_KEY", () => {
  const saved = process.env.ATLASCLOUD_API_KEY;
  try {
    delete process.env.ATLASCLOUD_API_KEY;
    assert.equal(getProviderEntry("atlas").available, false);
    process.env.ATLASCLOUD_API_KEY = "test-key";
    assert.equal(getProviderEntry("atlas").available, true);
  } finally {
    if (saved === undefined) delete process.env.ATLASCLOUD_API_KEY;
    else process.env.ATLASCLOUD_API_KEY = saved;
  }
});

test("minimax 可用性取决于 MINIMAX_* 环境变量之一", () => {
  const savedKey = process.env.MINIMAX_API_KEY;
  const savedVideo = process.env.MINIMAX_VIDEO_API_KEY;
  const savedToken = process.env.MINIMAX_TOKEN;
  try {
    delete process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_VIDEO_API_KEY;
    delete process.env.MINIMAX_TOKEN;
    assert.equal(getProviderEntry("minimax").available, false);
    process.env.MINIMAX_API_KEY = "test";
    assert.equal(getProviderEntry("minimax").available, true);
    delete process.env.MINIMAX_API_KEY;
    process.env.MINIMAX_VIDEO_API_KEY = "test";
    assert.equal(getProviderEntry("minimax").available, true);
    delete process.env.MINIMAX_VIDEO_API_KEY;
    process.env.MINIMAX_TOKEN = "test";
    assert.equal(getProviderEntry("minimax").available, true);
  } finally {
    if (savedKey === undefined) delete process.env.MINIMAX_API_KEY;
    else process.env.MINIMAX_API_KEY = savedKey;
    if (savedVideo === undefined) delete process.env.MINIMAX_VIDEO_API_KEY;
    else process.env.MINIMAX_VIDEO_API_KEY = savedVideo;
    if (savedToken === undefined) delete process.env.MINIMAX_TOKEN;
    else process.env.MINIMAX_TOKEN = savedToken;
  }
});

// ============================================================
// 8. getProviderCatalog 返回副本（不污染静态 catalog）
// ============================================================

test("getProviderCatalog 返回副本，不修改静态 PROVIDER_CATALOG", () => {
  const originalAvailable = PROVIDER_CATALOG[0].available;
  const catalog = getProviderCatalog();
  catalog[0].available = !catalog[0].available;
  assert.equal(PROVIDER_CATALOG[0].available, originalAvailable, "静态 catalog 不应被修改");
});

console.log("✅ V2-05 Video Gateway 契约测试完成");
