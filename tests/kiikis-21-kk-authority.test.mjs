/**
 * tests/kiikis-21-kk-authority.test.mjs
 * KIIKIS 2.1 Phase 3 — Task 3.5 陪伴上下文与高风险确认测试
 *
 * 覆盖 K21-KK-010..014：
 *   - K21-KK-010: 上下文构建 (project/universe/memory 摘要)
 *   - K21-KK-011: 跨账号隔离 (RLS 模拟 + 显式 ownerId 校验)
 *   - K21-KK-012: 高风险动作 propose → confirm → execute 流程
 *   - K21-KK-013: 切换账号/项目不串上下文
 *   - K21-KK-014: 敏感 memory fact 默认不返回
 *
 * 安全断言：
 *   - LLM 模块不得 import executeAction (本测试通过 reflection 验证)
 *   - 跨账号 confirmAction 抛 forbidden
 *   - 取消动作 executor 不被调用
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  buildCompanionContext,
  assertSameOwner,
  containsSensitiveFact,
  KkContextError,
} from "../lib/server/v2/kk/context.ts";
import {
  InMemoryKkActionStore,
  proposeAction,
  confirmAction,
  cancelAction,
  listPendingActions,
  getAction,
  isHighRiskActionType,
  resolveRisk,
  HIGH_RISK_ACTION_TYPES,
  LOW_RISK_ACTION_TYPES,
  KkActionError,
} from "../lib/server/v2/kk/actions.ts";

const ROOT = process.cwd();

// ============================================================
// Helper: 模拟 PostgREST fetcher (按 owner 过滤模拟 RLS)
// ============================================================

/**
 * mockPostgrest: 返回一个 fetcher，内部维护表数据。
 * 关键：所有 query string 里的 owner_id=eq.X 过滤都被严格遵守，
 * 模拟 RLS 行为 — 跨账号查询返回空。
 */
function mockPostgrest(tables = {}) {
  const db = {
    storyflow_kk_profiles: tables.profiles ?? [],
    storyflow_projects: tables.projects ?? [],
    storyflow_universes: tables.universes ?? [],
    storyflow_kk_memory_facts: tables.memoryFacts ?? [],
  };

  /**
   * 简易 query string 解析：只识别 ?key=eq.value&key2=eq.value2&...
   * 以及 deleted_at=is.null、order=...&limit=N
   */
  function queryRows(tablePath, search) {
    const tableName = tablePath.replace("/rest/v1/", "").split("?")[0];
    const rows = db[tableName] ?? [];
    if (!rows.length) return [];

    const params = new URLSearchParams(search || "");
    let filtered = [...rows];

    for (const [key, value] of params.entries()) {
      if (key === "order" || key === "limit" || key === "select") continue;
      if (value === "is.null") {
        filtered = filtered.filter((r) => r[key] === null || r[key] === undefined);
        continue;
      }
      const m = /^eq\.(.+)$/.exec(value);
      if (!m) continue;
      const want = m[1];
      filtered = filtered.filter((r) => String(r[key]) === want);
    }

    // order
    const order = params.get("order");
    if (order) {
      const [field, dir] = order.split(".");
      filtered.sort((a, b) => {
        const av = a[field] ?? "";
        const bv = b[field] ?? "";
        const cmp = String(av).localeCompare(String(bv));
        return dir === "desc" ? -cmp : cmp;
      });
    }

    // limit
    const limit = Number(params.get("limit"));
    if (Number.isFinite(limit) && limit > 0) {
      filtered = filtered.slice(0, limit);
    }
    return filtered;
  }

  /** fetcher 实现 */
  return async function fetcher(p, init) {
    const url = new URL("http://x" + p);
    const tablePath = url.pathname;
    const search = url.search.slice(1);

    // pgrst.object+json header (单行)：返回第一条或抛 406
    const wantObject =
      init?.headers &&
      typeof init.headers === "object" &&
      init.headers.Accept === "application/vnd.pgrst.object+json";

    // POST 不处理 (本测试不覆盖写入路径)
    if (init?.method === "POST") {
      return {};
    }

    const rows = queryRows(tablePath, search);
    if (wantObject) {
      if (rows.length === 0) {
        const err = new Error("no rows");
        err.status = 406;
        throw err;
      }
      return rows[0];
    }
    return rows;
  };
}

// ============================================================
// 1. 文件存在性
// ============================================================

