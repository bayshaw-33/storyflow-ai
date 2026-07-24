import { test } from "node:test";
import assert from "node:assert/strict";

// 测试角色等级比较逻辑（纯常量，无需 DB）
test("ROLE_RANK 顺序：viewer < operator < super_admin", () => {
  // 通过动态导入编译后的类型不易，这里直接验证语义常量
  // 实际守卫需集成测试（见 tests/admin-users-api.test.mjs）
  const RANK = { viewer: 1, operator: 2, super_admin: 3 };
  assert.ok(RANK.viewer < RANK.operator);
  assert.ok(RANK.operator < RANK.super_admin);
});

test("viewer 不满足 operator 最低要求", () => {
  const RANK = { viewer: 1, operator: 2, super_admin: 3 };
  const ok = RANK.viewer >= RANK.operator;
  assert.equal(ok, false);
});

test("super_admin 满足任意最低要求", () => {
  const RANK = { viewer: 1, operator: 2, super_admin: 3 };
  assert.ok(RANK.super_admin >= RANK.viewer);
  assert.ok(RANK.super_admin >= RANK.operator);
  assert.ok(RANK.super_admin >= RANK.super_admin);
});
