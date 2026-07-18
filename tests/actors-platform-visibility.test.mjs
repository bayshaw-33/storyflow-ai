/**
 * actors-platform-visibility tests — KIIKIS-TR-ACTOR-P0-004 Commit 4
 *
 * PRD §P1 建立平台共享演员库 + §权限矩阵：
 * - migration 扩展 visibility CHECK 加入 platform
 * - 重建 SELECT/INSERT RLS 策略，platform 对所有 authenticated 可读
 * - 修复 baseline 的 m.team_id = m.team_id bug（team 共享之前实际失效）
 * - lib/actors.ts: ActorVisibility 类型 + normalizeActorInput + mergeActorUpdate 处理 platform
 * - lib/supabase/actors.ts: listStructuredActorsForUser accessQuery 含 platform 分支
 * - assertCanReadActor 接受 platform（任意 authenticated 可读）
 * - assertCanEditActorBasicProfile 仍仅创建者可写（platform 共享 ≠ 可编辑）
 * - EditActorModal visibility 下拉含 platform 选项
 * - actor-copy.ts 中英文 visibilityPlatform 文案
 *
 * 运行：node --test tests/actors-platform-visibility.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// ============================================================
// Migration SQL 合法性
// ============================================================

test("M1: migration 扩展 visibility CHECK 约束含 platform", async () => {
  const sql = await read("../supabase/migrations/20260721000000_actor_platform_visibility.sql");
  assert.match(sql, /DROP CONSTRAINT IF EXISTS storyflow_actor_profiles_visibility_check/);
  assert.match(sql, /ADD CONSTRAINT storyflow_actor_profiles_visibility_check/);
  assert.match(sql, /CHECK \(visibility = ANY \(ARRAY\['private'::text, 'team'::text, 'platform'::text\]\)\)/);
});

test("M2: migration 重建 SELECT 策略，platform 对所有 authenticated 可读，修复 baseline bug", async () => {
  const sql = await read("../supabase/migrations/20260721000000_actor_platform_visibility.sql");
  assert.match(sql, /DROP POLICY IF EXISTS actor_profiles_visible_select/);
  assert.match(sql, /CREATE POLICY actor_profiles_visible_select[\s\S]+?FOR SELECT TO authenticated/);
  assert.match(sql, /OR \(visibility = 'platform'::text\)/);
  assert.match(sql, /owner_id = auth\.uid\(\)/);
  // 修复 baseline 的 m.team_id = m.team_id bug
  assert.match(sql, /m\.team_id = storyflow_actor_profiles\.team_id/);
  assert.doesNotMatch(sql, /m\.team_id = m\.team_id/);
});

test("M3: migration 重建 INSERT 策略，platform 仍要求 owner_id = auth.uid()", async () => {
  const sql = await read("../supabase/migrations/20260721000000_actor_platform_visibility.sql");
  assert.match(sql, /DROP POLICY IF EXISTS actor_profiles_owner_or_team_editor_insert/);
  assert.match(sql, /CREATE POLICY actor_profiles_owner_or_team_editor_insert[\s\S]+?FOR INSERT TO authenticated/);
  assert.match(sql, /owner_id = auth\.uid\(\)\s+AND/);
  assert.match(sql, /visibility = 'platform'::text/);
  assert.match(sql, /m\.role = ANY \(ARRAY\['owner'::text, 'admin'::text, 'editor'::text\]\)/);
});

test("M4: migration 不修改 UPDATE/DELETE 策略（应用层是强约束）", async () => {
  const sql = await read("../supabase/migrations/20260721000000_actor_platform_visibility.sql");
  assert.doesNotMatch(sql, /DROP POLICY IF EXISTS \w+ ON public\.storyflow_actor_profiles FOR UPDATE/i);
  assert.doesNotMatch(sql, /CREATE POLICY \w+ ON public\.storyflow_actor_profiles FOR UPDATE/i);
});

// ============================================================
// lib/actors.ts: ActorVisibility 类型 + normalizeActorInput + mergeActorUpdate
// ============================================================

test("T1: ActorVisibility 类型包含 platform", async () => {
  const src = await read("../lib/actors.ts");
  assert.match(src, /export type ActorVisibility = "private" \| "team" \| "platform";/);
});

test("T2: normalizeActorInput 正确处理 platform（源码逻辑）", async () => {
  const src = await read("../lib/actors.ts");
  // 应有 platform 三元分支
  assert.match(src, /input\.visibility === "team" \? "team" : input\.visibility === "platform" \? "platform" : "private"/);
});

test("T3: mergeActorUpdate 在 existing.visibility=platform 时保留 platform（源码逻辑）", async () => {
  const src = await read("../lib/actors.ts");
  // mergeActorUpdate 的 visibility 行应有 platform 继承分支
  assert.match(src, /input\.visibility \? normalized\.visibility : \(existing\.visibility === "team" \? "team" : existing\.visibility === "platform" \? "platform" : "private"\)/);
});

test("T4: 动态 import lib/actors.ts，normalizeActorInput 实测 platform 输入", async () => {
  const mod = await import("../lib/actors.ts");
  const platformInput = mod.normalizeActorInput({ name: "Astra", visibility: "platform" });
  assert.equal(platformInput.visibility, "platform");
  const teamInput = mod.normalizeActorInput({ name: "Astra", visibility: "team", team_id: "t1" });
  assert.equal(teamInput.visibility, "team");
  const weirdInput = mod.normalizeActorInput({ name: "Astra", visibility: "weird" });
  assert.equal(weirdInput.visibility, "private");
});

test("T5: 动态 import lib/actors.ts，mergeActorUpdate 实测 platform 继承", async () => {
  const mod = await import("../lib/actors.ts");
  const existing = {
    id: "a1", owner_id: "u1", visibility: "platform",
    name: "Astra", bio: "", age_range: "", gender_expression: "", ethnicity_style: "",
    face_description: "", hair_description: "", body_description: "",
    temperament: [], playable_roles: [], base_prompt: "", negative_prompt: "",
    status: "ready", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  };
  // input 不传 visibility，应从 existing 继承 platform
  const m1 = mod.mergeActorUpdate(existing, { name: "Updated" });
  assert.equal(m1.visibility, "platform", "input.visibility 未传时应继承 existing.platform");
  // input 显式传 platform
  const m2 = mod.mergeActorUpdate(existing, { name: "Updated", visibility: "platform" });
  assert.equal(m2.visibility, "platform");
  // input 显式改成 private
  const m3 = mod.mergeActorUpdate(existing, { name: "Updated", visibility: "private" });
  assert.equal(m3.visibility, "private");
});

// ============================================================
// lib/supabase/actors.ts: listStructuredActorsForUser + assertCanReadActor
// ============================================================

test("S1: listStructuredActorsForUser accessQuery 含 platform 分支（始终存在）", async () => {
  const src = await read("../lib/supabase/actors.ts");
  assert.match(src, /or=\(visibility\.eq\.platform/);
  // 无团队时也含 platform
  assert.match(src, /or=\(visibility\.eq\.platform,\$\{ownerInOr\}\)/);
  // 有团队时 platform + team + owner
  assert.match(src, /or=\(visibility\.eq\.platform,\$\{teamExpr\},\$\{ownerInOr\}\)/);
});

test("S2: assertCanReadActor 接受 platform 可见性", async () => {
  const src = await read("../lib/supabase/actors.ts");
  assert.match(src, /if \(actor\.visibility === "platform"\) return;/);
});

test("S3: assertCanEditActorBasicProfile 仍仅创建者可写（platform 共享不绕过）", async () => {
  const src = await read("../lib/supabase/actors.ts");
  // 用正则提取函数体（从 async function 到第一个 } 结束）
  const funcMatch = src.match(/async function assertCanEditActorBasicProfile\([\s\S]*?\n\}/);
  assert.ok(funcMatch, "assertCanEditActorBasicProfile 函数应存在");
  const body = funcMatch[0];
  assert.match(body, /if \(actor\.owner_id === userId\) return;/, "应只检查 owner_id === userId");
  assert.doesNotMatch(body, /platform/, "不应有 platform 绕过");
  assert.doesNotMatch(body, /visibility === "team"/, "不应有 team 绕过");
  assert.match(body, /throw new Error\("ACTOR_FORBIDDEN"\)/, "非创建者应抛 ACTOR_FORBIDDEN");
});

// ============================================================
// EditActorModal + actor-copy.ts
// ============================================================

test("E1: EditActorModal visibility 下拉含 platform 选项", async () => {
  const src = await read("../components/actors/EditActorModal.tsx");
  assert.match(src, /<option value="platform">\{copy\.visibilityPlatform\}<\/option>/);
});

test("E2: EditActorModal 预填字段时正确处理 platform", async () => {
  const src = await read("../components/actors/EditActorModal.tsx");
  assert.match(src, /setVisibility\(actor\.visibility === "team" \? "team" : actor\.visibility === "platform" \? "platform" : "private"\)/);
});

test("C1: actor-copy.ts 中文 visibilityPlatform 文案", async () => {
  const src = await read("../components/actors/actor-copy.ts");
  assert.match(src, /visibilityPlatform: "全平台已登录用户可见（platform）"/);
});

test("C2: actor-copy.ts 英文 visibilityPlatform 文案", async () => {
  const src = await read("../components/actors/actor-copy.ts");
  assert.match(src, /visibilityPlatform: "Platform \(all signed-in users\)"/);
});

// ============================================================
// 权限矩阵对照（PRD §权限矩阵）
// ============================================================

test("P1: platform 共享演员对所有 authenticated 可读（SELECT 策略）", async () => {
  const sql = await read("../supabase/migrations/20260721000000_actor_platform_visibility.sql");
  assert.match(sql, /OR \(visibility = 'platform'::text\)/);
});

test("P2: 编辑基础资料仅创建者可写（应用层 assertCanEditActorBasicProfile）", async () => {
  const src = await read("../lib/supabase/actors.ts");
  const idx = src.indexOf("async function assertCanEditActorBasicProfile");
  const slice = src.slice(idx, idx + 200);
  assert.match(slice, /if \(actor\.owner_id === userId\) return;/);
  assert.doesNotMatch(slice, /visibility === "platform"/);
});

console.log("Commit 4 platform 共享模型测试套件加载完成");