test("Task 3.5 文件创建", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "lib/server/v2/kk/context.ts")));
  assert.ok(fs.existsSync(path.join(ROOT, "lib/server/v2/kk/actions.ts")));
  assert.ok(fs.existsSync(path.join(ROOT, "components/v2/kk/KkConfirmationDialog.tsx")));
  assert.ok(fs.existsSync(path.join(ROOT, "tests/kiikis-21-kk-authority.test.mjs")));
});

test("actions.ts — 不导出 executeAction (LLM 不可直接调用)", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/server/v2/kk/actions.ts"), "utf-8");
  // 不存在 export function executeAction
  assert.ok(!/export\s+(async\s+)?function\s+executeAction/.test(src),
    "actions.ts 不得导出 executeAction — LLM 不能直接执行高风险动作");
  // 不存在 export const executeAction
  assert.ok(!/export\s+const\s+executeAction/.test(src));
});

test("actions.ts — 导出 HIGH_RISK_ACTION_TYPES = 5 项", () => {
  assert.equal(HIGH_RISK_ACTION_TYPES.length, 5);
  for (const t of ["publish", "authorize", "payment", "delete", "override_canon"]) {
    assert.ok(HIGH_RISK_ACTION_TYPES.includes(t));
  }
});

test("isHighRiskActionType — 高风险返回 true，低风险返回 false", () => {
  assert.equal(isHighRiskActionType("publish"), true);
  assert.equal(isHighRiskActionType("delete"), true);
  assert.equal(isHighRiskActionType("override_canon"), true);
  assert.equal(isHighRiskActionType("read"), false);
  assert.equal(isHighRiskActionType("navigate"), false);
  assert.equal(isHighRiskActionType("unknown"), false);
});

test("resolveRisk — 高风险类型返回 high，低风险返回 low", () => {
  assert.equal(resolveRisk("publish"), "high");
  assert.equal(resolveRisk("payment"), "high");
  assert.equal(resolveRisk("read"), "low");
  assert.equal(resolveRisk("open_view"), "low");
  // 未知类型默认 low (不抛错，由 proposeAction 拒绝)
  assert.equal(resolveRisk("xxx"), "low");
});

// ============================================================
// 2. 上下文构建 (K21-KK-010)
// ============================================================

test("K21-KK-010: buildCompanionContext 返回 profile + project + universe + memory facts", async () => {
  const fetcher = mockPostgrest({
    profiles: [
      {
        owner_id: "u-A",
        display_name: "User A",
        growth_level: 3,
        growth_xp: 120,
        recent_project_id: "p-1",
        recent_universe_id: "uni-1",
      },
    ],
    projects: [
      { id: "p-1", title: "Project 1", stage: "drafting", updated_at: "2026-08-13T10:00:00Z", owner_id: "u-A" },
    ],
    universes: [
      { id: "uni-1", display_name: "Universe 1", visibility: "private", updated_at: "2026-08-13T10:00:00Z", owner_id: "u-A" },
    ],
    memoryFacts: [
      {
        id: "f-1",
        owner_id: "u-A",
        fact_type: "user_choice",
        fact_key: "preferred_lang",
        fact_value: { lang: "zh" },
        source: "user",
        is_sensitive: false,
        created_at: "2026-08-13T10:00:00Z",
        deleted_at: null,
      },
    ],
  });

  const ctx = await buildCompanionContext(fetcher, "u-A");

  assert.equal(ctx.ownerId, "u-A");
  assert.ok(ctx.profile);
  assert.equal(ctx.profile.displayName, "User A");
  assert.equal(ctx.profile.recentProjectId, "p-1");
  assert.equal(ctx.profile.recentUniverseId, "uni-1");

  assert.ok(ctx.project);
  assert.equal(ctx.project.id, "p-1");
  assert.equal(ctx.project.title, "Project 1");
  assert.equal(ctx.project.stage, "drafting");

  assert.ok(ctx.universe);
  assert.equal(ctx.universe.id, "uni-1");
  assert.equal(ctx.universe.visibility, "private");

  assert.equal(ctx.memoryFacts.length, 1);
  assert.equal(ctx.memoryFacts[0].factKey, "preferred_lang");
  assert.deepEqual({ ...ctx.memoryFacts[0].factValue }, { lang: "zh" });

  // builtAt 是合法 ISO
  const built = Date.parse(ctx.builtAt);
  assert.ok(Number.isFinite(built));
});

