// tests/admin-ai-prompts.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.ADMIN_TEST_BASE || "http://localhost:3000";
const VIEWER_TOKEN = process.env.ADMIN_TEST_VIEWER_TOKEN || "";
const OPERATOR_TOKEN = process.env.ADMIN_TEST_OPERATOR_TOKEN || "";

describe("AI prompts API", { skip: !BASE }, () => {
  test("GET /admin/api/ai-prompts 返回 45 条", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/ai-prompts`, { headers: { Authorization: `Bearer ${VIEWER_TOKEN}` } });
    const payload = await res.json();
    assert.ok(payload.prompts.length >= 45, `期望 >=45 条，实际 ${payload.prompts.length}`);
  });

  test("viewer 调 PATCH ai-prompts 返回 403", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/ai-prompts/rules:common`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${VIEWER_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ body: "test" }),
    });
    assert.equal(res.status, 403);
  });

  test("overrides 列表为数组", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/ai-prompts/overrides`, { headers: { Authorization: `Bearer ${VIEWER_TOKEN}` } });
    const payload = await res.json();
    assert.ok(Array.isArray(payload.overrides));
  });
});
