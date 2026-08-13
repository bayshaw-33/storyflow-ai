/**
 * tests/kiikis-21-event-consumer.test.mjs
 * K21-EV-006: 事件消费者幂等、断点续传、错误隔离
 *
 * 用注入 fetcher mock PostgREST listCreativeEvents 行为，不连真实数据库。
 */
import assert from "node:assert/strict";
import test from "node:test";

const {
  consumeCreativeEvents,
  InMemoryCheckpointStore,
  __resetDefaultStoreForTests,
} = await import("../lib/server/v2/events/consumer.ts");

const USER_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "proj-umbral-ep06";

/** 构造一行事件 (snake_case, listCreativeEvents 返回的原始行格式)。 */
function makeRow(overrides = {}) {
  return {
    id: "evt-1",
    sequence: 1,
    event_type: "task.progressed",
    schema_version: 1,
    actor_type: "system",
    actor_id: null,
    owner_id: USER_ID,
    resource_type: "project",
    resource_id: PROJECT_ID,
    resource_version: null,
    task_id: null,
    idempotency_key: "task-1:progress:1",
    visibility: "private",
    payload: { completed: 1, total: 12 },
    occurred_at: "2026-08-13T10:00:00.000Z",
    created_at: "2026-08-13T10:00:00.000Z",
    ...overrides,
  };
}

function rows(...overrides) {
  return overrides.map((o, i) =>
    makeRow({
      id: `evt-${i + 1}`,
      sequence: i + 1,
      idempotency_key: `task-1:progress:${i + 1}`,
      ...o,
    })
  );
}

/**
 * 构造 mock fetcher：记录 list 调用，按页返回预设行。
 * opts.pages: 数组，每页一组行；调用时按顺序消费。
 */