test("K21-KK-013: 切换 projectId 不串上下文 — 多次调用各自返回正确 project", async () => {
  const fetcher = mockPostgrest({
    profiles: [
      {
        owner_id: "u-A",
        display_name: "A",
        growth_level: 0,
        growth_xp: 0,
        recent_project_id: "p-1",
        recent_universe_id: null,
      },
    ],
    projects: [
      { id: "p-1", title: "Project 1", stage: null, updated_at: null, owner_id: "u-A" },
      { id: "p-2", title: "Project 2", stage: null, updated_at: null, owner_id: "u-A" },
    ],
    universes: [],
    memoryFacts: [],
  });

  const ctx1 = await buildCompanionContext(fetcher, "u-A", { projectId: "p-1" });
  assert.equal(ctx1.project?.id, "p-1");

  // 第二次切换到 p-2 — 不应残留 p-1
  const ctx2 = await buildCompanionContext(fetcher, "u-A", { projectId: "p-2" });
  assert.equal(ctx2.project?.id, "p-2");
  assert.notEqual(ctx2.project?.id, ctx1.project?.id);
});

// ============================================================
// 3. 跨账号隔离 (K21-KK-011)
// ============================================================

test("K21-KK-011: 账号 B 不能读取账号 A 的 profile — profile 为 null", async () => {
  const fetcher = mockPostgrest({
    profiles: [
      { owner_id: "u-A", display_name: "A", growth_level: 0, growth_xp: 0, recent_project_id: null, recent_universe_id: null },
    ],
    projects: [],
    universes: [],
    memoryFacts: [],
  });

  // 账号 B 查询 — fetcher 的 owner_id=eq.u-B 过滤后返回空 (模拟 RLS)
  const ctx = await buildCompanionContext(fetcher, "u-B");
  assert.equal(ctx.ownerId, "u-B");
  assert.equal(ctx.profile, null, "账号 B 不得读取账号 A 的 profile");
  assert.equal(ctx.project, null);
  assert.equal(ctx.memoryFacts.length, 0);
});

test("K21-KK-011: 账号 B 不能读取账号 A 的 memory facts", async () => {
  const fetcher = mockPostgrest({
    profiles: [
      { owner_id: "u-A", display_name: "A", growth_level: 0, growth_xp: 0, recent_project_id: null, recent_universe_id: null },
    ],
    projects: [],
    universes: [],
    memoryFacts: [
      { id: "f-1", owner_id: "u-A", fact_type: "user_choice", fact_key: "k", fact_value: {}, source: "user", is_sensitive: false, created_at: "2026-08-13T10:00:00Z", deleted_at: null },
    ],
  });

  // 账号 B 查询 memory facts — fetcher 的 owner_id=eq.u-B 过滤后返回空
  const ctxB = await buildCompanionContext(fetcher, "u-B");
  assert.equal(ctxB.memoryFacts.length, 0, "账号 B 不得读取账号 A 的 memory facts");
});

test("K21-KK-011: 即使 fetcher 错误返回了他人数据，safeProfile 仍拒绝 (RLS 配置错误兜底)", async () => {
  // 模拟 RLS 配置错误：fetcher 故意返回账号 A 的数据给账号 B
  const buggyFetcher = async (p) => {
    if (p.includes("/rest/v1/storyflow_kk_profiles")) {
      // 错误地返回账号 A 的数据
      return {
        owner_id: "u-A",
        display_name: "A",
        growth_level: 5,
        growth_xp: 999,
        recent_project_id: "p-A",
        recent_universe_id: null,
      };
    }
    if (p.includes("/rest/v1/storyflow_kk_memory_facts")) {
      return [
        { id: "f-1", owner_id: "u-A", fact_type: "x", fact_key: "k", fact_value: {}, source: "user", is_sensitive: false, created_at: "2026-08-13T10:00:00Z", deleted_at: null },
      ];
    }
    return null;
  };

  const ctxB = await buildCompanionContext(buggyFetcher, "u-B");
  // K21-KK-011: 即使 fetcher 返回了错误数据，safeProfile 校验 owner_id 应拒绝
  assert.equal(ctxB.profile, null, "safeProfile 必须拒绝非当前 owner 的数据");
  // memoryFacts 同样被 isOwnedBy 过滤
  assert.equal(ctxB.memoryFacts.length, 0);
});

// ============================================================
// 4. 敏感 memory fact 过滤 (K21-KK-014)
// ============================================================

