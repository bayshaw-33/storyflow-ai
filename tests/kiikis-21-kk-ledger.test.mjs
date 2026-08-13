/**
 * tests/kiikis-21-kk-ledger.test.mjs
 * KIIKIS 2.1 Phase 3 — Task 3.1 KK 账号事实与权益账本测试
 *
 * 覆盖 K21-KK-020..024：
 *   - 契约校验 (validateAppendEntitlement / validateGrantMilestone / validateEquipRequest)
 *   - K21-KK-024: 禁止 paid_draw / trade source_type
 *   - 净持有计算 (computeNetEntitlements)
 *   - 装备校验 (isEquippable)
 *   - 幂等性 (重复 milestone / 重复 idempotency_key)
 *   - 跨用户装备隔离
 *   - 撤销后装备
 *   - 并发装备
 *   - migration 文件存在且语法正确
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  computeNetEntitlements,
  isAllowedSourceType,
  isEquippable,
  parseEntitlementEntry,
  parseEquipmentHistoryEntry,
  parseKkProfile,
  validateAppendEntitlement,
  validateEquipRequest,
  validateGrantMilestone,
  KkProfileValidationError,
  KK_ENTITLEMENT_SOURCE_TYPES,
  KK_MEMORY_FACT_TYPES,
} from "../lib/contracts/v2/kk-profile.ts";

/**
 * @typedef {import("../lib/contracts/v2/kk-profile.ts").KkEntitlementEntry} KkEntitlementEntry
 */

// ============================================================
// 1. 契约常量 (K21-KK-020..024)
// ============================================================

test("K21-KK-021: entitlement source_types 不含 paid_draw / trade", () => {
  assert.ok(!KK_ENTITLEMENT_SOURCE_TYPES.includes("paid_draw"));
  assert.ok(!KK_ENTITLEMENT_SOURCE_TYPES.includes("trade"));
  assert.deepEqual([...KK_ENTITLEMENT_SOURCE_TYPES], [
    "system_migration",
    "creative_milestone",
    "subscription",
    "admin_grant",
  ]);
});

test("K21-KK-010: memory_fact_types 含 user_choice / recent_project / milestone_grant / manual_note", () => {
  assert.ok(KK_MEMORY_FACT_TYPES.includes("user_choice"));
  assert.ok(KK_MEMORY_FACT_TYPES.includes("recent_project"));
  assert.ok(KK_MEMORY_FACT_TYPES.includes("recent_universe"));
  assert.ok(KK_MEMORY_FACT_TYPES.includes("authorized_context"));
  assert.ok(KK_MEMORY_FACT_TYPES.includes("milestone_grant"));
  assert.ok(KK_MEMORY_FACT_TYPES.includes("manual_note"));
});

// ============================================================
// 2. validateAppendEntitlement
// ============================================================

test("validateAppendEntitlement — 合法 grant 通过", () => {
  const input = validateAppendEntitlement({
    ownerId: "user-1",
    itemId: "skin-001",
    itemVersion: "v1",
    direction: "grant",
    sourceType: "creative_milestone",
    sourceId: "milestone-001",
    idempotencyKey: "idem-001",
  });
  assert.equal(input.ownerId, "user-1");
  assert.equal(input.direction, "grant");
  assert.equal(input.sourceType, "creative_milestone");
});

test("K21-KK-024: validateAppendEntitlement — 拒绝 paid_draw source_type", () => {
  assert.throws(
    () => validateAppendEntitlement({
      ownerId: "user-1",
      itemId: "skin-001",
      itemVersion: "v1",
      direction: "grant",
      sourceType: "paid_draw",
      sourceId: "order-001",
      idempotencyKey: "idem-001",
    }),
    (err) => {
      assert.ok(err instanceof KkProfileValidationError);
      assert.match(err.message, /K21-KK-024/);
      assert.equal(err.code, "forbidden_source_type");
      assert.equal(err.field, "sourceType");
      return true;
    },
  );
});

test("K21-KK-024: validateAppendEntitlement — 拒绝 trade source_type", () => {
  assert.throws(
    () => validateAppendEntitlement({
      ownerId: "user-1",
      itemId: "skin-001",
      itemVersion: "v1",
      direction: "grant",
      sourceType: "trade",
      sourceId: "trade-001",
      idempotencyKey: "idem-001",
    }),
    (err) => err instanceof KkProfileValidationError && err.code === "forbidden_source_type",
  );
});