function makeListFetcher(pages, opts = {}) {
  const calls = [];
  let pageIdx = 0;
  const fetcher = async (path, init) => {
    calls.push({ path, init });
    if (opts.throwOn && path.includes(opts.throwOn)) {
      throw new Error(opts.throwMsg || "network down");
    }
    if (path.includes("/storyflow_creative_events")) {
      const page = pages[Math.min(pageIdx, pages.length - 1)] ?? [];
      pageIdx++;
      return page;
    }
    throw new Error(`unexpected path: ${path}`);
  };
  fetcher.calls = calls;
  fetcher.pageIdx = () => pageIdx;
  return fetcher;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================
// K21-EV-006: 基本消费与 checkpoint 推进
// ============================================================

test("K21-EV-006: 基本消费 — 处理一批事件并推进 lastSequence", async () => {
  const fetcher = makeListFetcher([rows({}, {}, {})]);
  const handled = [];
  const result = await consumeCreativeEvents({
    consumerId: "consumer-basic",
    fetcher,
    userId: USER_ID,
    handler: (e) => {
      handled.push(e.id);
    },
  });

  assert.equal(result.processed, 3);
  assert.equal(result.skipped, 0);
  assert.equal(result.errors.length, 0);
  assert.equal(result.checkpoint.lastSequence, 3);
  assert.equal(result.checkpoint.processedIds.length, 3);
  assert.deepEqual(handled, ["evt-1", "evt-2", "evt-3"]);
});

test("K21-EV-006: 从断点之后拉取 — afterSequence 传入上次的 lastSequence", async () => {
  const store = new InMemoryCheckpointStore();
  await store.save("consumer-resume", {
    lastSequence: 5,
    processedIds: ["evt-5"],
  });

  const fetcher = makeListFetcher([rows({}, {}).map((r, i) => ({
    ...r,
    id: `evt-${6 + i}`,
    sequence: 6 + i,
  }))]);
  const handled = [];
  const result = await consumeCreativeEvents({
    consumerId: "consumer-resume",
    fetcher,
    userId: USER_ID,
    handler: (e) => handled.push(e.id),
    store,
  });

  // 验证 fetcher 收到 afterSequence=5
  const listCall = fetcher.calls.find((c) =>
    c.path.includes("/storyflow_creative_events")
  );
  assert.ok(listCall.path.includes("sequence=gt.5"));

  assert.equal(result.processed, 2);
  assert.equal(result.checkpoint.lastSequence, 7);
});

test("K21-EV-006: reachedEnd=true 当拉取数少于 batchSize", async () => {
  const fetcher = makeListFetcher([rows({}, {})]); // 2 条 < batchSize 200
  const result = await consumeCreativeEvents({
    consumerId: "consumer-end",
    fetcher,
    userId: USER_ID,
    handler: () => {},
  });
  assert.equal(result.reachedEnd, true);
});

test("K21-EV-006: reachedEnd=false 当拉取数等于 batchSize", async () => {
  // 构造 batchSize 条
  const fullPage = Array.from({ length: 3 }, (_, i) =>
    makeRow({ id: `evt-${i + 1}`, sequence: i + 1 })
  );
  const fetcher = makeListFetcher([fullPage]);
  const result = await consumeCreativeEvents({
    consumerId: "consumer-fullpage",
    fetcher,
    userId: USER_ID,
    handler: () => {},
    batchSize: 3,
  });
  assert.equal(result.reachedEnd, false);
});

// ============================================================
// K21-EV-006: 幂等性 — 重放相同事件只触发一次 handler
// ============================================================

test("K21-EV-006: 重放相同事件 — processedIds 命中则 skipped 不触发 handler", async () => {
  const fetcher = makeListFetcher([rows({}, {}, {})]);
  const handled = [];
  const opts = {
    consumerId: "consumer-idempotent",
    fetcher,
    userId: USER_ID,
    handler: (e) => handled.push(e.id),
  };

  // 第一次消费
  const r1 = await consumeCreativeEvents(opts);
  assert.equal(r1.processed, 3);
  assert.equal(r1.skipped, 0);

  // 第二次：相同事件重放 (模拟重放或断点未推进)
  const r2 = await consumeCreativeEvents(opts);
  assert.equal(r2.processed, 0);
  assert.equal(r2.skipped, 3);
  // handler 没有再次被调用
  assert.equal(handled.length, 3);
  // checkpoint 仍保留所有 processedIds
  assert.equal(r2.checkpoint.processedIds.length, 3);
});

test("K21-EV-006: 跨进程恢复 — checkpoint 持久化后新实例继续消费", async () => {
  const store = new InMemoryCheckpointStore();
  const fetcher1 = makeListFetcher([rows({}, {})]);
  await consumeCreativeEvents({
    consumerId: "consumer-restore",
    fetcher: fetcher1,
    userId: USER_ID,
    handler: () => {},
    store,
  });

  // 模拟新进程：用同一个 store (如 Redis) 但新 handler 闭包
  const handled2 = [];
  const fetcher2 = makeListFetcher([
    rows({}).map((r, i) => ({ ...r, id: `evt-${3 + i}`, sequence: 3 })),
  ]);
  const result = await consumeCreativeEvents({
    consumerId: "consumer-restore",
    fetcher: fetcher2,
    userId: USER_ID,
    handler: (e) => handled2.push(e.id),
    store,
  });

  // 新事件被处理
  assert.equal(result.processed, 1);
  // 已处理事件不在新拉取范围 (afterSequence=2)
  assert.deepEqual(handled2, ["evt-3"]);
  // checkpoint 合并了历史 processedIds
  assert.equal(result.checkpoint.processedIds.length, 3);
});

// ============================================================
// K21-EV-006: 错误隔离 — handler 失败不中断后续事件
// ============================================================

test("K21-EV-006: handler 失败 — 记录 error 并继续处理后续事件", async () => {
  const fetcher = makeListFetcher([rows({}, {}, {}, {})]);
  const handled = [];

  const result = await consumeCreativeEvents({
    consumerId: "consumer-error",
    fetcher,
    userId: USER_ID,
    handler: (e) => {
      if (e.id === "evt-2") {
        throw new Error("handler exploded");
      }
      handled.push(e.id);
    },
  });

  // evt-1, evt-3, evt-4 成功；evt-2 失败
  assert.equal(result.processed, 3);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].event.id, "evt-2");
  assert.equal(result.errors[0].error.message, "handler exploded");
  assert.deepEqual(handled, ["evt-1", "evt-3", "evt-4"]);
});

test("K21-EV-006: handler 失败 — lastSequence 不跳过失败事件", async () => {
  const fetcher = makeListFetcher([rows({}, {}, {})]);
  const result = await consumeCreativeEvents({
    consumerId: "consumer-noskip",
    fetcher,
    userId: USER_ID,
    handler: (e) => {
      // evt-2 失败，但 evt-3 成功
      if (e.id === "evt-2") throw new Error("fail");
    },
  });

  // evt-1 成功 (seq=1), evt-2 失败 (seq=2), evt-3 成功 (seq=3)
  // 但 lastSequence 不应推进到 3，必须停在 1 (evt-2 未成功)
  assert.equal(result.processed, 2); // evt-1, evt-3
  assert.equal(result.errors.length, 1);
  assert.equal(result.checkpoint.lastSequence, 1);
});

