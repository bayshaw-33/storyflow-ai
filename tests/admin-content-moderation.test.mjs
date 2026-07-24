// tests/admin-content-moderation.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.ADMIN_TEST_BASE || "http://localhost:3000";
const VIEWER_TOKEN = process.env.ADMIN_TEST_VIEWER_TOKEN || "";
const OPERATOR_TOKEN = process.env.ADMIN_TEST_OPERATOR_TOKEN || "";

describe("content moderation API", { skip: !BASE }, () => {
  test("无 token 访问 reports 返回 401", async () => {
    const res = await fetch(`${BASE}/admin/api/content/reports`);
    assert.equal(res.status, 401);
  });

  test("无 token 访问 queue 返回 401", async () => {
    const res = await fetch(`${BASE}/admin/api/content/queue`);
    assert.equal(res.status, 401);
  });

  test("无 token 访问 moderate 返回 401", async () => {
    const res = await fetch(`${BASE}/admin/api/content/asset/test-id/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    assert.equal(res.status, 401);
  });

  test("viewer 可读 reports", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/content/reports?status=pending`, {
      headers: { Authorization: `Bearer ${VIEWER_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.ok(Array.isArray(payload.reports));
    assert.ok(typeof payload.total === "number");
  });

  test("viewer 可读 queue", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/content/queue`, {
      headers: { Authorization: `Bearer ${VIEWER_TOKEN}` },
    });
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.ok(Array.isArray(payload.items));
    assert.ok(typeof payload.total === "number");
  });

  test("viewer 不可 POST moderate 返回 403", async () => {
    if (!VIEWER_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/content/asset/test-id/moderate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${VIEWER_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    assert.equal(res.status, 403);
  });

  test("operator moderate 不存在的 pending 返回 404", async () => {
    if (!OPERATOR_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/content/asset/00000000-0000-0000-0000-000000000000/moderate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    assert.equal(res.status, 404);
  });

  test("operator moderate 无效 action 返回 400", async () => {
    if (!OPERATOR_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/content/asset/test-id/moderate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invalid_action" }),
    });
    assert.equal(res.status, 400);
  });

  test("operator moderate 无效 targetType 返回 400", async () => {
    if (!OPERATOR_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/content/invalid_type/test-id/moderate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    assert.equal(res.status, 400);
  });

  test("operator restore 不存在的 taken_down 返回 404", async () => {
    if (!OPERATOR_TOKEN) return;
    const res = await fetch(`${BASE}/admin/api/content/asset/00000000-0000-0000-0000-000000000000/moderate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    });
    assert.equal(res.status, 404);
  });
});
