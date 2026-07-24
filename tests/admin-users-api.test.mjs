// tests/admin-users-api.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.ADMIN_TEST_BASE || "http://localhost:3000";
const NO_ROLE_TOKEN = process.env.ADMIN_TEST_NO_ROLE_TOKEN || ""; // 有登录但非 admin
const VIEWER_TOKEN = process.env.ADMIN_TEST_VIEWER_TOKEN || "";
const OPERATOR_TOKEN = process.env.ADMIN_TEST_OPERATOR_TOKEN || "";

// 无 token / 无角色 / viewer 调写接口 的守卫
describe("admin API 守卫", { skip: !BASE }, () => {
  test("无 token 访问 /admin/api/me 返回 401", async () => {
    const res = await fetch(`${BASE}/admin/api/me`);
    assert.equal(res.status, 401);
  });

  test("无 admin 角色访问 /admin/api/me 返回 403", async () => {
    if (!NO_ROLE_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/me`, { headers: { Authorization: `Bearer ${NO_ROLE_TOKEN}` } });
    assert.equal(res.status, 403);
  });

  test("viewer 调 PATCH /admin/api/users/:id 返回 403", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/users/00000000-0000-0000-0000-000000000000`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${VIEWER_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "test" }),
    });
    assert.equal(res.status, 403);
  });

  test("viewer 可读 /admin/api/users", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/users`, { headers: { Authorization: `Bearer ${VIEWER_TOKEN}` } });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.ok(Array.isArray(payload.users));
  });

  test("非 super_admin 访问 /admin/api/admins 返回 403", async () => {
    if (!OPERATOR_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/admins`, { headers: { Authorization: `Bearer ${OPERATOR_TOKEN}` } });
    assert.equal(res.status, 403);
  });
});
