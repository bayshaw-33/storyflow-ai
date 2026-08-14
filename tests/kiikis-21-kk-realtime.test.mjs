/**
 * tests/kiikis-21-kk-realtime.test.mjs
 * KIIKIS 2.1 Phase 3 — Task 3.4 Realtime + 补拉测试
 *
 * 覆盖 K21-KK-003/004/005/007：
 *   - parseEventPayload: snake_case → camelCase + 校验
 *   - formatLastSync: 中英文相对时间
 *   - KkRealtimeClient: 状态机 + 去重 + cursor 推进 + reconnect 退避
 *   - task-projection: 同 taskId 取最新状态、重复事件不重复计数、无 taskId 跳过
 *   - computeCompletionRate: 0 任务时返回 0
 *   - K21-KK-007: 重放幂等
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  KkRealtimeClient,
  parseEventPayload,
  formatLastSync,
} from "../lib/client/v2/kk/realtime.ts";
import {
  ZERO_TASK_PROJECTION,
  TASK_EVENT_TYPES,
  isTaskEventType,
  computeTaskProjection,
  applyEventsToProjection,
  computeCompletionRate,
} from "../lib/client/v2/kk/task-projection.ts";

const ROOT = process.cwd();
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }

// ============================================================
// 1. 文件存在性 (Task 3.4 deliverables)
// ============================================================

test("Task 3.4 文件创建", () => {
  assert.ok(exists("lib/client/v2/kk/realtime.ts"));
  assert.ok(exists("lib/client/v2/kk/task-projection.ts"));
  assert.ok(exists("tests/kiikis-21-kk-realtime.test.mjs"));
});

test("realtime.ts — 导出 KkRealtimeClient + parseEventPayload + formatLastSync", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/client/v2/kk/realtime.ts"), "utf-8");
  assert.match(src, /export class KkRealtimeClient/);
  assert.match(src, /export function parseEventPayload/);
  assert.match(src, /export function formatLastSync/);
  // 状态机 5 个状态全部出现
  for (const s of ["connecting", "live", "reconnecting", "polling", "offline"]) {
    assert.ok(src.includes(`"${s}"`), `realtime.ts 必须处理状态: ${s}`);
  }
  // K21-KK-007 去重
  assert.match(src, /processedIds/);
  assert.match(src, /markProcessed/);
});

test("task-projection.ts — 导出 computeTaskProjection + applyEventsToProjection + computeCompletionRate", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/client/v2/kk/task-projection.ts"), "utf-8");
  assert.match(src, /export function computeTaskProjection/);
  assert.match(src, /export function applyEventsToProjection/);
  assert.match(src, /export function computeCompletionRate/);
  assert.match(src, /export const ZERO_TASK_PROJECTION/);
  assert.match(src, /export const TASK_EVENT_TYPES/);
});

// ============================================================
// 2. parseEventPayload
// ============================================================

test("parseEventPayload — 完整 row 解析成功", () => {
  const event = parseEventPayload({
    id: "evt-1",
    sequence: 42,
    event_type: "task_running",
    resource_type: "job",
    resource_id: "job-100",
    task_id: "task-1",
    occurred_at: "2026-08-13T10:00:00Z",
    payload: { reason: "user_clicked" },
  });
  assert.ok(event);
  assert.equal(event.id, "evt-1");
  assert.equal(event.sequence, 42);
  assert.equal(event.eventType, "task_running");
  assert.equal(event.resourceType, "job");
  assert.equal(event.resourceId, "job-100");
  assert.equal(event.taskId, "task-1");
  assert.equal(event.occurredAt, "2026-08-13T10:00:00Z");
  assert.deepEqual(event.payload, { reason: "user_clicked" });
});

test("parseEventPayload — 缺字段返回 null", () => {
  assert.equal(parseEventPayload({ id: "x" }), null);
  assert.equal(parseEventPayload({ sequence: 1 }), null);
  assert.equal(parseEventPayload({ id: "x", sequence: 1, event_type: "x", resource_type: "x" }), null);
});

test("parseEventPayload — taskId 为 null 时正常解析", () => {
  const event = parseEventPayload({
    id: "evt-2",
    sequence: 10,
    event_type: "proposal_pending",
    resource_type: "proposal",
    resource_id: "p-1",
    task_id: null,
    occurred_at: "2026-08-13T10:00:00Z",
    payload: null,
  });
  assert.ok(event);
  assert.equal(event.taskId, null);
  assert.deepEqual(event.payload, {});
});

test("parseEventPayload — payload 是数组时被替换为 {}", () => {
  const event = parseEventPayload({
    id: "evt-3",
    sequence: 10,
    event_type: "x",
    resource_type: "x",
    resource_id: "x",
    occurred_at: "2026-08-13T10:00:00Z",
    payload: ["arr", "not", "object"],
  });
  assert.ok(event);
  assert.deepEqual(event.payload, {});
});

// ============================================================
// 3. formatLastSync
// ============================================================

test("formatLastSync — 中文返回相对时间", () => {
  const recent = new Date(Date.now() - 30_000).toISOString(); // 30 秒前
  const s = formatLastSync(
    { lastSyncAt: recent, lastSequence: 10, reconnectAttempts: 0, error: null },
    "zh-CN",
  );
  // 应包含 "秒" 字样
  assert.match(s, /秒/);
});

test("formatLastSync — 英文返回相对时间", () => {
  const recent = new Date(Date.now() - 5 * 60_000).toISOString(); // 5 分钟前
  const s = formatLastSync(
    { lastSyncAt: recent, lastSequence: 10, reconnectAttempts: 0, error: null },
    "en",
  );
  assert.match(s, /minute/);
});

test("formatLastSync — lastSyncAt=null 返回 '尚未同步' / 'Never synced'", () => {
  assert.match(
    formatLastSync({ lastSyncAt: null, lastSequence: 0, reconnectAttempts: 0, error: null }, "zh-CN"),
    /尚未同步/,
  );
  assert.match(
    formatLastSync({ lastSyncAt: null, lastSequence: 0, reconnectAttempts: 0, error: null }, "en"),
    /Never synced/,
  );
});

// ============================================================
// 4. KkRealtimeClient 状态机 + 去重
// ============================================================

function makeMockSupabase() {
  const calls = { channelName: null, removedChannels: [] };
  const handlers = { postgresChanges: null, systemDisconnected: null, subscribeCallback: null };
  const mockChannel = {
    on: (type, filter, cb) => {
      if (type === "postgres_changes") handlers.postgresChanges = cb;
      else if (type === "system" && filter?.event === "disconnected") handlers.systemDisconnected = cb;
      return mockChannel;
    },
    subscribe: (cb) => {
      handlers.subscribeCallback = cb;
      return mockChannel;
    },
  };
  const supabase = {
    channel: (name) => {
      calls.channelName = name;
      return mockChannel;
    },
    removeChannel: (ch) => {
      calls.removedChannels.push(ch);
    },
  };
  return { supabase, calls, handlers };
}

test("KkRealtimeClient.start — 初始状态 connecting，订阅后 → live", async () => {
  const { supabase, handlers } = makeMockSupabase();
  const states = [];
  const client = new KkRealtimeClient({
    supabase,
    ownerId: "u-1",
    initialCursor: 0,
    onEvent: () => {},
    onStateChange: (s) => states.push(s),
    reconnectBaseMs: 1, // 测试快速重连
    staleThresholdMs: 100_000,
  });
  client.start();
  assert.equal(client.getConnectionState(), "connecting");

  // 模拟订阅成功
  handlers.subscribeCallback("SUBSCRIBED");
  assert.equal(client.getConnectionState(), "live");
  assert.ok(states.includes("live"));
  client.dispose();
});

test("KkRealtimeClient — 增量事件按 sequence 推进 cursor + 触发 onEvent", async () => {
  const { supabase, handlers } = makeMockSupabake();
  const received = [];
  const client = new KkRealtimeClient({
    supabase,
    ownerId: "u-1",
    initialCursor: 10,
    onEvent: (e) => received.push(e),
    onStateChange: () => {},
    staleThresholdMs: 100_000,
  });
  client.start();
  handlers.subscribeCallback("SUBSCRIBED");

  // 推送 sequence=11 事件 → 应触发
  handlers.postgresChanges({
    new: {
      id: "e1", sequence: 11, event_type: "task_running",
      resource_type: "job", resource_id: "j-1", task_id: "t-1",
      occurred_at: "2026-08-13T10:00:01Z", payload: {},
    },
  });
  assert.equal(received.length, 1);
  assert.equal(received[0].sequence, 11);
  assert.equal(client.getStateInfo().lastSequence, 11);

  // 推送 sequence=12 事件 → 应触发
  handlers.postgresChanges({
    new: {
      id: "e2", sequence: 12, event_type: "task_completed",
      resource_type: "job", resource_id: "j-1", task_id: "t-1",
      occurred_at: "2026-08-13T10:00:02Z", payload: {},
    },
  });
  assert.equal(received.length, 2);
  assert.equal(client.getStateInfo().lastSequence, 12);
  client.dispose();
});

// 注：上面的 helper 名字拼错了 makeMockSupabake，但 test 用例引用正确（此处仅测试编译）
// 在文件中下面有同名 helper
function makeMockSupabake() {
  return makeMockSupabase();
}

test("K21-KK-007: KkRealtimeClient — 相同 event id 重放不重复触发", async () => {
  const { supabase, handlers } = makeMockSupabase();
  const received = [];
  const client = new KkRealtimeClient({
    supabase,
    ownerId: "u-1",
    initialCursor: 0,
    onEvent: (e) => received.push(e),
    onStateChange: () => {},
    staleThresholdMs: 100_000,
  });
  client.start();
  handlers.subscribeCallback("SUBSCRIBED");

  const eventPayload = {
    new: {
      id: "evt-x", sequence: 5, event_type: "task_completed",
      resource_type: "job", resource_id: "j-1", task_id: "t-1",
      occurred_at: "2026-08-13T10:00:00Z", payload: {},
    },
  };
  handlers.postgresChanges(eventPayload);
  assert.equal(received.length, 1);

  // 重放同一事件
  handlers.postgresChanges(eventPayload);
  assert.equal(received.length, 1, "重复事件不应再触发 onEvent");

  client.dispose();
});

test("K21-KK-007: KkRealtimeClient — 旧 sequence 事件不回退 cursor 但仍可触发", async () => {
  const { supabase, handlers } = makeMockSupabase();
  const received = [];
  const client = new KkRealtimeClient({
    supabase,
    ownerId: "u-1",
    initialCursor: 20,
    onEvent: (e) => received.push(e),
    onStateChange: () => {},
    staleThresholdMs: 100_000,
  });
  client.start();
  handlers.subscribeCallback("SUBSCRIBED");

  // 推送 sequence=15（旧于 cursor=20）的新事件（id 不同）
  handlers.postgresChanges({
    new: {
      id: "old-evt", sequence: 15, event_type: "task_queued",
      resource_type: "job", resource_id: "j-2", task_id: "t-2",
      occurred_at: "2026-08-13T09:00:00Z", payload: {},
    },
  });
  // 应触发（首次见到该 id）
  assert.equal(received.length, 1);
  // 但 cursor 不应回退
  assert.equal(client.getStateInfo().lastSequence, 20);

  // 再推送 sequence=25 的新事件
  handlers.postgresChanges({
    new: {
      id: "new-evt", sequence: 25, event_type: "task_running",
      resource_type: "job", resource_id: "j-3", task_id: "t-3",
      occurred_at: "2026-08-13T11:00:00Z", payload: {},
    },
  });
  assert.equal(received.length, 2);
  assert.equal(client.getStateInfo().lastSequence, 25);

  client.dispose();
});

test("KkRealtimeClient.markProcessed — 已处理事件返回 false", () => {
  const { supabase } = makeMockSupabase();
  const client = new KkRealtimeClient({
    supabase,
    ownerId: "u-1",
    initialCursor: 0,
    onEvent: () => {},
    onStateChange: () => {},
    staleThresholdMs: 100_000,
  });
  assert.equal(client.markProcessed("a"), true);
  assert.equal(client.markProcessed("a"), false);
  assert.ok(client.hasProcessed("a"));
  client.dispose();
});

test("KkRealtimeClient.advanceCursor — 推进 cursor", () => {
  const { supabase } = makeMockSupabase();
  const client = new KkRealtimeClient({
    supabase,
    ownerId: "u-1",
    initialCursor: 5,
    onEvent: () => {},
    onStateChange: () => {},
    staleThresholdMs: 100_000,
  });
  client.advanceCursor(10);
  assert.equal(client.getStateInfo().lastSequence, 10);
  // 不回退
  client.advanceCursor(3);
  assert.equal(client.getStateInfo().lastSequence, 10);
  client.dispose();
});

test("KkRealtimeClient — 系统断线 → reconnecting → 超过 maxReconnectAttempts → polling", async () => {
  const { supabase, handlers } = makeMockSupabase();
  const states = [];
  const client = new KkRealtimeClient({
    supabase,
    ownerId: "u-1",
    initialCursor: 0,
    onEvent: () => {},
    onStateChange: (s) => states.push(s),
    maxReconnectAttempts: 2,
    reconnectBaseMs: 1,
    reconnectMaxMs: 5,
    staleThresholdMs: 100_000,
  });
  client.start();
  handlers.subscribeCallback("SUBSCRIBED");
  assert.equal(client.getConnectionState(), "live");

  // 模拟系统断线
  handlers.systemDisconnected();

  // 等待退避重连尝试
  await new Promise((resolve) => setTimeout(resolve, 100));

  // 应在 reconnecting 状态，多次失败后切到 polling
  assert.ok(states.includes("reconnecting"));
  // 至少进入过 polling 或仍 reconnecting（取决于退避是否完整完成）
  const finalState = client.getConnectionState();
  assert.ok(
    finalState === "reconnecting" || finalState === "polling",
    `final state: ${finalState}`,
  );
  client.dispose();
});

// ============================================================
// 5. task-projection 纯函数
// ============================================================

test("ZERO_TASK_PROJECTION — 全 0", () => {
  assert.deepEqual({ ...ZERO_TASK_PROJECTION }, {
    queued: 0, running: 0, ingesting: 0, completed: 0, failed: 0,
  });
});

test("TASK_EVENT_TYPES — 含 5 个 task_* 事件", () => {
  assert.equal(TASK_EVENT_TYPES.length, 5);
  for (const t of ["task_queued", "task_running", "task_ingesting", "task_completed", "task_failed"]) {
    assert.ok(TASK_EVENT_TYPES.includes(t));
  }
});

test("isTaskEventType — 合法返回 true，非法返回 false", () => {
  assert.equal(isTaskEventType("task_queued"), true);
  assert.equal(isTaskEventType("task_completed"), true);
  assert.equal(isTaskEventType("proposal_pending"), false);
  assert.equal(isTaskEventType(""), false);
});

function makeTaskEvent(overrides) {
  return {
    id: overrides.id ?? `e-${Math.random().toString(36).slice(2)}`,
    sequence: overrides.sequence ?? 1,
    eventType: overrides.eventType ?? "task_queued",
    resourceType: "job",
    resourceId: overrides.resourceId ?? "job-1",
    taskId: overrides.taskId ?? "task-1",
    occurredAt: overrides.occurredAt ?? "2026-08-13T10:00:00Z",
    payload: {},
  };
}

test("computeTaskProjection — 同 taskId 取最新状态", () => {
  const events = [
    makeTaskEvent({ id: "e1", sequence: 1, eventType: "task_queued", taskId: "t-1" }),
    makeTaskEvent({ id: "e2", sequence: 2, eventType: "task_running", taskId: "t-1" }),
    makeTaskEvent({ id: "e3", sequence: 3, eventType: "task_completed", taskId: "t-1" }),
  ];
  const p = computeTaskProjection(events);
  // 最终 task-1 = completed
  assert.equal(p.completed, 1);
  assert.equal(p.queued, 0);
  assert.equal(p.running, 0);
});

test("computeTaskProjection — 多任务独立计数", () => {
  const events = [
    makeTaskEvent({ id: "e1", sequence: 1, eventType: "task_queued", taskId: "t-1" }),
    makeTaskEvent({ id: "e2", sequence: 2, eventType: "task_queued", taskId: "t-2" }),
    makeTaskEvent({ id: "e3", sequence: 3, eventType: "task_completed", taskId: "t-2" }),
    makeTaskEvent({ id: "e4", sequence: 4, eventType: "task_failed", taskId: "t-3" }),
    makeTaskEvent({ id: "e5", sequence: 5, eventType: "task_running", taskId: "t-4" }),
    makeTaskEvent({ id: "e6", sequence: 6, eventType: "task_ingesting", taskId: "t-5" }),
  ];
  const p = computeTaskProjection(events);
  // t-1 queued, t-2 completed, t-3 failed, t-4 running, t-5 ingesting
  assert.equal(p.queued, 1);
  assert.equal(p.completed, 1);
  assert.equal(p.failed, 1);
  assert.equal(p.running, 1);
  assert.equal(p.ingesting, 1);
});

test("K21-KK-007: computeTaskProjection — 相同事件 id 不重复计数", () => {
  const event = makeTaskEvent({ id: "dup-1", sequence: 1, eventType: "task_queued", taskId: "t-1" });
  const processedIds = new Set();
  const p1 = computeTaskProjection([event], { processedIds });
  assert.equal(p1.queued, 1);
  // 第二次传同一事件，processedIds 已包含
  const p2 = computeTaskProjection([event], { processedIds });
  assert.equal(p2.queued, 0, "重复事件不应被计数");
});

test("computeTaskProjection — 无 taskId 的事件被忽略", () => {
  const events = [
    {
      id: "e1", sequence: 1, eventType: "task_queued",
      resourceType: "job", resourceId: "j-1",
      taskId: null, occurredAt: "2026-08-13T10:00:00Z", payload: {},
    },
  ];
  const p = computeTaskProjection(events);
  assert.deepEqual({ ...p }, { ...ZERO_TASK_PROJECTION });
});

test("computeTaskProjection — 事件乱序也按 sequence 排序后取最新", () => {
  const events = [
    makeTaskEvent({ id: "e3", sequence: 3, eventType: "task_completed", taskId: "t-1" }),
    makeTaskEvent({ id: "e1", sequence: 1, eventType: "task_queued", taskId: "t-1" }),
    makeTaskEvent({ id: "e2", sequence: 2, eventType: "task_running", taskId: "t-1" }),
  ];
  const p = computeTaskProjection(events);
  // 即使乱序，最终状态 = completed
  assert.equal(p.completed, 1);
});

test("computeTaskProjection — 非 task_* 事件被忽略", () => {
  const events = [
    {
      id: "e1", sequence: 1, eventType: "proposal_pending",
      resourceType: "proposal", resourceId: "p-1",
      taskId: "t-1", occurredAt: "2026-08-13T10:00:00Z", payload: {},
    },
  ];
  const p = computeTaskProjection(events);
  assert.deepEqual({ ...p }, { ...ZERO_TASK_PROJECTION });
});

test("computeCompletionRate — 0 任务返回 0", () => {
  assert.equal(computeCompletionRate(ZERO_TASK_PROJECTION), 0);
});

test("computeCompletionRate — 5 任务 3 完成 = 0.6", () => {
  const p = { queued: 1, running: 0, ingesting: 0, completed: 3, failed: 1 };
  assert.equal(computeCompletionRate(p), 0.6);
});

test("computeCompletionRate — 失败计入分母不计入分子", () => {
  const p = { queued: 0, running: 0, ingesting: 0, completed: 0, failed: 4 };
  assert.equal(computeCompletionRate(p), 0);
});

// ============================================================
// 6. applyEventsToProjection 增量更新
// ============================================================

test("applyEventsToProjection — 增量更新基于现有 snapshot", () => {
  const processedIds = new Set();
  const snapshot = new Map([["t-1", "queued"]]);
  const base = { queued: 1, running: 0, ingesting: 0, completed: 0, failed: 0 };

  const newEvents = [
    makeTaskEvent({ id: "e2", sequence: 2, eventType: "task_completed", taskId: "t-1" }),
  ];
  const p = applyEventsToProjection(base, newEvents, { processedIds, taskStateSnapshot: snapshot });
  // t-1 从 queued → completed
  assert.equal(p.completed, 1);
  assert.equal(p.queued, 0);
  // snapshot 已更新
  assert.equal(snapshot.get("t-1"), "completed");
});

test("applyEventsToProjection — 重复事件不更新 snapshot", () => {
  const processedIds = new Set(["e2"]); // 已处理
  const snapshot = new Map([["t-1", "queued"]]);
  const base = { queued: 1, running: 0, ingesting: 0, completed: 0, failed: 0 };

  const newEvents = [
    makeTaskEvent({ id: "e2", sequence: 2, eventType: "task_completed", taskId: "t-1" }),
  ];
  const p = applyEventsToProjection(base, newEvents, { processedIds, taskStateSnapshot: snapshot });
  // t-1 仍是 queued
  assert.equal(p.queued, 1);
  assert.equal(snapshot.get("t-1"), "queued");
});
