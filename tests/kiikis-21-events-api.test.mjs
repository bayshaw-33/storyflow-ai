/**
 * tests/kiikis-21-events-api.test.mjs
 * K21-EV-001..005: 事件写入服务 + API 适配层
 * 用注入 fetcher mock PostgREST 行为，不连真实数据库。
 */
import assert from "node:assert/strict";
import test from "node:test";

const {
  appendCreativeEvent,
  listCreativeEvents,
  CreativeEventsError,
} = await import("../lib/server/v2/events/index.ts");

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const PROJECT_ID = "proj-umbral-ep06";
const TASK_ID = "33333333-3333-3333-3333-333333333333";
const NOW = "2026-08-13T10:00:00.000Z";

function validInput(overrides = {}) {
  return {
    eventType: "task.progressed",
    schemaVersion: 1,
    actorType: "system",
    actorId: null,
    ownerId: USER_ID,
    resourceType: "project",
    resourceId: PROJECT_ID,
    resourceVersion: null,
    taskId: TASK_ID,
    idempotencyKey: "task-1:progress:7",
    visibility: "private",
    payload: { completed: 7, total: 12, unit: "frame" },
    occurredAt: NOW,
    ...overrides,
  };
}

/** 构造 mock fetcher，记录 RPC 调用并返回模拟行。 */
function makeAppendFetcher(returnRow, opts = {}) {
  const calls = [];
  const fetcher = async (path, init) => {
    calls.push({ path, init });
    if (opts.throwOn) {
      if (path.includes(opts.throwOn)) throw new Error(opts.throwMsg || "network down");
    }
    if (path.includes("/rpc/append_creative_event")) {
      if (opts.rpcThrows) throw new Error(opts.rpcThrows);
      // 第二次调用（幂等命中）模拟返回相同行
      if (calls.filter((c) => c.path.includes("/rpc/append_creative_event")).length > 1 && opts.rpcReturnsExisting) {
        return { ...returnRow, idempotency_key: returnRow.idempotency_key };
      }
      return returnRow;
    }
    if (path.includes("/storyflow_creative_events")) {
      return opts.listRows || [];
    }
    throw new Error(`unexpected path: ${path}`);
  };
  fetcher.calls = calls;
  return fetcher;
}

function makeRow(overrides = {}) {
  return {
    id: "evt-1",
    sequence: 42,
    event_type: "task.progressed",
    schema_version: 1,
    actor_type: "system",
    actor_id: null,
    owner_id: USER_ID,
    resource_type: "project",
    resource_id: PROJECT_ID,
    resource_version: null,
    task_id: TASK_ID,
    idempotency_key: "task-1:progress:7",
    visibility: "private",
    payload: { completed: 7, total: 12, unit: "frame" },
    occurred_at: NOW,
    created_at: NOW,
    ...overrides,
  };
}

// ============================================================
// 认证
// ============================================================

test("appendCreativeEvent: 缺 userId 抛 unauthenticated", async () => {
  const fetcher = makeAppendFetcher(makeRow());
  await assert.rejects(
    appendCreativeEvent({ fetcher, userId: "", input: validInput() }),
    (err) => err instanceof CreativeEventsError && err.code === "unauthenticated"
  );
});

test("listCreativeEvents: 缺 userId 抛 unauthenticated", async () => {
  const fetcher = makeAppendFetcher(makeRow());
  await assert.rejects(
    listCreativeEvents({ fetcher, userId: "" }),
    (err) => err instanceof CreativeEventsError && err.code === "unauthenticated"
  );
});

// ============================================================
// owner 伪造防护
// ============================================================

test("appendCreativeEvent: input.ownerId ≠ userId 抛 forbidden (禁止伪造 owner)", async () => {
  const fetcher = makeAppendFetcher(makeRow());
  await assert.rejects(
    appendCreativeEvent({
      fetcher,
      userId: USER_ID,
      input: validInput({ ownerId: OTHER_USER_ID }),
    }),
    (err) => err instanceof CreativeEventsError && err.code === "forbidden"
  );
});

test("appendCreativeEvent: actorType=user 时 actorId 必须等于 userId", async () => {
  const fetcher = makeAppendFetcher(makeRow());
  // actorId 写成 OTHER_USER_ID 应被拒
  await assert.rejects(
    appendCreativeEvent({
      fetcher,
      userId: USER_ID,
      input: validInput({ actorType: "user", actorId: OTHER_USER_ID }),
    }),
    (err) => err instanceof CreativeEventsError && err.code === "forbidden"
  );
});

