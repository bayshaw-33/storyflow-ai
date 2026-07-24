// tests/admin-audit.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.ADMIN_TEST_BASE || "http://localhost:3000";
const SUPER_ADMIN_TOKEN = process.env.ADMIN_TEST_SUPER_ADMIN_TOKEN || "";
const OPERATOR_TOKEN = process.env.ADMIN_TEST_OPERATOR_TOKEN || "";

describe("审计日志 API", { skip: !BASE }, () => {
  test("super_admin 可读 /admin/api/audit-log", async () => {
    if (!SUPER_ADMIN_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/audit-log`, { headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` } });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.ok(Array.isArray(payload.logs));
  });

  test("operator 访问 /admin/api/audit-log 返回 403", async () => {
    if (!OPERATOR_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/audit-log`, { headers: { Authorization: `Bearer ${OPERATOR_TOKEN}` } });
    assert.equal(res.status, 403);
  });
});