test("K21-KK-014: 默认不返回敏感 memory facts", async () => {
  const fetcher = mockPostgrest({
    profiles: [
      { owner_id: "u-A", display_name: "A", growth_level: 0, growth_xp: 0, recent_project_id: null, recent_universe_id: null },
    ],
    projects: [],
    universes: [],
    memoryFacts: [
      { id: "f-1", owner_id: "u-A", fact_type: "user_choice", fact_key: "k1", fact_value: {}, source: "user", is_sensitive: false, created_at: "2026-08-13T10:00:00Z", deleted_at: null },
      { id: "f-2", owner_id: "u-A", fact_type: "authorized_context", fact_key: "k2", fact_value: {}, source: "system", is_sensitive: true, created_at: "2026-08-13T10:00:00Z", deleted_at: null },
    ],
  });

  const ctx = await buildCompanionContext(fetcher, "u-A");
  // 默认 includeSensitiveFacts=false → 只有非敏感 1 条
  assert.equal(ctx.memoryFacts.length, 1);
  assert.equal(ctx.memoryFacts[0].id, "f-1");

  // containsSensitiveFact 始终返回 false (契约保证)
  assert.equal(containsSensitiveFact(ctx), false);
});

test("K21-KK-014: includeSensitiveFacts=true 才返回敏感 fact", async () => {
  // 注意：mockPostgrest 不识别 is_sensitive=eq.false 过滤 (只识别字符串相等)，
  // 这里手动模拟 fetcher 处理 is_sensitive 参数
  const fetcher = async (p) => {
    if (p.includes("/rest/v1/storyflow_kk_profiles")) {
      return { owner_id: "u-A", display_name: "A", growth_level: 0, growth_xp: 0, recent_project_id: null, recent_universe_id: null };
    }
    if (p.includes("/rest/v1/storyflow_kk_memory_facts")) {
      const all = [
        { id: "f-1", owner_id: "u-A", fact_type: "user_choice", fact_key: "k1", fact_value: {}, source: "user", is_sensitive: false, created_at: "2026-08-13T10:00:00Z", deleted_at: null },
        { id: "f-2", owner_id: "u-A", fact_type: "authorized_context", fact_key: "k2", fact_value: {}, source: "system", is_sensitive: true, created_at: "2026-08-13T10:00:00Z", deleted_at: null },
      ];
      if (p.includes("is_sensitive=eq.false")) {
        return all.filter((r) => r.is_sensitive === false);
      }
      return all;
    }
    return null;
  };

  const ctxSafe = await buildCompanionContext(fetcher, "u-A", { includeSensitiveFacts: false });
  assert.equal(ctxSafe.memoryFacts.length, 1);

  const ctxAll = await buildCompanionContext(fetcher, "u-A", { includeSensitiveFacts: true });
  assert.equal(ctxAll.memoryFacts.length, 2);
});

test("K21-KK-014: 已软删除的 memory fact 不返回", async () => {
  const fetcher = mockPostgrest({
    profiles: [{ owner_id: "u-A", display_name: "A", growth_level: 0, growth_xp: 0, recent_project_id: null, recent_universe_id: null }],
    projects: [],
    universes: [],
    memoryFacts: [
      { id: "f-1", owner_id: "u-A", fact_type: "x", fact_key: "k1", fact_value: {}, source: "user", is_sensitive: false, created_at: "2026-08-13T10:00:00Z", deleted_at: null },
      { id: "f-2", owner_id: "u-A", fact_type: "x", fact_key: "k2", fact_value: {}, source: "user", is_sensitive: false, created_at: "2026-08-13T10:00:00Z", deleted_at: "2026-08-14T00:00:00Z" },
    ],
  });

  const ctx = await buildCompanionContext(fetcher, "u-A");
  // deleted_at=is.null 过滤掉 f-2
  assert.equal(ctx.memoryFacts.length, 1);
  assert.equal(ctx.memoryFacts[0].id, "f-1");
});

// ============================================================
// 5. 上下文 fail-closed (K21-KK-010)
// ============================================================

test("K21-KK-010: 任何子查询失败都降级为 null，不抛错", async () => {
  const failingFetcher = async () => {
    throw new Error("network down");
  };

  const ctx = await buildCompanionContext(failingFetcher, "u-A");
  assert.equal(ctx.ownerId, "u-A");
  assert.equal(ctx.profile, null);
  assert.equal(ctx.project, null);
  assert.equal(ctx.universe, null);
  assert.equal(ctx.memoryFacts.length, 0);
  // builtAt 仍有值
  assert.ok(ctx.builtAt);
});