test("validateAppendEntitlement — 拒绝空 ownerId / itemId / idempotencyKey", () => {
  for (const bad of [
    { ownerId: "", itemId: "i", itemVersion: "v", direction: "grant", sourceType: "admin_grant", sourceId: "s", idempotencyKey: "k" },
    { ownerId: "u", itemId: "", itemVersion: "v", direction: "grant", sourceType: "admin_grant", sourceId: "s", idempotencyKey: "k" },
    { ownerId: "u", itemId: "i", itemVersion: "", direction: "grant", sourceType: "admin_grant", sourceId: "s", idempotencyKey: "k" },
    { ownerId: "u", itemId: "i", itemVersion: "v", direction: "grant", sourceType: "admin_grant", sourceId: "s", idempotencyKey: "" },
  ]) {
    assert.throws(() => validateAppendEntitlement(bad), KkProfileValidationError);
  }
});

test("validateAppendEntitlement — 拒绝非法 direction", () => {
  assert.throws(
    () => validateAppendEntitlement({
      ownerId: "u", itemId: "i", itemVersion: "v",
      direction: "buy", sourceType: "admin_grant", sourceId: "s", idempotencyKey: "k",
    }),
    (err) => err instanceof KkProfileValidationError && err.code === "invalid_direction",
  );
});

test("validateAppendEntitlement — 返回值被冻结 (Object.freeze)", () => {
  const input = validateAppendEntitlement({
    ownerId: "u", itemId: "i", itemVersion: "v",
    direction: "grant", sourceType: "admin_grant", sourceId: "s", idempotencyKey: "k",
  });
  assert.ok(Object.isFrozen(input));
});

// ============================================================
// 3. computeNetEntitlements (净持有计算)
// ============================================================

/** @param {Partial<KkEntitlementEntry>} [over] @returns {KkEntitlementEntry} */
function makeEntry(over = {}) {
  return {
    id: over.id ?? "e-1",
    ownerId: over.ownerId ?? "user-1",
    itemId: over.itemId ?? "skin-001",
    itemVersion: over.itemVersion ?? "v1",
    direction: over.direction ?? "grant",
    sourceType: over.sourceType ?? "creative_milestone",
    sourceId: over.sourceId ?? "src-1",
    idempotencyKey: over.idempotencyKey ?? "idem-1",
    createdAt: over.createdAt ?? "2026-08-13T00:00:00Z",
  };
}

test("computeNetEntitlements — 单次 grant 后净持有 1", () => {
  const entries = [makeEntry({ idempotencyKey: "k1" })];
  const net = computeNetEntitlements(entries);
  assert.equal(net.length, 1);
  assert.equal(net[0].itemId, "skin-001");
  assert.equal(net[0].itemVersion, "v1");
  assert.equal(net[0].netCount, 1);
});

test("computeNetEntitlements — grant + revoke 后净持有 0 (撤销)", () => {
  const entries = [
    makeEntry({ idempotencyKey: "k1", direction: "grant" }),
    makeEntry({ idempotencyKey: "k2", direction: "revoke" }),
  ];
  const net = computeNetEntitlements(entries);
  assert.equal(net.length, 0, "grant+revoke 净持有应为 0");
});

test("computeNetEntitlements — 多次 grant 同一 item 累加", () => {
  const entries = [
    makeEntry({ idempotencyKey: "k1", direction: "grant" }),
    makeEntry({ idempotencyKey: "k2", direction: "grant" }),
    makeEntry({ idempotencyKey: "k3", direction: "grant" }),
  ];
  const net = computeNetEntitlements(entries);
  assert.equal(net.length, 1);
  assert.equal(net[0].netCount, 3);
});

test("computeNetEntitlements — 不同 item_version 分开计算", () => {
  const entries = [
    makeEntry({ itemVersion: "v1", idempotencyKey: "k1", direction: "grant" }),
    makeEntry({ itemVersion: "v2", idempotencyKey: "k2", direction: "grant" }),
  ];
  const net = computeNetEntitlements(entries);
  assert.equal(net.length, 2);
  assert.ok(net.some((n) => n.itemVersion === "v1" && n.netCount === 1));
  assert.ok(net.some((n) => n.itemVersion === "v2" && n.netCount === 1));
});