// ============================================================
// 契约校验委托给 parseCreativeEvent
// ============================================================

test("appendCreativeEvent: 非法 visibility 抛 validation_failed", async () => {
  const fetcher = makeAppendFetcher(makeRow());
  await assert.rejects(
    appendCreativeEvent({
      fetcher,
      userId: USER_ID,
      input: validInput({ visibility: "secret" }),
    }),
    (err) => err instanceof CreativeEventsError && err.code === "validation_failed"
  );
});

test("appendCreativeEvent: 敏感 payload 抛 validation_failed", async () => {
  const fetcher = makeAppendFetcher(makeRow());
  await assert.rejects(
    appendCreativeEvent({
      fetcher,
      userId: USER_ID,
      input: validInput({ payload: { apiKey: "leak" } }),
    }),
    (err) => err instanceof CreativeEventsError && err.code === "validation_failed"
  );
});

test("appendCreativeEvent: 缺 idempotencyKey 抛 validation_failed", async () => {
  const fetcher = makeAppendFetcher(makeRow());
  await assert.rejects(
    appendCreativeEvent({
      fetcher,
      userId: USER_ID,
      input: validInput({ idempotencyKey: "" }),
    }),
    (err) => err instanceof CreativeEventsError && err.code === "validation_failed"
  );
});

// ============================================================
// 写入 + 返回结构
// ============================================================

test("appendCreativeEvent: 成功写入返回 CreativeEventV1 并映射 snake_case → camelCase", async () => {
  const fetcher = makeAppendFetcher(makeRow());
  const event = await appendCreativeEvent({
    fetcher,
    userId: USER_ID,
    input: validInput(),
  });
  assert.equal(event.id, "evt-1");
  assert.equal(event.sequence, 42);
  assert.equal(event.eventType, "task.progressed");
  assert.equal(event.ownerId, USER_ID);
  assert.equal(event.idempotencyKey, "task-1:progress:7");
  assert.equal(event.visibility, "private");
  assert.deepEqual(event.payload, { completed: 7, total: 12, unit: "frame" });
});

test("appendCreativeEvent: 调用 /rpc/append_creative_event RPC 路径", async () => {
  const fetcher = makeAppendFetcher(makeRow());
  await appendCreativeEvent({ fetcher, userId: USER_ID, input: validInput() });
  const rpcCall = fetcher.calls.find((c) => c.path.includes("/rpc/append_creative_event"));
  assert.ok(rpcCall, "should call RPC endpoint");
});

test("appendCreativeEvent: RPC 调用 body 含全部字段且 ownerId 强制为 userId", async () => {
  const fetcher = makeAppendFetcher(makeRow());
  await appendCreativeEvent({ fetcher, userId: USER_ID, input: validInput() });
  const rpcCall = fetcher.calls.find((c) => c.path.includes("/rpc/append_creative_event"));
  const body = JSON.parse(rpcCall.init.body);
  assert.equal(body.p_event_type, "task.progressed");
  assert.equal(body.p_schema_version, 1);
  assert.equal(body.p_owner_id, USER_ID);
  assert.equal(body.p_idempotency_key, "task-1:progress:7");
  assert.equal(body.p_visibility, "private");
  assert.equal(body.p_resource_type, "project");
  assert.equal(body.p_resource_id, PROJECT_ID);
  assert.deepEqual(body.p_payload, { completed: 7, total: 12, unit: "frame" });
});

test("appendCreativeEvent: payload 为空时 RPC 收到 {}", async () => {
  const fetcher = makeAppendFetcher(makeRow());
  const input = validInput();
  delete input.payload;
  await appendCreativeEvent({ fetcher, userId: USER_ID, input });
  const rpcCall = fetcher.calls.find((c) => c.path.includes("/rpc/append_creative_event"));
  const body = JSON.parse(rpcCall.init.body);
  assert.deepEqual(body.p_payload, {});
});

// ============================================================
// 幂等：相同 idempotency_key 重复写入返回同一事件
// ============================================================

test("appendCreativeEvent: 重复写入相同 idempotency_key 调用 RPC 两次但返回同一 id", async () => {
  const row = makeRow();
  const fetcher = makeAppendFetcher(row, { rpcReturnsExisting: true });
  const e1 = await appendCreativeEvent({ fetcher, userId: USER_ID, input: validInput() });
  const e2 = await appendCreativeEvent({ fetcher, userId: USER_ID, input: validInput() });
  assert.equal(e1.id, e2.id);
  assert.equal(e1.idempotencyKey, e2.idempotencyKey);
});