test("K21-KK-010: 空 ownerId 抛 unauthenticated", async () => {
  const fetcher = mockPostgrest({});
  await assert.rejects(
    () => buildCompanionContext(fetcher, ""),
    (err) => err instanceof KkContextError && err.code === "unauthenticated",
  );
});

test("assertSameOwner — 不同 owner 抛 forbidden", () => {
  const ctx = {
    ownerId: "u-A",
    profile: null,
    project: null,
    universe: null,
    memoryFacts: [],
    builtAt: "2026-08-13T10:00:00Z",
  };
  assert.throws(
    () => assertSameOwner(ctx, "u-B"),
    (err) => err instanceof KkContextError && err.code === "forbidden",
  );
  // 同 owner 不抛
  assert.doesNotThrow(() => assertSameOwner(ctx, "u-A"));
});

// ============================================================
// 6. Propose 流程 (K21-KK-012)
// ============================================================

test("K21-KK-012: proposeAction 高风险动作返回 risk=high + status=pending", async () => {
  const store = new InMemoryKkActionStore();
  const action = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "publish",
    resourceType: "project",
    resourceId: "p-1",
    summary: "发布项目 p-1",
    ttlMs: 60_000,
  });

  assert.equal(action.risk, "high");
  assert.equal(action.status, "pending");
  assert.equal(action.actionType, "publish");
  assert.equal(action.ownerId, "u-A");
  assert.equal(action.resourceType, "project");
  assert.equal(action.resourceId, "p-1");
  assert.equal(action.summary, "发布项目 p-1");
  // expiresAt 是未来时间
  assert.ok(Date.parse(action.expiresAt) > Date.now());
});

test("K21-KK-012: proposeAction 低风险动作返回 risk=low", async () => {
  const store = new InMemoryKkActionStore();
  const action = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "read",
    resourceType: "project",
    resourceId: "p-1",
  });
  assert.equal(action.risk, "low");
});

test("K21-KK-012: proposeAction 幂等 — 同 idempotencyKey 返回同一 action", async () => {
  const store = new InMemoryKkActionStore();
  const a1 = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "delete",
    resourceType: "memory_fact",
    resourceId: "f-1",
    idempotencyKey: "idem-1",
  });
  const a2 = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "delete",
    resourceType: "memory_fact",
    resourceId: "f-1",
    idempotencyKey: "idem-1",
  });
  assert.equal(a1.actionId, a2.actionId);
  assert.equal(a1.actionId, "idem-1");
});

test("K21-KK-013: proposeAction 跨账号复用 idempotencyKey 抛 forbidden", async () => {
  const store = new InMemoryKkActionStore();
  await proposeAction(store, {
    ownerId: "u-A",
    actionType: "delete",
    resourceType: "memory_fact",
    resourceId: "f-1",
    idempotencyKey: "idem-1",
  });
  // 账号 B 试图用相同的 idempotencyKey
  await assert.rejects(
    () => proposeAction(store, {
      ownerId: "u-B",
      actionType: "delete",
      resourceType: "memory_fact",
      resourceId: "f-1",
      idempotencyKey: "idem-1",
    }),
    (err) => err instanceof KkActionError && err.code === "forbidden",
  );
});

test("K21-KK-012: proposeAction 输入校验 — 缺 ownerId 抛 unauthenticated", async () => {
  const store = new InMemoryKkActionStore();
  await assert.rejects(
    () => proposeAction(store, { ownerId: "", actionType: "publish", resourceType: "p", resourceId: "1" }),
    (err) => err instanceof KkActionError && err.code === "unauthenticated",
  );
});

test("K21-KK-012: proposeAction 输入校验 — 缺 actionType 抛 validation_failed", async () => {
  const store = new InMemoryKkActionStore();
  await assert.rejects(
    () => proposeAction(store, { ownerId: "u-A", actionType: "", resourceType: "p", resourceId: "1" }),
    (err) => err instanceof KkActionError && err.code === "validation_failed",
  );
});

test("K21-KK-012: proposeAction 输入校验 — 未知 actionType 抛 validation_failed", async () => {
  const store = new InMemoryKkActionStore();
  await assert.rejects(
    () => proposeAction(store, { ownerId: "u-A", actionType: "hack_server", resourceType: "p", resourceId: "1" }),
    (err) => err instanceof KkActionError && err.code === "validation_failed",
  );
});