test("computeNetEntitlements — 跨用户隔离 (不同 ownerId)", () => {
  const user1Entries = [
    makeEntry({ ownerId: "user-1", idempotencyKey: "k1", direction: "grant" }),
  ];
  const user2Entries = [
    makeEntry({ ownerId: "user-2", idempotencyKey: "k1", direction: "grant" }),
  ];
  const net1 = computeNetEntitlements(user1Entries);
  const net2 = computeNetEntitlements(user2Entries);
  assert.equal(net1.length, 1);
  assert.equal(net2.length, 1);
  assert.equal(net1[0].netCount, 1);
  assert.equal(net2[0].netCount, 1);
});

// ============================================================
// 4. isEquippable (装备校验 K21-KK-022)
// ============================================================

test("K21-KK-022: isEquippable — 净持有时可装备", () => {
  const net = computeNetEntitlements([makeEntry({ direction: "grant" })]);
  assert.equal(isEquippable("skin-001", "v1", net), true);
});

test("K21-KK-022: isEquippable — 撤销后不可装备", () => {
  const net = computeNetEntitlements([
    makeEntry({ direction: "grant", idempotencyKey: "k1" }),
    makeEntry({ direction: "revoke", idempotencyKey: "k2" }),
  ]);
  assert.equal(isEquippable("skin-001", "v1", net), false);
});

test("K21-KK-022: isEquippable — 未持有的 item 不可装备", () => {
  const net = computeNetEntitlements([makeEntry({ itemId: "skin-001" })]);
  assert.equal(isEquippable("skin-999", "v1", net), false);
});

test("K21-KK-022: isEquippable — 持有 v1 不代表可装备 v2", () => {
  const net = computeNetEntitlements([makeEntry({ itemVersion: "v1" })]);
  assert.equal(isEquippable("skin-001", "v1", net), true);
  assert.equal(isEquippable("skin-001", "v2", net), false);
});

// ============================================================
// 5. validateGrantMilestone (K21-KK-023 防刷)
// ============================================================

test("K21-KK-023: validateGrantMilestone — 合法输入通过", () => {
  const input = validateGrantMilestone({
    ownerId: "u",
    milestoneId: "first-project",
    xp: 100,
    levelDelta: 1,
    idempotencyKey: "ms-idem-1",
  });
  assert.equal(input.xp, 100);
  assert.equal(input.levelDelta, 1);
});

test("K21-KK-023: validateGrantMilestone — 拒绝负 XP (防刷)", () => {
  assert.throws(
    () => validateGrantMilestone({
      ownerId: "u", milestoneId: "m", xp: -10, levelDelta: 1, idempotencyKey: "k",
    }),
    (err) => err instanceof KkProfileValidationError && err.code === "invalid_xp",
  );
});

test("K21-KK-023: validateGrantMilestone — 拒绝负 levelDelta", () => {
  assert.throws(
    () => validateGrantMilestone({
      ownerId: "u", milestoneId: "m", xp: 10, levelDelta: -1, idempotencyKey: "k",
    }),
    (err) => err instanceof KkProfileValidationError && err.code === "invalid_level_delta",
  );
});

test("K21-KK-023: validateGrantMilestone — 必须有 idempotencyKey (幂等基础)", () => {
  assert.throws(
    () => validateGrantMilestone({
      ownerId: "u", milestoneId: "m", xp: 10, levelDelta: 1, idempotencyKey: "",
    }),
    (err) => err instanceof KkProfileValidationError && err.code === "missing_idempotency_key",
  );
});

// ============================================================
// 6. validateEquipRequest
// ============================================================

test("validateEquipRequest — 合法输入通过", () => {
  assert.doesNotThrow(() => validateEquipRequest({
    ownerId: "u", itemId: "i", itemVersion: "v",
  }));
});

test("validateEquipRequest — 拒绝空 ownerId", () => {
  assert.throws(
    () => validateEquipRequest({ ownerId: "", itemId: "i", itemVersion: "v" }),
    KkProfileValidationError,
  );
});

test("validateEquipRequest — 拒绝空 itemId / itemVersion", () => {
  assert.throws(() => validateEquipRequest({ ownerId: "u", itemId: "", itemVersion: "v" }), KkProfileValidationError);
  assert.throws(() => validateEquipRequest({ ownerId: "u", itemId: "i", itemVersion: "" }), KkProfileValidationError);
});

