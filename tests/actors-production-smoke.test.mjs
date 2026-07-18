/**
 * actors-production-smoke tests — PRD §7.1 演员 API 真实可用性
 *
 * 覆盖：
 * - /api/actors 错误响应不掩盖 PGRST204（未知列）为"云端服务不可用"伪降级
 * - /api/actors/generate-views 响应不泄露内部 storagePath
 * - apiError 对 PGRST204 返回 500 + 真实 schema 错误
 *
 * 注：route handler 是 Next-bound，这里用源码 + 单元函数测试覆盖契约。
 *
 * 运行：node --test tests/actors-production-smoke.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// 1. apiError 不再把 PGRST204 掩盖成"云端服务不可用"
test("apiError 对 PGRST204 返回 500 + 真实 schema 错误，不伪装成云端服务不可用", async () => {
  const responses = await read("../lib/api/responses.ts");
  // 必须检测 PGRST204
  assert.match(responses, /PGRST204/);
  assert.match(responses, /42703/);
  // 必须有 unknownColumn 分支，返回 500
  assert.match(responses, /unknownColumn && serviceError\s*\?\s*500/);
  // 不得只返回"云端数据服务暂时不可用"——必须有 schema 错误文案分支
  assert.match(responses, /数据库 schema 缺失列或表/);
});

// 2. apiError 对普通 SUPABASE_SERVICE_ERROR 仍返回"云端服务不可用"（不破坏既有契约）
test("apiError 对非 schema 错误的 SUPABASE_SERVICE_ERROR 仍返回云端服务不可用", async () => {
  const responses = await read("../lib/api/responses.ts");
  // 确保通用 service unavailable 文案仍在
  assert.match(responses, /云端数据服务暂时不可用/);
});

// 3. generate-views GET 响应不泄露 storagePath
test("generate-views GET 响应不含 storagePath 字段", async () => {
  const route = await read("../app/api/actors/generate-views/route.ts");
  // 在 GET 响应构造块中，不应出现 storagePath: row.storage_path
  // 提取 GET handler 的返回块（return ok 之前的部分）检查
  const getMatch = route.match(/export async function GET[\s\S]*?\n\}/);
  assert.ok(getMatch, "GET handler must exist");
  const getBlock = getMatch[0];
  // GET 响应中的 versions 项不得包含 storagePath
  // 允许 row.storage_path 用于 signStoredArtImage 入参，但不得作为响应字段返回
  assert.doesNotMatch(
    getBlock,
    /storagePath:\s*row\.storage_path/,
    "GET 响应不得返回内部 storagePath",
  );
});

// 4. generate-views POST 响应不泄露 storagePath
test("generate-views POST 响应不含 storagePath 字段", async () => {
  const route = await read("../app/api/actors/generate-views/route.ts");
  const postMatch = route.match(/export async function POST[\s\S]*?\n\}/);
  assert.ok(postMatch, "POST handler must exist");
  const postBlock = postMatch[0];
  // POST 最终响应 versions 不得包含 storagePath
  // KIIKIS-TR-ACTOR-P0-006: 合成图模式，单图成功用 success 变量，versions 是数组字面量
  const versionsMatch = postBlock.match(/const versions = \[[\s\S]*?\];/);
  assert.ok(versionsMatch, "versions array must exist");
  assert.doesNotMatch(
    versionsMatch[0],
    /storagePath:/,
    "POST 响应 versions 不得包含 storagePath 字段",
  );
  // 必须保留 previewUrl（签名 URL）供客户端展示
  assert.match(versionsMatch[0], /previewUrl:/);
});

// 5. generate-views 路由对 ACTOR_AVATAR_REQUIRED / ACTOR_VIEW_PACK_UNKNOWN 返回 400
test("generate-views 对已知业务错误返回 400 + 可读文案", async () => {
  const route = await read("../app/api/actors/generate-views/route.ts");
  assert.match(route, /ACTOR_VIEW_PACK_UNKNOWN[\s\S]*?400/);
  assert.match(route, /ACTOR_AVATAR_REQUIRED[\s\S]*?400/);
});

// 6. generate-views 使用 owner-scoped 演员查询（getActorForUser）
test("generate-views 使用 owner-scoped getActorForUser 校验归属", async () => {
  const route = await read("../app/api/actors/generate-views/route.ts");
  assert.match(route, /import.*getActorForUser.*from.*@\/lib\/supabase\/actors/);
  assert.match(route, /await getActorForUser\(user\.id, actorId\)/);
});