test("appendCreativeEvent: RPC 返回 null 抛 service_unavailable", async () => {
  const fetcher = async () => null;
  await assert.rejects(
    appendCreativeEvent({ fetcher, userId: USER_ID, input: validInput() }),
    (err) => err instanceof CreativeEventsError && err.code === "service_unavailable"
  );
});

test("appendCreativeEvent: 网络错误归一化为 service_unavailable", async () => {
  const fetcher = async () => { throw new Error("network down"); };
  await assert.rejects(
    appendCreativeEvent({ fetcher, userId: USER_ID, input: validInput() }),
    (err) => err instanceof CreativeEventsError && err.code === "service_unavailable"
  );
});

// ============================================================
// listCreativeEvents: afterSequence 补拉
// ============================================================

test("listCreativeEvents: 默认返回 owner 自己的事件，按 sequence 升序", async () => {
  const rows = [makeRow({ sequence: 10, id: "e-10" }), makeRow({ sequence: 11, id: "e-11" })];
  const fetcher = async (path) => {
    if (path.includes("/storyflow_creative_events")) return rows;
    throw new Error(`unexpected: ${path}`);
  };
  const result = await listCreativeEvents({ fetcher, userId: USER_ID });
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].sequence, 10);
  assert.equal(result.items[1].sequence, 11);
  assert.equal(result.items[0].id, "e-10");
});

test("listCreativeEvents: afterSequence 过滤 sequence > afterSequence", async () => {
  let capturedPath = "";
  const fetcher = async (path) => {
    capturedPath = path;
    if (path.includes("/storyflow_creative_events")) return [makeRow({ sequence: 100, id: "e-100" })];
    throw new Error(`unexpected: ${path}`);
  };
  const result = await listCreativeEvents({ fetcher, userId: USER_ID, afterSequence: 99 });
  assert.match(capturedPath, /sequence=gt\.99/);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].sequence, 100);
});

test("listCreativeEvents: 返回 nextSequence 为最后一条 sequence, 空列表时为 null", async () => {
  const emptyFetcher = async () => [];
  const r1 = await listCreativeEvents({ fetcher: emptyFetcher, userId: USER_ID });
  assert.equal(r1.nextSequence, null);

  const fetcher = async () => [makeRow({ sequence: 50, id: "e-50" })];
  const r2 = await listCreativeEvents({ fetcher, userId: USER_ID });
  assert.equal(r2.nextSequence, 50);
});

test("listCreativeEvents: resourceType/resourceId 过滤拼接到查询", async () => {
  let capturedPath = "";
  const fetcher = async (path) => {
    capturedPath = path;
    return [];
  };
  await listCreativeEvents({
    fetcher,
    userId: USER_ID,
    resourceType: "project",
    resourceId: PROJECT_ID,
  });
  assert.match(capturedPath, /resource_type=eq\.project/);
  assert.match(capturedPath, /resource_id=eq\./);
});

test("listCreativeEvents: owner_id 过滤等于 userId", async () => {
  let capturedPath = "";
  const fetcher = async (path) => {
    capturedPath = path;
    return [];
  };
  await listCreativeEvents({ fetcher, userId: USER_ID });
  assert.match(capturedPath, /owner_id=eq\./);
});

test("listCreativeEvents: limit 默认 200, 上限 1000", async () => {
  let capturedPath = "";
  const fetcher = async (path) => {
    capturedPath = path;
    return [];
  };
  await listCreativeEvents({ fetcher, userId: USER_ID });
  assert.match(capturedPath, /limit=200/);

  await listCreativeEvents({ fetcher, userId: USER_ID, limit: 5000 });
  assert.match(capturedPath, /limit=1000/);
});

test("listCreativeEvents: 网络错误归一化为 service_unavailable", async () => {
  const fetcher = async () => { throw new Error("db down"); };
  await assert.rejects(
    listCreativeEvents({ fetcher, userId: USER_ID }),
    (err) => err instanceof CreativeEventsError && err.code === "service_unavailable"
  );
});

test("CreativeEventsError: 携带稳定 code 与 message", () => {
  const err = new CreativeEventsError("forbidden", "no access");
  assert.equal(err.code, "forbidden");
  assert.match(err.message, /no access/);
  assert.equal(err.name, "CreativeEventsError");
});