test("K21-EV-006: 失败后重放 — 失败事件重新处理，已成功事件 skipped", async () => {
  const store = new InMemoryCheckpointStore();
  const fetcher1 = makeListFetcher([rows({}, {}, {})]);
  const handled = [];

  // 第一次：evt-2 失败
  const r1 = await consumeCreativeEvents({
    consumerId: "consumer-retry",
    fetcher: fetcher1,
    userId: USER_ID,
    handler: (e) => {
      handled.push(e.id);
      if (e.id === "evt-2") throw new Error("fail");
    },
    store,
  });
  assert.equal(r1.processed, 2);
  assert.equal(r1.checkpoint.lastSequence, 1);
  assert.deepEqual(handled, ["evt-1", "evt-2", "evt-3"]);

  // 第二次：相同事件重放 (afterSequence=1，拉取 evt-2, evt-3)
  // evt-2 未在 processedIds → 重新处理；evt-3 已 processedIds → skipped
  const fetcher2 = makeListFetcher([rows({}, {}).map((r, i) => ({
    ...r,
    id: `evt-${2 + i}`,
    sequence: 2 + i,
  }))]);
  handled.length = 0;

  const r2 = await consumeCreativeEvents({
    consumerId: "consumer-retry",
    fetcher: fetcher2,
    userId: USER_ID,
    handler: (e) => {
      handled.push(e.id);
      // 这次 evt-2 不再失败
    },
    store,
  });

  // evt-2 成功，evt-3 skipped
  assert.equal(r2.processed, 1);
  assert.equal(r2.skipped, 1);
  assert.deepEqual(handled, ["evt-2"]);
  // 现在所有事件都已处理，lastSequence 推进到 3
  assert.equal(r2.checkpoint.lastSequence, 3);
});

test("K21-EV-006: handler 抛非 Error 值 — 归一化为 Error", async () => {
  const fetcher = makeListFetcher([rows({})]);
  const result = await consumeCreativeEvents({
    consumerId: "consumer-nonerror",
    fetcher,
    userId: USER_ID,
    handler: () => {
      throw "string error"; // 非 Error
    },
  });
  assert.equal(result.errors.length, 1);
  assert.ok(result.errors[0].error instanceof Error);
  assert.equal(result.errors[0].error.message, "string error");
});

test("K21-EV-006: 异步 handler — await 完成才推进", async () => {
  const fetcher = makeListFetcher([rows({}, {})]);
  const order = [];
  const result = await consumeCreativeEvents({
    consumerId: "consumer-async",
    fetcher,
    userId: USER_ID,
    handler: async (e) => {
      await sleep(1);
      order.push(e.id);
    },
  });
  assert.equal(result.processed, 2);
  assert.deepEqual(order, ["evt-1", "evt-2"]);
});

// ============================================================
// K21-EV-006: consumerId 隔离
// ============================================================

test("K21-EV-006: 不同 consumerId 互不影响", async () => {
  const store = new InMemoryCheckpointStore();
  const fetcher = makeListFetcher([rows({}), rows({})]);
  const handledA = [];
  const handledB = [];

  const r1 = await consumeCreativeEvents({
    consumerId: "consumer-A",
    fetcher,
    userId: USER_ID,
    handler: (e) => handledA.push(e.id),
    store,
  });
  const r2 = await consumeCreativeEvents({
    consumerId: "consumer-B",
    fetcher,
    userId: USER_ID,
    handler: (e) => handledB.push(e.id),
    store,
  });

  // 两个 consumer 各自独立处理事件
  assert.equal(r1.processed, 1);
  assert.equal(r2.processed, 1);
  assert.deepEqual(handledA, ["evt-1"]);
  assert.deepEqual(handledB, ["evt-1"]);
  // checkpoint 独立
  assert.equal(r1.checkpoint.lastSequence, 1);
  assert.equal(r2.checkpoint.lastSequence, 1);
});

// ============================================================
// K21-EV-006: 资源过滤
// ============================================================

test("K21-EV-006: resourceType 过滤 — 传入 fetcher 查询参数", async () => {
  const fetcher = makeListFetcher([rows({})]);
  await consumeCreativeEvents({
    consumerId: "consumer-filter",
    fetcher,
    userId: USER_ID,
    handler: () => {},
    resourceType: "universe",
  });
  const listCall = fetcher.calls.find((c) =>
    c.path.includes("/storyflow_creative_events")
  );
  assert.ok(listCall.path.includes("resource_type=eq.universe"));
});

