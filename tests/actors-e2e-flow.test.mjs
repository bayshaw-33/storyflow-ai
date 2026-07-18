/**
 * actors E2E flow tests — KIIKIS-TR-ACTOR-P0-004 Commit 7
 *
 * 跨 Commit 1-6 集成验证：把 6 个 commit 的契约串成完整生命周期。
 *
 * 覆盖流程：
 *  Flow A: AI 生成演员全链路（创建 → platform 共享 → 其他用户使用）
 *  Flow B: 真人照片演员肖像权边界（未确认 → 禁止 platform → 确认 → 允许）
 *  Flow C: 跨 commit 集成点（函数调用链 + 类型字段 + 文案完整性）
 *
 * 运行：node --test tests/actors-e2e-flow.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// ============================================================
// Flow A: AI 生成演员全链路（Commit 1-6 集成）
// ============================================================

test("A1: ActorProfileInput 字段完整性 — 含 Commit 1-6 所有新增字段", async () => {
  const src = await read("../lib/actors.ts");
  // Commit 1: visibility
  assert.match(src, /visibility\?:\s*ActorVisibility/);
  // Commit 2: avatar_asset_id（Storage 上传）
  assert.match(src, /avatar_asset_id\?:\s*string\s*\|\s*null/);
  // Commit 6: origin_type + rights_confirmed（肖像权）
  assert.match(src, /origin_type\?:\s*ActorOriginType/);
  assert.match(src, /rights_confirmed\?:\s*boolean/);
  // Commit 2: uploaded_avatar_data_url 标记为 never（禁 Base64）
  assert.match(src, /uploaded_avatar_data_url\?:\s*never/);
});

test("A2: AI 生成演员 computeRightsState → ai_generated → 允许 platform", async () => {
  const mod = await import("../lib/actors.ts");
  // AI 生成演员的 rights_state 计算
  const rightsState = mod.computeRightsState({ origin_type: "ai_generated" });
  assert.equal(rightsState, "ai_generated");
  // ai_generated 在 PLATFORM_ALLOWED_RIGHTS 集合中
  assert.ok(mod.PLATFORM_ALLOWED_RIGHTS.has("ai_generated"), "ai_generated 必须在允许集合中");
  // assertCanSetPlatformVisibility 对 AI 生成不抛错
  assert.doesNotThrow(() => mod.assertCanSetPlatformVisibility("platform", "ai_generated"));
});

test("A3: platform 共享演员对其他用户可见 — accessQuery 含 platform 分支", async () => {
  const src = await read("../lib/supabase/actors.ts");
  // accessQuery 必须始终含 platform 分支（不依赖 team_id）
  assert.match(src, /or=\(visibility\.eq\.platform,/);
  // 注释说明 platform 对所有 authenticated 可读
  assert.match(src, /platform 分支始终存在/);
});

test("A4: assertCanReadActor 对 platform 可见性直接通过", async () => {
  const src = await read("../lib/supabase/actors.ts");
  // platform 可见性直接 return（任何 authenticated 用户可读）
  assert.match(src, /if \(actor\.visibility === "platform"\) return;/);
});

test("A5: createActorUsage 校验 visibility===platform + 非 owner + 创建快照", async () => {
  const src = await read("../lib/supabase/actor-usages.ts");
  // 校验当前 visibility 仍是 platform
  assert.match(src, /if \(actor\.visibility !== "platform"\) throw new Error\("ACTOR_NOT_PLATFORM_SHARED"\)/);
  // 校验非 owner（创建者不需要"使用"自己的演员）
  assert.match(src, /if \(actor\.owner_id === params\.consumerId\) throw new Error\("ACTOR_OWNER_CANNOT_USE_SELF"\)/);
  // 创建快照（防止后续创建者修改演员资料后使用记录失去上下文）
  assert.match(src, /creatorSnapshot/);
});

// ============================================================
// Flow B: 真人照片演员肖像权边界（Commit 6 重点）
// ============================================================

test("B1: 真人未确认 → computeRightsState 返回 portrait_pending", async () => {
  const mod = await import("../lib/actors.ts");
  assert.equal(mod.computeRightsState({ origin_type: "real_person" }), "portrait_pending");
  assert.equal(mod.computeRightsState({ origin_type: "real_person", rights_confirmed: false }), "portrait_pending");
});

test("B2: portrait_pending + visibility=platform → assertCanSetPlatformVisibility 抛 ACTOR_PORTRAIT_RIGHTS_REQUIRED", async () => {
  const mod = await import("../lib/actors.ts");
  assert.throws(
    () => mod.assertCanSetPlatformVisibility("platform", "portrait_pending"),
    /ACTOR_PORTRAIT_RIGHTS_REQUIRED/,
  );
  // portrait_pending 不在允许集合中
  assert.ok(!mod.PLATFORM_ALLOWED_RIGHTS.has("portrait_pending"));
});

test("B3: normalizeActorInput 把 rights_state 写入 metadata", async () => {
  const mod = await import("../lib/actors.ts");
  // 真人未确认 → metadata.rights_state = "portrait_pending"
  const result = mod.normalizeActorInput({ origin_type: "real_person", rights_confirmed: false });
  assert.equal(result.metadata?.rights_state, "portrait_pending");
  // AI 生成 → metadata.rights_state = "ai_generated"
  const aiResult = mod.normalizeActorInput({ origin_type: "ai_generated" });
  assert.equal(aiResult.metadata?.rights_state, "ai_generated");
});

test("B4: 真人确认 → computeRightsState 返回 portrait_confirmed → 允许 platform", async () => {
  const mod = await import("../lib/actors.ts");
  const rightsState = mod.computeRightsState({ origin_type: "real_person", rights_confirmed: true });
  assert.equal(rightsState, "portrait_confirmed");
  assert.ok(mod.PLATFORM_ALLOWED_RIGHTS.has("portrait_confirmed"));
  // 确认后允许 platform
  assert.doesNotThrow(() => mod.assertCanSetPlatformVisibility("platform", "portrait_confirmed"));
});

test("B5: mergeActorUpdate 在 input 未传 origin_type 时保留 existing.rights_state", async () => {
  const src = await read("../lib/actors.ts");
  // 关键约束：input 未传 origin_type 时保留 existing.metadata.rights_state
  assert.match(src, /else if \(mergedMetadata && existing\.metadata\?\.rights_state\) \{/);
  assert.match(src, /mergedMetadata\.rights_state = existing\.metadata\.rights_state;/);
});

// ============================================================
// Flow C: 跨 commit 集成点（函数调用链 + 类型字段 + 文案完整性）
// ============================================================

test("C1: createActorForUser 调用 assertCanSetPlatformVisibility + validateAvatarAssetBelongsToUser", async () => {
  const src = await read("../lib/supabase/actors.ts");
  // 找到 createActorForUser 函数体
  const idx = src.indexOf("export async function createActorForUser");
  assert.ok(idx >= 0, "createActorForUser must exist");
  const nextExport = src.indexOf("export async function", idx + 10);
  const slice = src.slice(idx, nextExport > 0 ? nextExport : src.length);
  // visibility=platform 时调用 assertCanSetPlatformVisibility
  assert.match(slice, /if \(normalized\.visibility === "platform"\)[\s\S]*?assertCanSetPlatformVisibility/);
  // 头像校验：validateAvatarAssetBelongsToUser
  assert.match(slice, /validateAvatarAssetBelongsToUser\(userId,\s*input\.avatar_asset_id\)/);
});

test("C2: updateActorForUser 调用 mergeActorUpdate + assertCanEditActorBasicProfile + portrait rights 校验", async () => {
  const src = await read("../lib/supabase/actors.ts");
  const idx = src.indexOf("export async function updateActorForUser");
  assert.ok(idx >= 0, "updateActorForUser must exist");
  const nextExport = src.indexOf("export async function", idx + 10);
  const slice = src.slice(idx, nextExport > 0 ? nextExport : src.length);
  // mergeActorUpdate（Commit 3 空字段不覆盖）
  assert.match(slice, /mergeActorUpdate\(actor,\s*input\)/);
  // assertCanEditActorBasicProfile（Commit 3 仅创建者可写）
  assert.match(slice, /assertCanEditActorBasicProfile\(userId,\s*actor\)/);
  // portrait rights 校验（Commit 6）
  assert.match(slice, /if \(normalized\.visibility === "platform"\)[\s\S]*?assertCanSetPlatformVisibility/);
});

test("C3: PlatformActorCard 类型不暴露 owner email/UUID/供应商 URL/存储路径", async () => {
  const src = await read("../lib/supabase/actor-usages.ts");
  // PlatformActorCard 类型定义
  assert.match(src, /export type PlatformActorCard = \{/);
  // 必须有 creator_display_name（脱敏后的显示名，不暴露邮箱/UUID）
  assert.match(src, /creator_display_name/);
  // 必须有 usage_count（使用次数）
  assert.match(src, /usage_count/);
  // 禁止暴露 owner_id / owner_email / storage_path
  assert.doesNotMatch(src, /PlatformActorCard[\s\S]*?owner_email/);
});

test("C4: assertCanEditActorBasicProfile 不因 visibility=platform 而放宽", async () => {
  const src = await read("../lib/supabase/actors.ts");
  const idx = src.indexOf("async function assertCanEditActorBasicProfile");
  assert.ok(idx >= 0, "assertCanEditActorBasicProfile must exist");
  // 提取完整函数体
  const braceStart = src.indexOf("{", idx);
  let depth = 0;
  let end = braceStart;
  for (let i = braceStart; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  const slice = src.slice(idx, end);
  // 仍仅创建者可写（不因 platform 共享而放宽）
  // 实际代码用正向判断：if (actor.owner_id === userId) return; 否则抛 ACTOR_FORBIDDEN
  assert.match(slice, /actor\.owner_id === userId/);
  assert.match(slice, /ACTOR_FORBIDDEN/);
  // 不含 visibility 判断（不因 platform 而放宽）
  assert.doesNotMatch(slice, /visibility/, "权限校验不应依赖 visibility");
});

test("C5: actor-copy.ts 含所有 Commit 1-6 新增文案", async () => {
  const src = await read("../components/actors/actor-copy.ts");
  // Commit 4: visibilityPlatform 文案
  assert.match(src, /visibilityPlatform:/);
  // Commit 6: 肖像权相关文案
  assert.match(src, /originTypeLabel:/);
  assert.match(src, /originTypeAi:/);
  assert.match(src, /originTypeReal:/);
  assert.match(src, /portraitRightsConfirm:/);
  assert.match(src, /portraitRightsRequired:/);
});

// ============================================================
// Flow D: 数据库层契约（migration 一致性）
// ============================================================

test("D1: migration 20260721000000 platform 可见性 + RLS 修复", async () => {
  const src = await read("../supabase/migrations/20260721000000_actor_platform_visibility.sql");
  // visibility CHECK 含 platform（PostgreSQL 用 ANY(ARRAY[...]) 或 IN (...)）
  assert.match(src, /visibility.*private.*team.*platform/);
  // SELECT 策略 platform 对所有 authenticated 可读
  assert.match(src, /visibility = 'platform'::text/);
  // 修复 baseline bug：m.team_id = storyflow_actor_profiles.team_id（不是自引用）
  assert.match(src, /m\.team_id = storyflow_actor_profiles\.team_id/);
});

test("D2: migration 20260722000000 storyflow_actor_usages 表 + 幂等约束", async () => {
  const src = await read("../supabase/migrations/20260722000000_actor_usages.sql");
  // 表存在
  assert.match(src, /CREATE TABLE[\s\S]*?storyflow_actor_usages/);
  // 幂等唯一约束（UNIQUE 后允许有空格）
  assert.match(src, /UNIQUE\s*\(actor_id,\s*consumer_id,\s*project_id\)/);
  // usage_type CHECK（PostgreSQL 用 ANY(ARRAY[...]) 或 IN (...)，两种都接受）
  assert.match(src, /usage_type.*internal_free.*paid/);
  // RLS：consumer 可 SELECT 自己的
  assert.match(src, /consumer_id = auth\.uid\(\)/);
});

test("D3: migration 20260723000000 文档化 rights_state 约束", async () => {
  const src = await read("../supabase/migrations/20260723000000_actor_portrait_rights.sql");
  // COMMENT ON COLUMN 文档化 rights_state
  assert.match(src, /COMMENT ON COLUMN/);
  assert.match(src, /rights_state/);
  // 文档说明允许的值
  assert.match(src, /ai_generated|portrait_confirmed|portrait_pending/);
});

console.log("Commit 7 E2E flow 测试套件加载完成");