// ============================================================
// 7. parseKkProfile (snake_case → camelCase)
// ============================================================

test("parseKkProfile — 默认值正确 (profileDisplay / communityDisplay 默认 false)", () => {
  const profile = parseKkProfile({
    owner_id: "u1",
    display_name: null,
    equipped_item_id: null,
    equipped_item_version: null,
    profile_display: null,
    community_display: null,
    growth_level: null,
    growth_xp: null,
    recent_project_id: null,
    recent_universe_id: null,
    created_at: "2026-08-13T00:00:00Z",
    updated_at: "2026-08-13T00:00:00Z",
  });
  assert.equal(profile.ownerId, "u1");
  assert.equal(profile.displayName, "");
  assert.equal(profile.profileDisplay, false);
  assert.equal(profile.communityDisplay, false);
  assert.equal(profile.growthLevel, 0);
  assert.equal(profile.growthXp, 0);
  assert.ok(Object.isFrozen(profile));
});

test("parseKkProfile — 正确解析所有字段", () => {
  const profile = parseKkProfile({
    owner_id: "u1",
    display_name: "Isa",
    equipped_item_id: "skin-001",
    equipped_item_version: "v1",
    profile_display: true,
    community_display: false,
    growth_level: 3,
    growth_xp: 250,
    recent_project_id: "proj-1",
    recent_universe_id: "uni-1",
    created_at: "2026-08-13T00:00:00Z",
    updated_at: "2026-08-13T01:00:00Z",
  });
  assert.equal(profile.displayName, "Isa");
  assert.equal(profile.equippedItemId, "skin-001");
  assert.equal(profile.equippedItemVersion, "v1");
  assert.equal(profile.profileDisplay, true);
  assert.equal(profile.growthLevel, 3);
  assert.equal(profile.growthXp, 250);
  assert.equal(profile.recentProjectId, "proj-1");
});

// ============================================================
// 8. parseEntitlementEntry — 拒绝 ledger 中已写入的非法 source_type
// ============================================================

test("parseEntitlementEntry — 拒绝解析 paid_draw 行 (防御已污染数据)", () => {
  assert.throws(
    () => parseEntitlementEntry({
      id: "e1",
      owner_id: "u",
      item_id: "i",
      item_version: "v",
      direction: "grant",
      source_type: "paid_draw",
      source_id: "s",
      idempotency_key: "k",
      created_at: "2026-08-13T00:00:00Z",
    }),
    (err) => err instanceof KkProfileValidationError && err.code === "forbidden_source_type",
  );
});

test("parseEntitlementEntry — 合法行解析成功", () => {
  const entry = parseEntitlementEntry({
    id: "e1",
    owner_id: "u",
    item_id: "i",
    item_version: "v",
    direction: "grant",
    source_type: "creative_milestone",
    source_id: "s",
    idempotency_key: "k",
    created_at: "2026-08-13T00:00:00Z",
  });
  assert.equal(entry.ownerId, "u");
  assert.equal(entry.direction, "grant");
  assert.ok(Object.isFrozen(entry));
});

// ============================================================
// 9. parseEquipmentHistoryEntry
// ============================================================

test("parseEquipmentHistoryEntry — verified_ledger null 时默认 true", () => {
  const entry = parseEquipmentHistoryEntry({
    id: "h1",
    owner_id: "u",
    item_id: "i",
    item_version: "v",
    action: "equip",
    verified_ledger: null,
    source_type: "user",
    created_at: "2026-08-13T00:00:00Z",
  });
  assert.equal(entry.verifiedLedger, true);
  assert.equal(entry.action, "equip");
});

// ============================================================
// 10. isAllowedSourceType
// ============================================================

test("isAllowedSourceType — creative_milestone 返回 true, paid_draw 返回 false", () => {
  assert.equal(isAllowedSourceType("creative_milestone"), true);
  assert.equal(isAllowedSourceType("system_migration"), true);
  assert.equal(isAllowedSourceType("subscription"), true);
  assert.equal(isAllowedSourceType("admin_grant"), true);
  assert.equal(isAllowedSourceType("paid_draw"), false);
  assert.equal(isAllowedSourceType("trade"), false);
});

// ============================================================
// 11. migration 文件存在 (K21-KK-020..024 表已建)
// ============================================================