// ============================================================
// 7. Confirm 流程 (K21-KK-012)
// ============================================================

test("K21-KK-012: confirmAction 调用 executor 执行动作", async () => {
  const store = new InMemoryKkActionStore();
  const action = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "publish",
    resourceType: "project",
    resourceId: "p-1",
  });

  let executorCalled = 0;
  const executor = async (a) => {
    executorCalled++;
    return {
      actionId: a.actionId,
      status: "executed",
      executedAt: new Date().toISOString(),
      data: { published: true },
    };
  };

  const result = await confirmAction(store, "u-A", action.actionId, executor);
  assert.equal(executorCalled, 1);
  assert.equal(result.status, "executed");
  assert.deepEqual({ ...result.data }, { published: true });

  // store 中状态变 executed
  const after = await store.findById(action.actionId);
  assert.equal(after.status, "executed");
});

test("K21-KK-012: confirmAction 幂等 — 重复 confirm 返回原结果，不重新执行 executor", async () => {
  const store = new InMemoryKkActionStore();
  const action = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "delete",
    resourceType: "memory_fact",
    resourceId: "f-1",
  });

  let executorCalled = 0;
  const executor = async (a) => {
    executorCalled++;
    return { actionId: a.actionId, status: "executed", executedAt: new Date().toISOString() };
  };

  const r1 = await confirmAction(store, "u-A", action.actionId, executor);
  assert.equal(r1.status, "executed");
  // 第二次 confirm — 幂等返回，不重新执行
  const r2 = await confirmAction(store, "u-A", action.actionId, executor);
  assert.equal(r2.status, "executed");
  assert.equal(executorCalled, 1, "重复 confirm 不应重新调用 executor");
});

test("K21-KK-012: confirmAction 跨账号被阻断 (K21-KK-013)", async () => {
  const store = new InMemoryKkActionStore();
  const action = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "publish",
    resourceType: "project",
    resourceId: "p-1",
  });

  let executorCalled = 0;
  const executor = async () => {
    executorCalled++;
    return { actionId: "x", status: "executed", executedAt: new Date().toISOString() };
  };

  // 账号 B 试图确认账号 A 的动作
  await assert.rejects(
    () => confirmAction(store, "u-B", action.actionId, executor),
    (err) => err instanceof KkActionError && err.code === "forbidden",
  );
  assert.equal(executorCalled, 0, "跨账号确认不得触发 executor");
});

test("K21-KK-012: confirmAction 不存在的 actionId 抛 not_found", async () => {
  const store = new InMemoryKkActionStore();
  const executor = async () => ({ actionId: "x", status: "executed", executedAt: "" });
  await assert.rejects(
    () => confirmAction(store, "u-A", "nonexistent", executor),
    (err) => err instanceof KkActionError && err.code === "not_found",
  );
});

test("K21-KK-012: confirmAction executor 抛错 → status=failed", async () => {
  const store = new InMemoryKkActionStore();
  const action = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "payment",
    resourceType: "subscription",
    resourceId: "sub-1",
  });

  const executor = async () => {
    throw new Error("payment gateway down");
  };

  const result = await confirmAction(store, "u-A", action.actionId, executor);
  assert.equal(result.status, "failed");
  assert.match(result.error, /payment gateway down/);

  // store 中状态变 failed
  const after = await store.findById(action.actionId);
  assert.equal(after.status, "failed");
});

// ============================================================
// 8. 过期机制 (K21-KK-012)
// ============================================================

test("K21-KK-012: 过期的 action 不能 confirm — 抛 expired", async () => {
  const store = new InMemoryKkActionStore();
  // ttlMs=10ms — 立即过期
  const action = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "delete",
    resourceType: "memory_fact",
    resourceId: "f-1",
    ttlMs: 10,
  });

  // 等待过期
  await new Promise((r) => setTimeout(r, 30));

  let executorCalled = 0;
  const executor = async () => {
    executorCalled++;
    return { actionId: "x", status: "executed", executedAt: "" };
  };

  await assert.rejects(
    () => confirmAction(store, "u-A", action.actionId, executor),
    (err) => err instanceof KkActionError && err.code === "expired",
  );
  assert.equal(executorCalled, 0, "过期 action 不得执行");

  // store 中状态变 expired
  const after = await store.findById(action.actionId);
  assert.equal(after.status, "expired");
});

// ============================================================
// 9. Cancel 流程 (K21-KK-012)
// ============================================================

