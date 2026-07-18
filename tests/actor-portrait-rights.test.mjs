/**
 * actor-portrait-rights tests — KIIKIS-TR-ACTOR-P0-004 Commit 6
 *
 * PRD §肖像权安全边界：
 * - AI 生成演员：默认允许平台共享（rights_state = "ai_generated"）
 * - 用户上传真人照片：必须明确确认肖像使用及再授权权利，才能设为 platform
 * - 权利状态不明确：只允许 private/team
 *
 * 实现：
 * - ActorOriginType / ActorRightsState 类型
 * - computeRightsState(input) → rights_state
 * - assertCanSetPlatformVisibility(visibility, rightsState)
 * - normalizeActorInput 把 rights_state 写入 metadata
 * - mergeActorUpdate 在 input 未传 origin_type 时保留 existing.rights_state
 * - createActorForUser / updateActorForUser 调用 assertCanSetPlatformVisibility
 * - CreateActorModal / EditActorModal 加 origin 选择 + 真人确认 checkbox
 *
 * 运行：node --test tests/actor-portrait-rights.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// ============================================================
// lib/actors.ts: 类型 + computeRightsState + assertCanSetPlatformVisibility
// ============================================================

test("T1: ActorOriginType + ActorRightsState + PLATFORM_ALLOWED_RIGHTS 类型存在", async () => {
  const src = await read("../lib/actors.ts");
  assert.match(src, /export type ActorOriginType = "ai_generated" \| "real_person";/);
  assert.match(src, /export type ActorRightsState = "ai_generated" \| "portrait_confirmed" \| "portrait_pending";/);
  assert.match(src, /export const PLATFORM_ALLOWED_RIGHTS[\s\S]*?new Set\(\["ai_generated", "portrait_confirmed"\]\)/);
});

test("T2: computeRightsState 实测三种场景", async () => {
  const mod = await import("../lib/actors.ts");
  // AI 生成 → ai_generated
  assert.equal(mod.computeRightsState({ origin_type: "ai_generated" }), "ai_generated");
  assert.equal(mod.computeRightsState({}), "ai_generated", "未指定 origin_type 默认 ai_generated");
  // 真人未确认 → portrait_pending
  assert.equal(mod.computeRightsState({ origin_type: "real_person" }), "portrait_pending");
  assert.equal(mod.computeRightsState({ origin_type: "real_person", rights_confirmed: false }), "portrait_pending");
  // 真人已确认 → portrait_confirmed
  assert.equal(mod.computeRightsState({ origin_type: "real_person", rights_confirmed: true }), "portrait_confirmed");
});

test("T3: assertCanSetPlatformVisibility 实测", async () => {
  const mod = await import("../lib/actors.ts");
  // private/team 任意 rights_state 都允许
  for (const vis of ["private", "team"]) {
    for (const rs of ["ai_generated", "portrait_confirmed", "portrait_pending"]) {
      mod.assertCanSetPlatformVisibility(vis, rs); // 不抛错
    }
  }
  // platform + ai_generated OK
  mod.assertCanSetPlatformVisibility("platform", "ai_generated");
  // platform + portrait_confirmed OK
  mod.assertCanSetPlatformVisibility("platform", "portrait_confirmed");
  // platform + portrait_pending 抛错
  assert.throws(
    () => mod.assertCanSetPlatformVisibility("platform", "portrait_pending"),
    /ACTOR_PORTRAIT_RIGHTS_REQUIRED/,
  );
});

test("T4: normalizeActorInput 把 rights_state 写入 metadata", async () => {
  const mod = await import("../lib/actors.ts");
  // AI 生成
  const ai = mod.normalizeActorInput({ name: "Astra", origin_type: "ai_generated" });
  assert.equal(ai.metadata?.rights_state, "ai_generated");
  // 真人未确认
  const pending = mod.normalizeActorInput({ name: "Astra", origin_type: "real_person" });
  assert.equal(pending.metadata?.rights_state, "portrait_pending");
  // 真人已确认
  const confirmed = mod.normalizeActorInput({ name: "Astra", origin_type: "real_person", rights_confirmed: true });
  assert.equal(confirmed.metadata?.rights_state, "portrait_confirmed");
  // 默认（未传 origin_type）
  const def = mod.normalizeActorInput({ name: "Astra" });
  assert.equal(def.metadata?.rights_state, "ai_generated");
});

test("T5: mergeActorUpdate 在 input 未传 origin_type 时保留 existing.rights_state", async () => {
  const mod = await import("../lib/actors.ts");
  const existing = {
    id: "a1", owner_id: "u1", visibility: "platform",
    name: "Astra", bio: "", age_range: "", gender_expression: "", ethnicity_style: "",
    face_description: "", hair_description: "", body_description: "",
    temperament: [], playable_roles: [], base_prompt: "", negative_prompt: "",
    status: "ready", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    metadata: { rights_state: "portrait_confirmed" },
  };
  // input 不传 origin_type → 保留 portrait_confirmed
  const m1 = mod.mergeActorUpdate(existing, { name: "Updated" });
  assert.equal(m1.metadata?.rights_state, "portrait_confirmed", "未传 origin_type 时应保留 existing.rights_state");
  // input 显式传 origin_type=ai_generated → 重新计算为 ai_generated
  const m2 = mod.mergeActorUpdate(existing, { name: "Updated", origin_type: "ai_generated" });
  assert.equal(m2.metadata?.rights_state, "ai_generated", "传 origin_type 时应重新计算");
  // input 显式传 origin_type=real_person + rights_confirmed=true → portrait_confirmed
  const m3 = mod.mergeActorUpdate(existing, { name: "Updated", origin_type: "real_person", rights_confirmed: true });
  assert.equal(m3.metadata?.rights_state, "portrait_confirmed");
});

// ============================================================
// lib/supabase/actors.ts: createActorForUser / updateActorForUser 校验
// ============================================================

test("S1: createActorForUser 在 visibility=platform 时调用 assertCanSetPlatformVisibility", async () => {
  const src = await read("../lib/supabase/actors.ts");
  assert.match(src, /import[\s\S]*?assertCanSetPlatformVisibility[\s\S]*?from "@\/lib\/actors"/);
  // createActorForUser 中应有 platform 校验块
  assert.match(src, /if \(normalized\.visibility === "platform"\)\s*{[\s\S]*?computeRightsState[\s\S]*?assertCanSetPlatformVisibility/);
});

test("S2: updateActorForUser 在 visibility=platform 时校验 rights_state", async () => {
  const src = await read("../lib/supabase/actors.ts");
  // updateActorForUser 中应有 platform 校验块
  // 提取 updateActorForUser 函数体
  const startIdx = src.indexOf("export async function updateActorForUser");
  const nextExportIdx = src.indexOf("export async function", startIdx + 10);
  const funcBody = src.slice(startIdx, nextExportIdx > 0 ? nextExportIdx : undefined);
  assert.match(funcBody, /if \(normalized\.visibility === "platform"\)/);
  assert.match(funcBody, /assertCanSetPlatformVisibility/);
  // 应保留 existing rights_state（input 未传 origin_type 时）
  assert.match(funcBody, /existingRightsState/);
});

// ============================================================
// CreateActorModal + EditActorModal: origin_type + rights_confirmed UI
// ============================================================

test("U1: CreateActorModal 含 origin_type select + rights_confirmed checkbox + visibility select", async () => {
  const src = await read("../components/actors/CreateActorModal.tsx");
  assert.match(src, /originType.*useState<ActorOriginType>\("ai_generated"\)/);
  assert.match(src, /rightsConfirmed.*useState\(false\)/);
  assert.match(src, /visibility.*useState<ActorVisibility>\("private"\)/);
  // origin_type select
  assert.match(src, /<select value=\{originType\}[\s\S]*?<option value="ai_generated">/);
  assert.match(src, /<option value="real_person">/);
  // rights_confirmed checkbox（仅在 origin_type=real_person 时显示）
  assert.match(src, /originType === "real_person"[\s\S]*?type="checkbox"[\s\S]*?rightsConfirmed/);
  // visibility select 含 platform（disabled when real_person && !rights_confirmed）
  assert.match(src, /<option value="platform" disabled=\{originType === "real_person" && !rightsConfirmed\}>/);
  // 提交时传 origin_type + rights_confirmed + visibility
  assert.match(src, /origin_type: originType/);
  assert.match(src, /rights_confirmed: rightsConfirmed/);
  assert.match(src, /visibility,/);
});

test("U2: CreateActorModal 真人未确认时禁止 platform（前端校验）", async () => {
  const src = await read("../components/actors/CreateActorModal.tsx");
  assert.match(src, /visibility === "platform" && originType === "real_person" && !rightsConfirmed/);
  assert.match(src, /copy\.portraitRightsRequired/);
});

test("U3: EditActorModal 含 origin_type + rights_confirmed + 预填 existing rights_state", async () => {
  const src = await read("../components/actors/EditActorModal.tsx");
  assert.match(src, /originType.*useState<ActorOriginType>\("ai_generated"\)/);
  assert.match(src, /rightsConfirmed.*useState\(false\)/);
  // 预填时从 existing.metadata.rights_state 推断
  assert.match(src, /existingRightsState/);
  assert.match(src, /setOriginType\(existingRightsState === "ai_generated" \? "ai_generated" : "real_person"\)/);
  assert.match(src, /setRightsConfirmed\(existingRightsState === "portrait_confirmed"\)/);
});

test("U4: EditActorModal 真人未确认时禁止 platform（前端校验）", async () => {
  const src = await read("../components/actors/EditActorModal.tsx");
  assert.match(src, /visibility === "platform" && originType === "real_person" && !rightsConfirmed/);
  assert.match(src, /copy\.portraitRightsRequired/);
});

// ============================================================
// actor-copy.ts: 中英文案
// ============================================================

test("C1: actor-copy.ts 中文肖像权文案", async () => {
  const src = await read("../components/actors/actor-copy.ts");
  assert.match(src, /originTypeLabel: "演员来源"/);
  assert.match(src, /originTypeAi: "AI 生成（默认可平台共享）"/);
  assert.match(src, /originTypeReal: "真人照片（需肖像授权确认）"/);
  assert.match(src, /portraitRightsConfirm:/);
  assert.match(src, /portraitRightsRequired: "真人照片需先确认肖像授权，才能设为平台共享。"/);
});

test("C2: actor-copy.ts 英文肖像权文案", async () => {
  const src = await read("../components/actors/actor-copy.ts");
  assert.match(src, /originTypeLabel: "Actor origin"/);
  assert.match(src, /originTypeAi: "AI-generated/);
  assert.match(src, /originTypeReal: "Real person photo/);
  assert.match(src, /portraitRightsConfirm:/);
  assert.match(src, /portraitRightsRequired: "Real person photos require portrait rights confirmation/);
});

// ============================================================
// Migration: 注释文档化
// ============================================================

test("M1: migration 20260723000000 文档化 rights_state 约束", async () => {
  const sql = await read("../supabase/migrations/20260723000000_actor_portrait_rights.sql");
  assert.match(sql, /COMMENT ON COLUMN public\.storyflow_actor_profiles\.metadata/);
  assert.match(sql, /rights_state/);
  assert.match(sql, /ai_generated/);
  assert.match(sql, /portrait_confirmed/);
  assert.match(sql, /portrait_pending/);
});

// ============================================================
// 权限矩阵对照（PRD §肖像权安全边界）
// ============================================================

test("P1: AI 生成演员默认允许 platform 共享", async () => {
  const mod = await import("../lib/actors.ts");
  // AI 生成 → rights_state=ai_generated → platform 允许
  const rs = mod.computeRightsState({ origin_type: "ai_generated" });
  mod.assertCanSetPlatformVisibility("platform", rs); // 不抛错
});

test("P2: 真人照片未确认肖像授权时禁止 platform 共享", async () => {
  const mod = await import("../lib/actors.ts");
  const rs = mod.computeRightsState({ origin_type: "real_person" });
  assert.equal(rs, "portrait_pending");
  assert.throws(
    () => mod.assertCanSetPlatformVisibility("platform", rs),
    /ACTOR_PORTRAIT_RIGHTS_REQUIRED/,
  );
});

test("P3: 真人照片确认肖像授权后允许 platform 共享", async () => {
  const mod = await import("../lib/actors.ts");
  const rs = mod.computeRightsState({ origin_type: "real_person", rights_confirmed: true });
  assert.equal(rs, "portrait_confirmed");
  mod.assertCanSetPlatformVisibility("platform", rs); // 不抛错
});

test("P4: 权利状态不影响 private/team 共享", async () => {
  const mod = await import("../lib/actors.ts");
  // portrait_pending 仍可 private/team
  mod.assertCanSetPlatformVisibility("private", "portrait_pending");
  mod.assertCanSetPlatformVisibility("team", "portrait_pending");
});

console.log("Commit 6 肖像权安全边界测试套件加载完成");