test("K21-EV-006: resourceId 过滤 — 传入 fetcher 查询参数", async () => {
  const fetcher = makeListFetcher([rows({})]);
  await consumeCreativeEvents({
    consumerId: "consumer-filter-id",
    fetcher,
    userId: USER_ID,
    handler: () => {},
    resourceId: "uni-xyz",
  });
  const listCall = fetcher.calls.find((c) =>
    c.path.includes("/storyflow_creative_events")
  );
  assert.ok(listCall.path.includes("resource_id=eq.uni-xyz"));
});

// ============================================================
// K21-EV-006: 空批次与首次消费
// ============================================================

test("K21-EV-006: 空批次 — 无事件时 reachedEnd=true, processed=0", async () => {
  const fetcher = makeListFetcher([[]]);
  const result = await consumeCreativeEvents({
    consumerId: "consumer-empty",
    fetcher,
    userId: USER_ID,
    handler: () => {},
  });
  assert.equal(result.processed, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.errors.length, 0);
  assert.equal(result.reachedEnd, true);
  assert.equal(result.checkpoint.lastSequence, 0);
  assert.equal(result.checkpoint.processedIds.length, 0);
});

test("K21-EV-006: 首次消费 — 无 checkpoint 时从 sequence=0 之后开始", async () => {
  const fetcher = makeListFetcher([rows({})]);
  const result = await consumeCreativeEvents({
    consumerId: "consumer-first",
    fetcher,
    userId: USER_ID,
    handler: () => {},
  });
  const listCall = fetcher.calls.find((c) =>
    c.path.includes("/storyflow_creative_events")
  );
  // afterSequence=0 → sequence=gt.0
  assert.ok(listCall.path.includes("sequence=gt.0"));
  assert.equal(result.processed, 1);
  assert.equal(result.checkpoint.lastSequence, 1);
});

// ============================================================
// K21-EV-006: 参数校验
// ============================================================

test("K21-EV-006: consumerId 空字符串 — 抛错", async () => {
  await assert.rejects(
    () =>
      consumeCreativeEvents({
        consumerId: "",
        fetcher: makeListFetcher([[]]),
        userId: USER_ID,
        handler: () => {},
      }),
    /consumerId must be a non-empty string/
  );
});

test("K21-EV-006: handler 非函数 — 抛错", async () => {
  await assert.rejects(
    () =>
      consumeCreativeEvents({
        consumerId: "consumer-badhandler",
        fetcher: makeListFetcher([[]]),
        userId: USER_ID,
        handler: null,
      }),
    /handler must be a function/
  );
});

// ============================================================
// K21-EV-006: InMemoryCheckpointStore 行为
// ============================================================

test("K21-EV-006: InMemoryCheckpointStore — get 不存在的 consumer 返回 null", async () => {
  const store = new InMemoryCheckpointStore();
  const result = await store.get("nonexistent");
  assert.equal(result, null);
});

test("K21-EV-006: InMemoryCheckpointStore — save 后 get 返回快照副本", async () => {
  const store = new InMemoryCheckpointStore();
  const original = { lastSequence: 5, processedIds: ["a", "b"] };
  await store.save("consumer-snapshot", original);

  // 突变原始对象，store 中的副本不应改变
  original.processedIds.push("c");
  original.lastSequence = 99;

  const got = await store.get("consumer-snapshot");
  assert.equal(got.lastSequence, 5);
  assert.deepEqual(got.processedIds, ["a", "b"]);
});

test("K21-EV-006: 默认 store — 未注入 store 时使用共享内存 store", async () => {
  __resetDefaultStoreForTests();
  const fetcher = makeListFetcher([rows({})]);
  const r1 = await consumeCreativeEvents({
    consumerId: "consumer-default-store",
    fetcher,
    userId: USER_ID,
    handler: () => {},
  });
  assert.equal(r1.processed, 1);

  // 第二次消费 (默认 store 已有 checkpoint)
  const fetcher2 = makeListFetcher([rows({})]);
  const r2 = await consumeCreativeEvents({
    consumerId: "consumer-default-store",
    fetcher: fetcher2,
    userId: USER_ID,
    handler: () => {},
  });
  // 已 processedIds，skipped
  assert.equal(r2.skipped, 1);
  assert.equal(r2.processed, 0);
});

// ============================================================
// K21-EV-006: fetcher 错误传播
// ============================================================

test("K21-EV-006: fetcher 抛错 — 错误传播到调用方", async () => {
  const fetcher = makeListFetcher([[]], {
    throwOn: "/storyflow_creative_events",
    throwMsg: "database down",
  });
  await assert.rejects(
    () =>
      consumeCreativeEvents({
        consumerId: "consumer-fetcher-error",
        fetcher,
        userId: USER_ID,
        handler: () => {},
      }),
    /database down/
  );
});