test("K21-KK-012: cancelAction 不触发 executor — 业务状态不变", async () => {
  const store = new InMemoryKkActionStore();
  const action = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "publish",
    resourceType: "project",
    resourceId: "p-1",
  });

  let executorCalled = 0;
  // 注意 cancel 不接受 executor
  const cancelled = await cancelAction(store, "u-A", action.actionId);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(executorCalled, 0);
});

test("K21-KK-012: cancelAction 幂等 — 重复 cancel 不抛错", async () => {
  const store = new InMemoryKkActionStore();
  const action = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "publish",
    resourceType: "project",
    resourceId: "p-1",
  });

  await cancelAction(store, "u-A", action.actionId);
  // 第二次 cancel 应该幂等返回
  const second = await cancelAction(store, "u-A", action.actionId);
  assert.equal(second.status, "cancelled");
});

test("K21-KK-012: cancelAction 跨账号被阻断 (K21-KK-013)", async () => {
  const store = new InMemoryKkActionStore();
  const action = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "publish",
    resourceType: "project",
    resourceId: "p-1",
  });

  await assert.rejects(
    () => cancelAction(store, "u-B", action.actionId),
    (err) => err instanceof KkActionError && err.code === "forbidden",
  );
});

test("K21-KK-012: 已 executed 的 action 不能 cancel", async () => {
  const store = new InMemoryKkActionStore();
  const action = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "publish",
    resourceType: "project",
    resourceId: "p-1",
  });

  const executor = async (a) => ({ actionId: a.actionId, status: "executed", executedAt: "" });
  await confirmAction(store, "u-A", action.actionId, executor);

  await assert.rejects(
    () => cancelAction(store, "u-A", action.actionId),
    (err) => err instanceof KkActionError && err.code === "not_pending",
  );
});

// ============================================================
// 10. listPendingActions / getAction
// ============================================================

test("listPendingActions — 只返回当前 owner 的 pending 动作", async () => {
  const store = new InMemoryKkActionStore();
  await proposeAction(store, {
    ownerId: "u-A",
    actionType: "publish",
    resourceType: "project",
    resourceId: "p-1",
    idempotencyKey: "a-1",
  });
  await proposeAction(store, {
    ownerId: "u-A",
    actionType: "delete",
    resourceType: "memory_fact",
    resourceId: "f-1",
    idempotencyKey: "a-2",
  });
  await proposeAction(store, {
    ownerId: "u-B",
    actionType: "publish",
    resourceType: "project",
    resourceId: "p-B1",
    idempotencyKey: "b-1",
  });

  const listA = await listPendingActions(store, "u-A");
  assert.equal(listA.length, 2);
  for (const a of listA) {
    assert.equal(a.ownerId, "u-A");
  }

  const listB = await listPendingActions(store, "u-B");
  assert.equal(listB.length, 1);
  assert.equal(listB[0].ownerId, "u-B");
});

test("listPendingActions — 自动标记过期", async () => {
  const store = new InMemoryKkActionStore();
  const action = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "publish",
    resourceType: "project",
    resourceId: "p-1",
    ttlMs: 10,
  });
  await new Promise((r) => setTimeout(r, 30));

  const list = await listPendingActions(store, "u-A");
  assert.equal(list.length, 1);
  assert.equal(list[0].status, "expired");

  // 过期的不应再出现在 pending 列表
  const pendingOnly = await store.listByOwner("u-A", "pending");
  assert.equal(pendingOnly.length, 0);
});

test("getAction — 跨账号访问被阻断", async () => {
  const store = new InMemoryKkActionStore();
  const action = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "publish",
    resourceType: "project",
    resourceId: "p-1",
  });

  await assert.rejects(
    () => getAction(store, "u-B", action.actionId),
    (err) => err instanceof KkActionError && err.code === "forbidden",
  );
});

test("getAction — 自己的 action 正常返回", async () => {
  const store = new InMemoryKkActionStore();
  const action = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "publish",
    resourceType: "project",
    resourceId: "p-1",
  });

  const fetched = await getAction(store, "u-A", action.actionId);
  assert.equal(fetched.actionId, action.actionId);
  assert.equal(fetched.ownerId, "u-A");
});

// ============================================================
// 11. 高风险动作类型全覆盖 (K21-KK-012)
// ============================================================

