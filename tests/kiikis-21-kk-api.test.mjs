/**
 * tests/kiikis-21-kk-api.test.mjs
 * KIIKIS 2.1 Phase 3 — Task 3.2 KK API 客户端测试
 *
 * 覆盖 K21-KK-001..007, 020..024：
 *   - fetchKkRuntime: 503 不静默切 fixture (K21-KK-002)
 *   - fetchKkRuntime: 401 → unauthenticated
 *   - fetchKkEvents: 增量事件 + nextCursor (K21-KK-003)
 *   - updateKkProfile: K21-KK-020
 *   - equipKkItem: K21-KK-022 错误处理
 *   - listEquipment / listMemory / addMemory / deleteMemory
 *   - allowedActions 含全部 12 个 action (K21-KK-006)
 *   - KkRuntimeClientError 携带 code + status
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  KkRuntimeClientError,
  fetchKkRuntime,
  fetchKkEvents,
  updateKkProfile,
  equipKkItem,
  listEquipment,
  listMemory,
  addMemory,
  deleteMemory,
} from "../lib/client/v2/kk/api.ts";
import {
  ALL_KK_ACTIONS,
  ALL_KK_CONNECTION_STATES,
  isKkAction,
} from "../lib/client/v2/kk/types.ts";

// ============================================================
// Mock fetch 工具
// ============================================================

function makeMockResponse(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  return {
    status,
    ok: init.ok ?? (status >= 200 && status < 300),
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function installMockFetch(impl) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return () => { globalThis.fetch = original; };
}

// ============================================================
// 1. fetchKkRuntime
// ============================================================

test("fetchKkRuntime — 成功响应返回完整 runtime 数据", async () => {
  const mockResp = makeMockResponse({
    success: true,
    contractVersion: "kiikis.kk-runtime/1",
    profile: { ownerId: "u1", displayName: "Isa" },
    entitlements: [{ itemId: "skin-001", itemVersion: "v1", netCount: 1 }],
    serverCursor: 42,
    taskProjection: { queued: 1, running: 2, ingesting: 0, completed: 5, failed: 0 },
    pendingConfirmations: [],
    allowedActions: [...ALL_KK_ACTIONS],
    featureFlags: { kkRealtime: true },
  });
  const restore = installMockFetch(async () => mockResp);

  try {
    const result = await fetchKkRuntime("token-123");
    assert.equal(result.contractVersion, "kiikis.kk-runtime/1");
    assert.equal(result.serverCursor, 42);
    assert.equal(result.taskProjection.running, 2);
    assert.equal(result.allowedActions.length, ALL_KK_ACTIONS.length);
    assert.equal(result.source, "api");
  } finally {
    restore();
  }
});

test("K21-KK-002: fetchKkRuntime — 503 抛 service_unavailable (不静默切 fixture)", async () => {
  const mockResp = makeMockResponse(
    { success: false, error: "KK service not configured.", code: "service_unavailable" },
    { status: 503, ok: false },
  );
  const restore = installMockFetch(async () => mockResp);

  try {
    await assert.rejects(
      fetchKkRuntime("token-123"),
      (err) => {
        assert.ok(err instanceof KkRuntimeClientError);
        assert.equal(err.code, "service_unavailable");
        assert.equal(err.status, 503);
        assert.match(err.message, /K21-KK-002/);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test("fetchKkRuntime — 401 抛 unauthenticated", async () => {
  const mockResp = makeMockResponse(
    { success: false, error: "Unauthorized" },
    { status: 401, ok: false },
  );
  const restore = installMockFetch(async () => mockResp);

  try {
    await assert.rejects(
      fetchKkRuntime(null),
      (err) => {
        assert.ok(err instanceof KkRuntimeClientError);
        assert.equal(err.code, "unauthenticated");
        assert.equal(err.status, 401);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test("fetchKkRuntime — success=false 抛 service_unavailable", async () => {
  const mockResp = makeMockResponse(
    { success: false, error: "Internal error" },
    { status: 500, ok: false },
  );
  const restore = installMockFetch(async () => mockResp);

  try {
    await assert.rejects(
      fetchKkRuntime("token"),
      (err) => err instanceof KkRuntimeClientError && err.code === "service_unavailable",
    );
  } finally {
    restore();
  }
});

test("fetchKkRuntime — 缺失字段时使用默认值 (向后兼容)", async () => {
  const mockResp = makeMockResponse({
    success: true,
    contractVersion: "kiikis.kk-runtime/1",
    profile: { ownerId: "u1" },
    // entitlements/serverCursor/taskProjection/pendingConfirmations 缺失
  });
  const restore = installMockFetch(async () => mockResp);

  try {
    const result = await fetchKkRuntime("token");
    assert.deepEqual([...result.entitlements], []);
    assert.equal(result.serverCursor, 0);
    assert.equal(result.taskProjection.queued, 0);
    assert.equal(result.taskProjection.running, 0);
    assert.deepEqual([...result.pendingConfirmations], []);
    assert.deepEqual([...result.allowedActions], []);
  } finally {
    restore();
  }
});

// ============================================================
// 2. fetchKkEvents (K21-KK-003)
// ============================================================

test("K21-KK-003: fetchKkEvents — 返回增量事件 + nextCursor", async () => {
  const mockResp = makeMockResponse({
    success: true,
    events: [
      { id: "e1", sequence: 11, eventType: "task_running", resourceType: "job", resourceId: "job-1", taskId: "t1", occurredAt: "2026-08-13T00:00:01Z", payload: {} },
      { id: "e2", sequence: 12, eventType: "task_completed", resourceType: "job", resourceId: "job-1", taskId: "t1", occurredAt: "2026-08-13T00:00:02Z", payload: {} },
    ],
    nextCursor: 12,
  });
  const restore = installMockFetch(async () => mockResp);

  try {
    const result = await fetchKkEvents("token", { afterSequence: 10 });
    assert.equal(result.events.length, 2);
    assert.equal(result.events[0].sequence, 11);
    assert.equal(result.events[1].sequence, 12);
    assert.equal(result.nextCursor, 12);
  } finally {
    restore();
  }
});

test("fetchKkEvents — 无新事件时 nextCursor 不变", async () => {
  const mockResp = makeMockResponse({
    success: true,
    events: [],
    nextCursor: 10,
  });
  const restore = installMockFetch(async () => mockResp);

  try {
    const result = await fetchKkEvents("token", { afterSequence: 10 });
    assert.equal(result.events.length, 0);
    assert.equal(result.nextCursor, 10);
  } finally {
    restore();
  }
});

test("fetchKkEvents — limit 限制为 [1, 500]", async () => {
  let capturedUrl = "";
  const mockResp = makeMockResponse({ success: true, events: [], nextCursor: 0 });
  const restore = installMockFetch(async (url) => {
    capturedUrl = url;
    return mockResp;
  });

  try {
    await fetchKkEvents("token", { afterSequence: 0, limit: 9999 });
    assert.match(capturedUrl, /limit=500/);

    await fetchKkEvents("token", { afterSequence: 0, limit: 0 });
    assert.match(capturedUrl, /limit=1/);
  } finally {
    restore();
  }
});

// ============================================================
// 3. updateKkProfile (K21-KK-020)
// ============================================================

test("K21-KK-020: updateKkProfile — 成功更新返回新 profile", async () => {
  const mockResp = makeMockResponse({
    success: true,
    profile: { ownerId: "u1", displayName: "新名字", profileDisplay: true },
  });
  const restore = installMockFetch(async () => mockResp);

  try {
    const profile = await updateKkProfile("token", { displayName: "新名字", profileDisplay: true });
    assert.equal(profile.displayName, "新名字");
    assert.equal(profile.profileDisplay, true);
  } finally {
    restore();
  }
});

test("updateKkProfile — 失败抛 KkRuntimeClientError", async () => {
  const mockResp = makeMockResponse(
    { success: false, error: "Update failed" },
    { status: 500, ok: false },
  );
  const restore = installMockFetch(async () => mockResp);

  try {
    await assert.rejects(
      updateKkProfile("token", { displayName: "x" }),
      KkRuntimeClientError,
    );
  } finally {
    restore();
  }
});

// ============================================================
// 4. equipKkItem (K21-KK-022)
// ============================================================

test("K21-KK-022: equipKkItem — 成功装备", async () => {
  const mockResp = makeMockResponse({ success: true, equipped: { itemId: "skin-001", itemVersion: "v1" } });
  const restore = installMockFetch(async () => mockResp);

  try {
    await equipKkItem("token", "skin-001", "v1");
    // 不抛即成功
  } finally {
    restore();
  }
});

test("K21-KK-022: equipKkItem — 净持有不足抛 equip_denied", async () => {
  const mockResp = makeMockResponse(
    { success: false, error: "item not in net entitlements (K21-KK-022)" },
    { status: 403, ok: false },
  );
  const restore = installMockFetch(async () => mockResp);

  try {
    await assert.rejects(
      equipKkItem("token", "skin-999", "v1"),
      (err) => err instanceof KkRuntimeClientError && err.code === "equip_denied",
    );
  } finally {
    restore();
  }
});

// ============================================================
// 5. listEquipment / listMemory / addMemory / deleteMemory
// ============================================================

test("listEquipment — 返回净持有 + 装备历史", async () => {
  const mockResp = makeMockResponse({
    success: true,
    entitlements: [{ itemId: "skin-001", itemVersion: "v1", netCount: 1 }],
    equipmentHistory: [{ id: "h1", action: "equip", itemId: "skin-001" }],
  });
  const restore = installMockFetch(async () => mockResp);

  try {
    const result = await listEquipment("token");
    assert.equal(result.entitlements.length, 1);
    assert.equal(result.equipmentHistory.length, 1);
  } finally {
    restore();
  }
});

test("K21-KK-010: listMemory — 返回陪伴上下文记忆", async () => {
  const mockResp = makeMockResponse({
    success: true,
    facts: [
      { id: "f1", factType: "user_choice", factKey: "theme", factValue: { value: "noir" } },
      { id: "f2", factType: "recent_project", factKey: "proj-1", factValue: { name: "EP25" } },
    ],
  });
  const restore = installMockFetch(async () => mockResp);

  try {
    const facts = await listMemory("token", { factType: "user_choice" });
    assert.equal(facts.length, 2);
  } finally {
    restore();
  }
});

test("K21-KK-010: addMemory — 成功添加记忆", async () => {
  const mockResp = makeMockResponse({
    success: true,
    fact: { id: "f1", factType: "user_choice", factKey: "theme", factValue: { value: "noir" } },
  }, { status: 201 });
  const restore = installMockFetch(async () => mockResp);

  try {
    const fact = await addMemory("token", {
      factType: "user_choice",
      factKey: "theme",
      factValue: { value: "noir" },
    });
    assert.equal(fact.id, "f1");
  } finally {
    restore();
  }
});

test("K21-KK-014: deleteMemory — 成功删除记忆", async () => {
  const mockResp = makeMockResponse({ success: true, deleted: "f1" });
  const restore = installMockFetch(async () => mockResp);

  try {
    await deleteMemory("token", "f1");
    // 不抛即成功
  } finally {
    restore();
  }
});

// ============================================================
// 6. KkAction 契约 (K21-KK-006)
// ============================================================

test("K21-KK-006: ALL_KK_ACTIONS 含 12 个 action (open_task..delete_memory)", () => {
  assert.equal(ALL_KK_ACTIONS.length, 12);
  assert.ok(ALL_KK_ACTIONS.includes("open_task"));
  assert.ok(ALL_KK_ACTIONS.includes("open_project"));
  assert.ok(ALL_KK_ACTIONS.includes("open_universe"));
  assert.ok(ALL_KK_ACTIONS.includes("propose_action"));
  assert.ok(ALL_KK_ACTIONS.includes("confirm_action"));
  assert.ok(ALL_KK_ACTIONS.includes("cancel_action"));
  assert.ok(ALL_KK_ACTIONS.includes("equip_item"));
  assert.ok(ALL_KK_ACTIONS.includes("unequip_item"));
  assert.ok(ALL_KK_ACTIONS.includes("update_profile"));
  assert.ok(ALL_KK_ACTIONS.includes("update_privacy"));
  assert.ok(ALL_KK_ACTIONS.includes("export_memory"));
  assert.ok(ALL_KK_ACTIONS.includes("delete_memory"));
});

test("K21-KK-006: isKkAction — 合法 action 返回 true, 非法返回 false", () => {
  assert.equal(isKkAction("open_task"), true);
  assert.equal(isKkAction("equip_item"), true);
  assert.equal(isKkAction("delete_memory"), true);
  assert.equal(isKkAction("random_thing"), false);
  assert.equal(isKkAction(""), false);
});

test("ALL_KK_CONNECTION_STATES — 含 5 个状态 (K21-KK-003/004)", () => {
  assert.equal(ALL_KK_CONNECTION_STATES.length, 5);
  assert.ok(ALL_KK_CONNECTION_STATES.includes("connecting"));
  assert.ok(ALL_KK_CONNECTION_STATES.includes("live"));
  assert.ok(ALL_KK_CONNECTION_STATES.includes("reconnecting"));
  assert.ok(ALL_KK_CONNECTION_STATES.includes("polling"));
  assert.ok(ALL_KK_CONNECTION_STATES.includes("offline"));
});

// ============================================================
// 7. KkRuntimeClientError
// ============================================================

test("KkRuntimeClientError — 携带 code + status 字段", () => {
  const err = new KkRuntimeClientError("service_unavailable", "msg", 503);
  assert.equal(err.code, "service_unavailable");
  assert.equal(err.status, 503);
  assert.equal(err.name, "KkRuntimeClientError");
  assert.ok(err instanceof Error);
});

// ============================================================
// 8. API route 文件存在
// ============================================================

test("5 个 KK API route 文件存在", () => {
  const routes = [
    "app/api/v2/kk/route.ts",
    "app/api/v2/kk/events/route.ts",
    "app/api/v2/kk/profile/route.ts",
    "app/api/v2/kk/equipment/route.ts",
    "app/api/v2/kk/memory/route.ts",
  ];
  for (const r of routes) {
    assert.ok(fs.existsSync(path.join(process.cwd(), r)), `route 文件缺失: ${r}`);
  }
});
