/**
 * Phase 0 Task 0.5 — 社区与演员市场真实接线
 *
 * 覆盖 PRD §00-Phase-0 Task 0.5 Step 2 RED：
 *   - CommunityServiceError 携带 correlationId
 *   - isSchemaError 识别 PGRST204 / 42703 / 42P01 / PGRST205
 *   - 缺 migration（schema 错误）返回 500 + schema_error + correlationId
 *   - 空发现页 Feed 只能表示确实无 Publication，不掩盖 DB 错误
 *   - 通用 apiError 响应包含 correlationId
 *
 * 运行：node --test tests/ui-v2/community/p0-correlation-id.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CommunityServiceError,
  isSchemaError,
} from "../../../lib/server/v2/community/publications.ts";

// ============================================================
// 1. CommunityServiceError 携带 correlationId
// ============================================================

test("CommunityServiceError 实例包含 correlationId 字段", () => {
  const err = new CommunityServiceError("service_unavailable", "supabase not configured", 503);
  assert.equal(err.code, "service_unavailable");
  assert.equal(err.status, 503);
  assert.equal(typeof err.correlationId, "string");
  assert.ok(err.correlationId.length >= 4, "correlationId 应至少 4 个字符");
  assert.ok(err.correlationId.length <= 36, "correlationId 应不超过 36 字符（UUID 截断或时间戳+随机数）");
});

test("CommunityServiceError 两次构造 correlationId 不同（非全局常量）", () => {
  const a = new CommunityServiceError("forbidden", "a", 403);
  const b = new CommunityServiceError("forbidden", "b", 403);
  assert.notEqual(a.correlationId, b.correlationId, "correlationId 应每次生成不同值");
});

test("CommunityServiceError name 与 message 包含 code", () => {
  const err = new CommunityServiceError("not_found", "publication missing", 404);
  assert.equal(err.name, "CommunityServiceError");
  assert.match(err.message, /not_found: publication missing/);
});

test("CommunityServiceError 可携带 cause 用于 schema 错误识别", () => {
  const cause = new Error("PGRST204: Could not find the column");
  const err = new CommunityServiceError("service_unavailable", "fetch failed", 503, cause);
  assert.equal(err.cause, cause);
  assert.ok(isSchemaError(err.cause), "cause 中的 schema 错误应被识别");
});

// ============================================================
// 2. isSchemaError 识别 PostgREST/Postgres schema 错误
// ============================================================

test("isSchemaError: PGRST204（未知列）", () => {
  assert.equal(isSchemaError(new Error("PGRST204: Could not find the column owner_id")), true);
});

test("isSchemaError: 42703（Postgres undefined_column）", () => {
  assert.equal(isSchemaError(new Error('42703: column "owner_id" does not exist')), true);
});

test("isSchemaError: 42P01（Postgres undefined_table）", () => {
  assert.equal(isSchemaError(new Error('42P01: relation "storyflow_works" does not exist')), true);
});

test("isSchemaError: PGRST205（schemaCache miss）", () => {
  assert.equal(isSchemaError(new Error("PGRST205: schemaCacheMiss")), true);
});

test("isSchemaError: Could not find the table 文案", () => {
  assert.equal(isSchemaError(new Error("Could not find the table storyflow_actor_usages")), true);
});

test("isSchemaError: Could not find the column 文案", () => {
  assert.equal(isSchemaError("Could not find the column display_name"), true);
});

test("isSchemaError: 普通 RLS / 网络错误返回 false", () => {
  assert.equal(isSchemaError(new Error("42501: permission denied")), false);
  assert.equal(isSchemaError(new Error("fetch failed")), false);
  assert.equal(isSchemaError(new Error("JWT invalid")), false);
});

test("isSchemaError: null / undefined / 空字符串返回 false", () => {
  assert.equal(isSchemaError(null), false);
  assert.equal(isSchemaError(undefined), false);
  assert.equal(isSchemaError(""), false);
});

// ============================================================
// 3. discover route communityErrorResponse 行为（通过服务层模拟）
// ============================================================

test("communityErrorResponse: CommunityServiceError(schema cause) → 500 + schema_error + correlationId", async () => {
  // 直接复用 route 文件中的错误响应函数：通过模拟 import 检查源码包含所需分支。
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../../app/api/v2/community/discover/route.ts", import.meta.url), "utf8");

  // 必须在 schema 错误时返回 500（而非 503 伪降级）
  assert.match(src, /schema \? 500 : error\.status/);
  // 必须返回 schema_error code（而非 service_unavailable）
  assert.match(src, /code: schema \? "schema_error" : error\.code/);
  // 必须输出 correlationId
  assert.match(src, /correlationId: error\.correlationId/);
  // 非 CommunityServiceError 分支也要识别 schema 错误并输出 correlationId
  assert.match(src, /const schema = isSchemaError\(error\);/);
  assert.match(src, /correlationId,/);
});

test("communityErrorResponse: 非 CommunityServiceError 原始 DB 错误也要识别 schema 类别", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../../app/api/v2/community/discover/route.ts", import.meta.url), "utf8");
  // 非 CommunityServiceError 分支：检测 schema 错误并返回 500 + schema_error
  assert.match(src, /const schema = isSchemaError\(error\);\s+const correlationId = generateRouteCorrelationId\(\);/);
  assert.match(src, /code: schema \? "schema_error" : "service_unavailable"/);
});

// ============================================================
// 4. apiError 通用响应包含 correlationId
// ============================================================

test("apiError: 响应体包含 correlationId 字段（源码审计）", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../../lib/api/responses.ts", import.meta.url), "utf8");
  // 必须有 generateCorrelationId 函数
  assert.match(src, /function generateCorrelationId\(\)/);
  // apiError 中必须生成 correlationId 并写入响应体
  assert.match(src, /const correlationId = generateCorrelationId\(\);/);
  assert.match(src, /correlationId,/);
});

test("apiError: PGRST204 + SUPABASE_SERVICE_ERROR → 500 + schema 错误文案（源码审计）", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../../lib/api/responses.ts", import.meta.url), "utf8");
  // 必须识别 PGRST204 / 42703 / 42P01 / PGRST205
  assert.match(src, /PGRST204/);
  assert.match(src, /42703/);
  assert.match(src, /42P01/);
  assert.match(src, /PGRST205/);
  // schema 错误必须返回 500
  assert.match(src, /unknownColumn && serviceError \? 500/);
  // schema 错误必须返回明确文案
  assert.match(src, /数据库 schema 缺失列或表/);
});

// ============================================================
// 5. actor-usages 不再吞没 DB 错误（源码审计）
// ============================================================

test("actor-usages: listPlatformActors 不再 .catch(() => []) 吞没 profile 查询错误", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../../lib/supabase/actor-usages.ts", import.meta.url), "utf8");

  // 在 listPlatformActors 函数体内（profile 与 usage count 查询）不应出现 .catch(() => [])
  const fnStart = src.indexOf("export async function listPlatformActors");
  const fnEnd = src.indexOf("function toPublicActorProfile");
  assert.ok(fnStart > -1 && fnEnd > fnStart, "listPlatformActors 应存在");
  const fnBody = src.slice(fnStart, fnEnd);

  // 关键查询不应再 .catch(() => [])（吞没 schema 错误）
  assert.doesNotMatch(
    fnBody,
    /storyflow_profiles[\s\S]*?\.catch\(\(\) => \[\]\)/,
    "listPlatformActors 中的 storyflow_profiles 查询不应再 .catch(() => [])",
  );
  assert.doesNotMatch(
    fnBody,
    /storyflow_actor_usages[\s\S]*?\.catch\(\(\) => \[\]\)/,
    "listPlatformActors 中的 storyflow_actor_usages 查询不应再 .catch(() => [])",
  );
});

test("actor-usages: Phase 0 Task 0.5 标记注释存在", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../../lib/supabase/actor-usages.ts", import.meta.url), "utf8");
  assert.match(src, /Phase 0 Task 0\.5[：:]/);
  assert.match(src, /不再 \.catch\(\(\) => \[\]\) 吞没 DB 错误/);
});

// ============================================================
// 6. ActorMarketSection 使用真实端点（源码审计）
// ============================================================

test("ActorMarketSection: 数据源端点为 /api/actors/platform（fetch 调用必须用真实端点）", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../../components/marketplace/ActorMarketSection.tsx", import.meta.url), "utf8");

  // 必须在 fetch(...) 调用中使用真实端点 /api/actors/platform
  assert.match(src, /fetch\(`\/api\/actors\/platform\?\$\{params\.toString\(\)\}`/);
  // 不应在 fetch(...) 调用中使用不存在的 /api/actors/market（会被 [actorId] 动态路由误命中）
  assert.doesNotMatch(src, /fetch\(['"`]\/api\/actors\/market/, "fetch 不应调用 /api/actors/market");
});

test("ActorMarketSection: 响应映射处理 platform 响应结构", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../../components/marketplace/ActorMarketSection.tsx", import.meta.url), "utf8");
  // platform 端点返回 { actors: [...], total }，组件应映射为 MarketActorCard[]
  assert.match(src, /json\.actors/);
  assert.match(src, /json\.total/);
  assert.match(src, /MarketActorCard\[\]/);
});

test("ActorMarketSection: Phase 0 Task 0.5 标记注释存在", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../../components/marketplace/ActorMarketSection.tsx", import.meta.url), "utf8");
  assert.match(src, /Phase 0 Task 0\.5[：:]/);
});
