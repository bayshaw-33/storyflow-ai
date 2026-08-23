// tests/admin-stats.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// 集成测试：仅在显式提供 ADMIN_TEST_BASE（如本地 dev server）时运行；
// 无服务器环境下 skip，不再因默认 localhost:3000 产生 ECONNREFUSED 假失败。
const BASE = process.env.ADMIN_TEST_BASE || "";
const VIEWER_TOKEN = process.env.ADMIN_TEST_VIEWER_TOKEN || "";
const SUPER_ADMIN_TOKEN = process.env.ADMIN_TEST_SUPER_ADMIN_TOKEN || "";

describe("stats API", { skip: !BASE }, () => {
  test("无 token 访问 /admin/api/stats 返回 401", async () => {
    const res = await fetch(`${BASE}/admin/api/stats`);
    assert.equal(res.status, 401);
  });

  test("viewer 可读 stats，admin 字段为 null", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/stats?range=7`, {
      headers: { Authorization: `Bearer ${VIEWER_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.ok(payload.users, "users 模块应存在");
    assert.ok(payload.generations, "generations 模块应存在");
    assert.ok(payload.credits, "credits 模块应存在");
    assert.ok(payload.content, "content 模块应存在");
    assert.equal(payload.admin, null, "viewer 的 admin 字段应为 null");
  });

  test("super_admin 可读 admin 字段", async () => {
    if (!SUPER_ADMIN_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/stats?range=7`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.ok(payload.admin, "super_admin 的 admin 字段应存在");
    assert.ok(typeof payload.admin.adminCount === "number");
  });

  test("range=30 返回 30 天趋势", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/stats?range=30`, {
      headers: { Authorization: `Bearer ${VIEWER_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.users.registrationTrend.length, 30, "30 天趋势应有 30 个点");
    assert.equal(payload.generations.generationTrend.length, 30);
  });

  test("range 非法值回退 7 天", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/stats?range=abc`, {
      headers: { Authorization: `Bearer ${VIEWER_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.users.registrationTrend.length, 7, "非法 range 应回退 7 天");
  });
});