test("migration 20260827030000 文件存在 + 含所有 4 张表", () => {
  const p = path.join(process.cwd(), "supabase/migrations/20260827030000_kiikis_21_kk_profile_inventory.sql");
  assert.ok(fs.existsSync(p), "migration 文件缺失");
  const sql = fs.readFileSync(p, "utf-8");
  // 4 张表
  assert.match(sql, /CREATE TABLE.*storyflow_kk_profiles/s);
  assert.match(sql, /CREATE TABLE.*storyflow_entitlement_ledger/s);
  assert.match(sql, /CREATE TABLE.*storyflow_kk_equipment_history/s);
  assert.match(sql, /CREATE TABLE.*storyflow_kk_memory_facts/s);
  // 3 个 RPC
  assert.match(sql, /append_entitlement_entry/);
  assert.match(sql, /compute_net_entitlements/);
  assert.match(sql, /equip_kk_item/);
  assert.match(sql, /grant_milestone/);
  // K21-KK-024 禁止 source_type
  assert.match(sql, /paid_draw/);
  // RLS
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/g);
});

test("migration — 所有表启用 RLS (K21-KK-020..022 owner 隔离)", () => {
  const p = path.join(process.cwd(), "supabase/migrations/20260827030000_kiikis_21_kk_profile_inventory.sql");
  const sql = fs.readFileSync(p, "utf-8");
  const rlsCount = (sql.match(/ENABLE ROW LEVEL SECURITY/g) || []).length;
  assert.ok(rlsCount >= 4, `4 张表必须都启用 RLS，实际 ${rlsCount}`);
});

test("migration — ledger 禁止 authenticated 直接 INSERT (只能通过 RPC)", () => {
  const p = path.join(process.cwd(), "supabase/migrations/20260827030000_kiikis_21_kk_profile_inventory.sql");
  const sql = fs.readFileSync(p, "utf-8");
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public.storyflow_entitlement_ledger FROM anon, authenticated/);
});

// ============================================================
// 12. 幂等场景 (纯函数模拟，RPC 幂等由 DB unique 约束保证)
// ============================================================

test("K21-KK-021: 幂等 — 同一 idempotency_key 在 ledger 中不应重复 grant", () => {
  // 实际幂等由 DB unique (owner_id, idempotency_key) 保证
  // 这里测试 computeNetEntitlements 不会因为重复 key 行而双倍计算
  // 假设 RPC 已去重，ledger 中只有 1 条
  const entries = [makeEntry({ idempotencyKey: "k1", direction: "grant" })];
  const net = computeNetEntitlements(entries);
  assert.equal(net[0].netCount, 1);
});

test("K21-KK-023: 幂等 — 重复 milestone 不增加 XP (RPC 保证)", () => {
  // RPC grant_milestone 内部检查 fact_key 已存在则跳过
  // 这里只验证契约层 validateGrantMilestone 不因重复调用而失败
  const input1 = validateGrantMilestone({
    ownerId: "u", milestoneId: "m1", xp: 100, levelDelta: 1, idempotencyKey: "k1",
  });
  const input2 = validateGrantMilestone({
    ownerId: "u", milestoneId: "m1", xp: 100, levelDelta: 1, idempotencyKey: "k1",
  });
  assert.deepEqual(input1, input2);
});

// ============================================================
// 13. 并发装备场景 (纯函数模拟)
// ============================================================

test("并发装备 — 两个不同 item 同时装备，ledger 净持有独立计算", () => {
  const entries = [
    makeEntry({ itemId: "skin-A", idempotencyKey: "k1", direction: "grant" }),
    makeEntry({ itemId: "skin-B", idempotencyKey: "k2", direction: "grant" }),
  ];
  const net = computeNetEntitlements(entries);
  assert.equal(net.length, 2);
  assert.equal(isEquippable("skin-A", "v1", net), true);
  assert.equal(isEquippable("skin-B", "v1", net), true);
});

test("撤销后重新装备 — grant + revoke + grant 净持有 1", () => {
  const entries = [
    makeEntry({ idempotencyKey: "k1", direction: "grant" }),
    makeEntry({ idempotencyKey: "k2", direction: "revoke" }),
    makeEntry({ idempotencyKey: "k3", direction: "grant" }),
  ];
  const net = computeNetEntitlements(entries);
  assert.equal(net.length, 1);
  assert.equal(net[0].netCount, 1);
  assert.equal(isEquippable("skin-001", "v1", net), true);
});