test("K21-KK-012: 全部 5 种高风险动作都需确认", async () => {
  const store = new InMemoryKkActionStore();
  for (const actionType of HIGH_RISK_ACTION_TYPES) {
    const a = await proposeAction(store, {
      ownerId: "u-A",
      actionType,
      resourceType: "resource",
      resourceId: "r-1",
      idempotencyKey: `idem-${actionType}`,
    });
    assert.equal(a.risk, "high", `${actionType} 必须是高风险`);
    assert.equal(a.status, "pending");
  }
});

// ============================================================
// 12. KkConfirmationDialog 组件契约
// ============================================================

test("KkConfirmationDialog.tsx — 不直接调用 server confirmAction", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "components/v2/kk/KkConfirmationDialog.tsx"),
    "utf-8",
  );
  // 组件应通过 props 接收 onConfirm，不直接 import server 模块
  assert.ok(!/from\s+["']@\/lib\/server\/v2\/kk\/actions["']/.test(src),
    "组件不得直接 import server actions 模块");
  assert.ok(!/from\s+["'].*lib\/server\/v2\/kk\/(actions|context)["']/.test(src));
  // 必须导出 KkConfirmationDialog 组件
  assert.match(src, /export function KkConfirmationDialog/);
  // 必须有 onConfirm 和 onCancel props
  assert.match(src, /onConfirm:/);
  assert.match(src, /onCancel:/);
});

test("KkConfirmationDialog.tsx — 文案支持 zh-CN 和 en", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "components/v2/kk/KkConfirmationDialog.tsx"),
    "utf-8",
  );
  assert.match(src, /"zh-CN"/);
  assert.match(src, /confirmBtn/);
  assert.match(src, /cancelBtn/);
});

test("kk.module.css — 包含 confirm* 样式类", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "components/v2/kk/kk.module.css"),
    "utf-8",
  );
  for (const cls of ["confirmOverlay", "confirmDialog", "confirmBtn", "confirmBtnPrimary", "confirmBtnSecondary"]) {
    assert.ok(src.includes(`.${cls}`), `kk.module.css 必须包含 .${cls}`);
  }
  // 必须支持浅色模式
  assert.match(src, /prefers-color-scheme: light/);
});

// ============================================================
// 13. 综合场景：完整 propose → confirm 流程
// ============================================================

test("综合场景：LLM 提议发布 → 用户确认 → executor 被调用一次 → 状态 executed", async () => {
  const store = new InMemoryKkActionStore();
  let publishedCount = 0;
  const executor = async (action) => {
    if (action.actionType === "publish") {
      publishedCount++;
      return {
        actionId: action.actionId,
        status: "executed",
        executedAt: new Date().toISOString(),
        data: { publishedAt: new Date().toISOString() },
      };
    }
    throw new Error("unsupported action");
  };

  // 1. LLM 提议
  const proposal = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "publish",
    resourceType: "project",
    resourceId: "p-100",
    summary: "发布项目《测试》到市场",
  });
  assert.equal(proposal.risk, "high");
  assert.equal(proposal.status, "pending");

  // 2. 用户点击确认
  const result = await confirmAction(store, "u-A", proposal.actionId, executor);
  assert.equal(result.status, "executed");
  assert.equal(publishedCount, 1);

  // 3. 再次点击确认 — 幂等返回，不重新发布
  const result2 = await confirmAction(store, "u-A", proposal.actionId, executor);
  assert.equal(result2.status, "executed");
  assert.equal(publishedCount, 1, "二次确认不得重复发布");
});

test("综合场景：LLM 提议删除 → 用户取消 → executor 不被调用 → 业务无变化", async () => {
  const store = new InMemoryKkActionStore();
  let deletedCount = 0;
  const executor = async (action) => {
    if (action.actionType === "delete") {
      deletedCount++;
      return { actionId: action.actionId, status: "executed", executedAt: new Date().toISOString() };
    }
    throw new Error("unsupported");
  };

  const proposal = await proposeAction(store, {
    ownerId: "u-A",
    actionType: "delete",
    resourceType: "memory_fact",
    resourceId: "f-99",
  });

  // 用户取消
  const cancelled = await cancelAction(store, "u-A", proposal.actionId);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(deletedCount, 0, "取消动作不得调用 executor");

  // 之后试图 confirm 已取消的 action — 应抛 already_cancelled
  await assert.rejects(
    () => confirmAction(store, "u-A", proposal.actionId, executor),
    (err) => err instanceof KkActionError && err.code === "already_cancelled",
  );
  assert.equal(deletedCount, 0);
});
