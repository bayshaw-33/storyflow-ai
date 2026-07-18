/**
 * actor-usages tests — KIIKIS-TR-ACTOR-P0-004 Commit 5
 *
 * PRD §P1 新增使用留痕表 + §使用规则 + §权限矩阵：
 * - storyflow_actor_usages 表：幂等 UNIQUE(actor_id, consumer_id, project_id)
 * - RLS：consumer 可 SELECT/INSERT 自己的；actor_owner 可 SELECT 被使用的
 * - 不允许 UPDATE/DELETE（留痕不可改不可删）
 * - createActorUsage 幂等 + 校验 platform 共享 + 禁止创建者自用
 * - listPlatformActors 不暴露邮箱/UUID/供应商 URL
 * - API: POST /api/actors/[actorId]/use + GET /api/actors/platform + GET /api/actors/usages
 *
 * 运行：node --test tests/actor-usages.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// ============================================================
// Migration SQL: 表结构 + 唯一约束 + RLS + 外键 + 索引
// ============================================================

test("M1: storyflow_actor_usages 表含所有 PRD 必需字段", async () => {
  const sql = await read("../supabase/migrations/20260722000000_actor_usages.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.storyflow_actor_usages/);
  // PRD 必需字段
  for (const field of ["id", "actor_id", "actor_owner_id", "consumer_id", "project_id", "source_unit_id", "portrayal_id", "usage_type", "terms_version", "creator_snapshot", "created_at", "revoked_at"]) {
    assert.match(sql, new RegExp(`${field}\\s+`), `应有字段 ${field}`);
  }
});

test("M2: 幂等唯一约束 UNIQUE(actor_id, consumer_id, project_id)", async () => {
  const sql = await read("../supabase/migrations/20260722000000_actor_usages.sql");
  assert.match(sql, /CONSTRAINT storyflow_actor_usages_unique UNIQUE \(actor_id, consumer_id, project_id\)/);
});

test("M3: RLS 启用 + SELECT 策略；使用记录只允许服务端写入", async () => {
  const sql = await read("../supabase/migrations/20260722000000_actor_usages.sql");
  assert.match(sql, /ALTER TABLE public\.storyflow_actor_usages ENABLE ROW LEVEL SECURITY/);
  // SELECT: consumer 或 actor_owner
  assert.match(sql, /CREATE POLICY actor_usages_consumer_or_owner_select[\s\S]+?FOR SELECT/);
  assert.match(sql, /consumer_id = auth\.uid\(\)\s+OR\s+actor_owner_id = auth\.uid\(\)/);
  // 不创建 authenticated INSERT 策略：服务端从权威 actor/project 构造记录，
  // 防止 Data API 伪造 owner、project 或快照。
  assert.doesNotMatch(sql, /CREATE POLICY actor_usages_consumer_insert/);
  assert.match(sql, /RLS 默认拒绝没有策略的 INSERT/);
  // 不应有 UPDATE/DELETE 策略（留痕不可改不可删）
  assert.doesNotMatch(sql, /FOR UPDATE/);
  assert.doesNotMatch(sql, /FOR DELETE/);
});

test("M4: 外键约束（actor_id → actor_profiles, consumer/owner → auth.users）", async () => {
  const sql = await read("../supabase/migrations/20260722000000_actor_usages.sql");
  assert.match(sql, /FOREIGN KEY \(actor_id\) REFERENCES public\.storyflow_actor_profiles\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /FOREIGN KEY \(consumer_id\) REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /FOREIGN KEY \(actor_owner_id\) REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
});

test("M5: 索引（consumer/owner/actor/project 查询性能）", async () => {
  const sql = await read("../supabase/migrations/20260722000000_actor_usages.sql");
  assert.match(sql, /storyflow_actor_usages_consumer_idx/);
  assert.match(sql, /storyflow_actor_usages_owner_idx/);
  assert.match(sql, /storyflow_actor_usages_actor_idx/);
  assert.match(sql, /storyflow_actor_usages_project_idx/);
});

test("M6: usage_type CHECK 约束含 internal_free 和 paid", async () => {
  const sql = await read("../supabase/migrations/20260722000000_actor_usages.sql");
  assert.match(sql, /CHECK \(usage_type = ANY \(ARRAY\['internal_free'::text, 'paid'::text\]\)\)/);
});

// ============================================================
// lib/supabase/actor-usages.ts: 函数签名 + 校验逻辑
// ============================================================

test("L1: export createActorUsage + listPlatformActors + listMyUsages + listUsagesForActorOwner", async () => {
  const src = await read("../lib/supabase/actor-usages.ts");
  assert.match(src, /export async function createActorUsage/);
  assert.match(src, /export async function listPlatformActors/);
  assert.match(src, /export async function listMyUsages/);
  assert.match(src, /export async function listUsagesForActorOwner/);
});

test("L2: createActorUsage 校验 actor.visibility === platform（取消共享后禁止新使用）", async () => {
  const src = await read("../lib/supabase/actor-usages.ts");
  assert.match(src, /if \(actor\.visibility !== "platform"\) throw new Error\("ACTOR_NOT_PLATFORM_SHARED"\)/);
  assert.match(src, /if \(actor\.status === "archived"\) throw new Error\("ACTOR_ARCHIVED"\)/);
});

test("L3: createActorUsage 禁止创建者自用", async () => {
  const src = await read("../lib/supabase/actor-usages.ts");
  assert.match(src, /if \(actor\.owner_id === params\.consumerId\) throw new Error\("ACTOR_OWNER_CANNOT_USE_SELF"\)/);
});

test("L3b: createActorUsage 从权威 project 校验 consumer 归属", async () => {
  const src = await read("../lib/supabase/actor-usages.ts");
  assert.match(src, /storyflow_projects\?id=eq\.\$\{encodeURIComponent\(params\.projectId\)\}/);
  assert.match(src, /if \(!project\) throw new Error\("PROJECT_NOT_FOUND"\)/);
  assert.match(src, /projectOwnerId !== params\.consumerId\) throw new Error\("PROJECT_FORBIDDEN"\)/);
});

test("L4: createActorUsage 幂等（Prefer: resolution=merge-duplicates + 查询已有记录）", async () => {
  const src = await read("../lib/supabase/actor-usages.ts");
  assert.match(src, /Prefer.*resolution=merge-duplicates/);
  // 命中 409 时降级为查询已有记录
  assert.match(src, /msg\.includes\("409"\)/);
  // 最终查询返回 usage
  assert.match(src, /storyflow_actor_usages\?actor_id=eq\.\$\{encodeURIComponent\(params\.actorId\)\}&consumer_id=eq/);
});

test("L5: createActorUsage 创建 creator_snapshot 快照（防止后续篡改）", async () => {
  const src = await read("../lib/supabase/actor-usages.ts");
  assert.match(src, /creator_snapshot/);
  assert.match(src, /snapshot_at/);
  // 快照应含关键字段
  assert.match(src, /name: actor\.name/);
  assert.match(src, /age_range: actor\.age_range/);
});

test("L6: listPlatformActors 不暴露创建者邮箱（只查 display_name）", async () => {
  const src = await read("../lib/supabase/actor-usages.ts");
  // 查询 storyflow_profiles 只取 display_name，不取 email
  assert.match(src, /storyflow_profiles\?user_id=in\.\([\s\S]*?\)&select=user_id,display_name/);
  // 不应查询 email
  const listFuncMatch = src.match(/export async function listPlatformActors[\s\S]*?\n\}/);
  assert.ok(listFuncMatch, "listPlatformActors 应存在");
  assert.doesNotMatch(listFuncMatch[0], /select=\*.*email|select=user_id,email|,email/);
});

test("L7: listPlatformActors 聚合使用次数", async () => {
  const src = await read("../lib/supabase/actor-usages.ts");
  assert.match(src, /storyflow_actor_usages\?actor_id=in/);
  assert.match(src, /usage_count/);
});

test("L8: listPlatformActors 分页 + 搜索", async () => {
  const src = await read("../lib/supabase/actor-usages.ts");
  assert.match(src, /page.*pageSize/);
  assert.match(src, /limit=\$\{pageSize\}&offset=\$\{offset\}/);
  assert.match(src, /search/);
});

// ============================================================
// API routes
// ============================================================

test("A1: POST /api/actors/[actorId]/use 路由存在且校验 projectId", async () => {
  const src = await read("../app/api/actors/[actorId]/use/route.ts");
  assert.match(src, /export async function POST/);
  assert.match(src, /PROJECT_REQUIRED/);
  assert.match(src, /createActorUsage/);
  assert.match(src, /authenticateRequest/);
});

test("A2: GET /api/actors/platform 路由存在", async () => {
  const src = await read("../app/api/actors/platform/route.ts");
  assert.match(src, /export async function GET/);
  assert.match(src, /listPlatformActors/);
  assert.match(src, /authenticateRequest/);
});

test("A3: GET /api/actors/usages 路由存在，支持 view=mine|owned", async () => {
  const src = await read("../app/api/actors/usages/route.ts");
  assert.match(src, /export async function GET/);
  assert.match(src, /listMyUsages/);
  assert.match(src, /listUsagesForActorOwner/);
  assert.match(src, /view.*mine.*owned|view.*owned.*mine/);
});

// ============================================================
// 权限矩阵对照（PRD §使用规则 + §权限矩阵）
// ============================================================

test('P1: 其他用户可以使用演员（不复制不修改原演员）', async () => {
  const src = await read("../lib/supabase/actor-usages.ts");
  // createActorUsage 不修改 actor_profiles（只查询 + 插入 usages）
  // 提取 createActorUsage 到下一个 export function 之间的源码
  const startIdx = src.indexOf("export async function createActorUsage");
  const nextExportIdx = src.indexOf("export async function", startIdx + 10);
  const funcBody = src.slice(startIdx, nextExportIdx > 0 ? nextExportIdx : undefined);
  assert.ok(funcBody.length > 100, "createActorUsage 函数体应存在");
  // 不应包含 PATCH/UPDATE actor_profiles（不修改原演员）
  assert.doesNotMatch(funcBody, /PATCH[\s\S]*storyflow_actor_profiles|storyflow_actor_profiles[\s\S]*PATCH/);
  // 应包含 POST actor_usages（插入使用记录）
  assert.match(funcBody, /storyflow_actor_usages/);
  assert.match(funcBody, /method:\s*"POST"/);
});

test("P2: 取消共享后旧记录保留，但禁止新项目继续调用", async () => {
  const src = await read("../lib/supabase/actor-usages.ts");
  // createActorUsage 检查当前 visibility === "platform"
  assert.match(src, /ACTOR_NOT_PLATFORM_SHARED/);
  // migration 中 revoked_at 字段存在（用于标记撤销，但记录不删）
  const sql = await read("../supabase/migrations/20260722000000_actor_usages.sql");
  assert.match(sql, /revoked_at timestamp with time zone/);
});

test("P3: 使用记录不可改不可删（RLS 无 UPDATE/DELETE 策略）", async () => {
  const sql = await read("../supabase/migrations/20260722000000_actor_usages.sql");
  assert.doesNotMatch(sql, /FOR UPDATE/);
  assert.doesNotMatch(sql, /FOR DELETE/);
});

test("P4: 平台共享演员卡使用脱敏 DTO，不暴露创建者 UUID、资产 ID、提示词或 metadata", async () => {
  const src = await read("../lib/supabase/actor-usages.ts");
  // PlatformActorCard 类型只含 creator_display_name，不含 email/owner_id 原始值
  assert.match(src, /export type PlatformActorCard = \{[\s\S]*?creator_display_name[\s\S]*?usage_count[\s\S]*?\}/);
  // 不应含 email 字段
  const cardMatch = src.match(/export type PlatformActorCard = \{[\s\S]*?\}/);
  assert.ok(cardMatch);
  assert.doesNotMatch(cardMatch[0], /email/);
  assert.doesNotMatch(cardMatch[0], /storage_path/);
  assert.match(src, /actor: toPublicActorProfile\(actor\)/);
  const publicDto = src.match(/export type PublicActorProfile =[\s\S]*?>;/)?.[0] || "";
  assert.doesNotMatch(publicDto, /owner_id|avatar_asset_id|reference_sheet_asset_id|base_prompt|negative_prompt|metadata/);
});

console.log("Commit 5 使用留痕表测试套件加载完成");
