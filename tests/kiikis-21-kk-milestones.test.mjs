/**
 * tests/kiikis-21-kk-milestones.test.mjs
 * KIIKIS 2.1 Phase 3 — Task 3.6 成长里程碑测试 (K21-KK-023)
 *
 * 覆盖：
 *   - 契约层 (lib/contracts/v2/kk-milestones.ts)
 *     · MILESTONE_DEFINITIONS 已定义集合 (不接受任意 milestoneId)
 *     · isKnownMilestone / getMilestoneDefinition
 *     · validateGrantFromEventInput (合法 + 各非法分支)
 *     · buildMilestoneIdempotencyKey 格式
 *     · K21-KK-024: milestone 不可购买/兑换 (无 paid_draw 相关定义)
 *
 *   - 服务层 (lib/server/v2/kk/milestones.ts)
 *     · grantFromEvent 成功路径
 *     · unknown_milestone 拒绝 (防 LLM 伪造)
 *     · invalid_input (缺字段 / 非法 ISO)
 *     · rate_limited (InMemoryRateLimiter 滑动窗口)
 *     · grant_failed (RPC 抛错)
 *     · NoOpRateLimiter / allowUnknownMilestones 选项
 *     · 幂等：同 sourceId 派生同 idempotency_key
 *     · K21-KK-023: 批量垃圾事件不能刷成长
 *
 *   - 文件存在性 (Task 3.6 交付物)
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  MILESTONE_DEFINITIONS,
  KNOWN_MILESTONE_IDS,
  DEFAULT_RATE_LIMIT_CONFIG,
  isKnownMilestone,
  getMilestoneDefinition,
  validateGrantFromEventInput,
  buildMilestoneIdempotencyKey,
  MilestoneValidationError,
} from "../lib/contracts/v2/kk-milestones.ts";
import {
  MilestoneService,
  InMemoryRateLimiter,
  NoOpRateLimiter,
  grantMilestoneFromEvent,
  MilestoneServiceError,
} from "../lib/server/v2/kk/milestones.ts";

const ROOT = process.cwd();

// ============================================================
// Helper: mock fetcher (模拟 PostgREST RPC)
// ============================================================

/**
 * 创建一个 mock fetcher，记录所有 RPC 调用。
 * POST /rest/v1/rpc/grant_milestone 返回 {} 表示成功。
 */
function mockFetcher(options = {}) {
  const calls = [];
  const fetcher = async (p, init) => {
    calls.push({ path: p, init });
    if (options.throwOnGrant && /rpc\/grant_milestone/.test(p)) {
      throw new Error(options.throwOnGrant);
    }
    return {};
  };
  return { fetcher, calls };
}

// ============================================================
// 1. 文件存在性 (Task 3.6 交付物)
// ============================================================

test("Task 3.6 文件创建", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "lib/contracts/v2/kk-milestones.ts")));
  assert.ok(fs.existsSync(path.join(ROOT, "lib/server/v2/kk/milestones.ts")));
  assert.ok(fs.existsSync(path.join(ROOT, "components/v2/kk/KkAppearance.tsx")));
  assert.ok(fs.existsSync(path.join(ROOT, "components/v2/kk/KkInventory.tsx")));
  assert.ok(fs.existsSync(path.join(ROOT, "tests/kiikis-21-kk-milestones.test.mjs")));
});

// ============================================================
// 2. MILESTONE_DEFINITIONS (K21-KK-023)
// ============================================================

test("MILESTONE_DEFINITIONS — 含 6 个已知里程碑", () => {
  const ids = Object.keys(MILESTONE_DEFINITIONS);
  assert.ok(ids.length >= 6, `至少 6 个里程碑，实际 ${ids.length}`);
  for (const id of [
    "first_project_created",
    "first_episode_published",
    "ten_episodes_published",
    "first_universe_built",
    "canon_proposal_passed",
    "monthly_active_creator",
  ]) {
    assert.ok(ids.includes(id), `缺少里程碑 ${id}`);
  }
});

test("MILESTONE_DEFINITIONS — 每项有 xp >= 0 和 levelDelta >= 0", () => {
  for (const id of KNOWN_MILESTONE_IDS) {
    const def = MILESTONE_DEFINITIONS[id];
    assert.ok(def, `定义缺失: ${id}`);
    assert.ok(typeof def.xp === "number" && def.xp >= 0, `${id} xp 非法`);
    assert.ok(typeof def.levelDelta === "number" && def.levelDelta >= 0, `${id} levelDelta 非法`);
    assert.ok(typeof def.triggerEventType === "string" && def.triggerEventType.length > 0, `${id} triggerEventType 缺失`);
    assert.equal(def.milestoneId, id, `${id} milestoneId 不匹配`);
  }
});

test("MILESTONE_DEFINITIONS — 不可变 (Object.freeze)", () => {
  assert.ok(Object.isFrozen(MILESTONE_DEFINITIONS), "MILESTONE_DEFINITIONS 必须 frozen");
  for (const id of KNOWN_MILESTONE_IDS) {
    assert.ok(Object.isFrozen(MILESTONE_DEFINITIONS[id]), `${id} 定义必须 frozen`);
  }
});

test("KNOWN_MILESTONE_IDS — 与 MILESTONE_DEFINITIONS keys 一致", () => {
  assert.deepEqual([...KNOWN_MILESTONE_IDS].sort(), [...Object.keys(MILESTONE_DEFINITIONS)].sort());
});

// ============================================================
// 3. K21-KK-024: milestone 不可购买/兑换
// ============================================================

test("K21-KK-024: milestone 定义不含 paid_draw / trade / purchase", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/contracts/v2/kk-milestones.ts"), "utf-8");
  // milestone 源码不得出现 paid_draw / trade / purchase 关键字
  assert.ok(!/paid_draw/.test(src), "milestones 契约不得含 paid_draw");
  assert.ok(!/\btrade\b/.test(src), "milestones 契约不得含 trade");
  // triggerEventType 不得是 payment 类
  for (const id of KNOWN_MILESTONE_IDS) {
    const def = MILESTONE_DEFINITIONS[id];
    assert.ok(!/pay|purchase|trade|draw/.test(def.triggerEventType),
      `${id} triggerEventType ${def.triggerEventType} 不得与支付/交易相关`);
  }
});

test("K21-KK-023: 不奖励 task_completed / ai_generate / page_view (防刷量)", () => {
  for (const id of KNOWN_MILESTONE_IDS) {
    const def = MILESTONE_DEFINITIONS[id];
    assert.ok(def.triggerEventType !== "task_completed", `${id} 不得奖励每次 task_completed`);
    assert.ok(def.triggerEventType !== "ai_generate", `${id} 不得奖励每次 ai_generate`);
    assert.ok(def.triggerEventType !== "page_view", `${id} 不得奖励 page_view`);
  }
});

// ============================================================
// 4. isKnownMilestone / getMilestoneDefinition
// ============================================================

test("isKnownMilestone — 已知返回 true, 未知返回 false", () => {
  assert.equal(isKnownMilestone("first_project_created"), true);
  assert.equal(isKnownMilestone("first_episode_published"), true);
  assert.equal(isKnownMilestone("random_fake_milestone"), false);
  assert.equal(isKnownMilestone(""), false);
  assert.equal(isKnownMilestone(null), false);
});

test("getMilestoneDefinition — 已知返回定义, 未知返回 null", () => {
  const def = getMilestoneDefinition("first_project_created");
  assert.ok(def);
  assert.equal(def.milestoneId, "first_project_created");
  assert.equal(def.xp, 50);
  assert.equal(getMilestoneDefinition("nonexistent"), null);
});

// ============================================================
// 5. validateGrantFromEventInput
// ============================================================

test("validateGrantFromEventInput — 合法输入通过并冻结", () => {
  const input = {
    ownerId: "user-1",
    milestoneId: "first_project_created",
    sourceId: "evt-001",
    occurredAt: "2026-08-14T10:00:00Z",
  };
  const v = validateGrantFromEventInput(input);
  assert.equal(v.ownerId, "user-1");
  assert.equal(v.milestoneId, "first_project_created");
  assert.ok(Object.isFrozen(v));
});

test("validateGrantFromEventInput — 缺 ownerId 抛 missing_owner", () => {
  assert.throws(
    () => validateGrantFromEventInput({
      ownerId: "",
      milestoneId: "first_project_created",
      sourceId: "evt-001",
      occurredAt: "2026-08-14T10:00:00Z",
    }),
    (err) => err instanceof MilestoneValidationError && err.code === "missing_owner" && err.field === "ownerId",
  );
});

test("validateGrantFromEventInput — 缺 milestoneId 抛 missing_milestone", () => {
  assert.throws(
    () => validateGrantFromEventInput({
      ownerId: "user-1",
      milestoneId: "",
      sourceId: "evt-001",
      occurredAt: "2026-08-14T10:00:00Z",
    }),
    (err) => err instanceof MilestoneValidationError && err.code === "missing_milestone",
  );
});

test("validateGrantFromEventInput — 未知 milestoneId 抛 unknown_milestone (防 LLM 伪造)", () => {
  assert.throws(
    () => validateGrantFromEventInput({
      ownerId: "user-1",
      milestoneId: "fake_llm_milestone",
      sourceId: "evt-001",
      occurredAt: "2026-08-14T10:00:00Z",
    }),
    (err) => {
      assert.ok(err instanceof MilestoneValidationError);
      assert.equal(err.code, "unknown_milestone");
      assert.match(err.message, /fake_llm_milestone/);
      return true;
    },
  );
});

test("validateGrantFromEventInput — 缺 sourceId 抛 missing_source_id", () => {
  assert.throws(
    () => validateGrantFromEventInput({
      ownerId: "user-1",
      milestoneId: "first_project_created",
      sourceId: "",
      occurredAt: "2026-08-14T10:00:00Z",
    }),
    (err) => err instanceof MilestoneValidationError && err.code === "missing_source_id",
  );
});

test("validateGrantFromEventInput — 缺 occurredAt 抛 missing_occurred_at", () => {
  assert.throws(
    () => validateGrantFromEventInput({
      ownerId: "user-1",
      milestoneId: "first_project_created",
      sourceId: "evt-001",
      occurredAt: "",
    }),
    (err) => err instanceof MilestoneValidationError && err.code === "missing_occurred_at",
  );
});

test("validateGrantFromEventInput — 非法 ISO occurredAt 抛 invalid_occurred_at", () => {
  assert.throws(
    () => validateGrantFromEventInput({
      ownerId: "user-1",
      milestoneId: "first_project_created",
      sourceId: "evt-001",
      occurredAt: "not-a-date",
    }),
    (err) => err instanceof MilestoneValidationError && err.code === "invalid_occurred_at",
  );
});

// ============================================================
// 6. buildMilestoneIdempotencyKey
// ============================================================

test("buildMilestoneIdempotencyKey — 格式 evt:<sourceId>", () => {
  assert.equal(buildMilestoneIdempotencyKey("evt-001"), "evt:evt-001");
  assert.equal(buildMilestoneIdempotencyKey("abc-123"), "evt:abc-123");
});

test("buildMilestoneIdempotencyKey — 同 sourceId 派生同 key (幂等基础)", () => {
  assert.equal(
    buildMilestoneIdempotencyKey("evt-001"),
    buildMilestoneIdempotencyKey("evt-001"),
  );
});

// ============================================================
// 7. DEFAULT_RATE_LIMIT_CONFIG
// ============================================================

test("DEFAULT_RATE_LIMIT_CONFIG — 1 小时窗口, 最多 5 次", () => {
  assert.equal(DEFAULT_RATE_LIMIT_CONFIG.windowMs, 60 * 60 * 1000);
  assert.equal(DEFAULT_RATE_LIMIT_CONFIG.maxPerWindow, 5);
  assert.ok(Object.isFrozen(DEFAULT_RATE_LIMIT_CONFIG));
});

// ============================================================
// 8. InMemoryRateLimiter
// ============================================================

test("InMemoryRateLimiter — 窗口内未达上限允许", async () => {
  const rl = new InMemoryRateLimiter({ windowMs: 60000, maxPerWindow: 3 });
  const now = new Date().toISOString();
  assert.equal(await rl.check("u1", "m1", now), true);
  assert.equal(await rl.check("u1", "m1", now), true);
  assert.equal(await rl.check("u1", "m1", now), true);
});

test("InMemoryRateLimiter — 达上限后拒绝 (K21-KK-023 防刷量)", async () => {
  const rl = new InMemoryRateLimiter({ windowMs: 60000, maxPerWindow: 2 });
  const now = new Date().toISOString();
  await rl.record("u1", "m1", now);
  await rl.record("u1", "m1", now);
  // 第 3 次应被拒绝
  assert.equal(await rl.check("u1", "m1", now), false);
});

test("InMemoryRateLimiter — 不同 owner 独立计数", async () => {
  const rl = new InMemoryRateLimiter({ windowMs: 60000, maxPerWindow: 1 });
  const now = new Date().toISOString();
  await rl.record("u1", "m1", now);
  // u2 不受 u1 影响
  assert.equal(await rl.check("u2", "m1", now), true);
});

test("InMemoryRateLimiter — 不同 milestoneId 独立计数", async () => {
  const rl = new InMemoryRateLimiter({ windowMs: 60000, maxPerWindow: 1 });
  const now = new Date().toISOString();
  await rl.record("u1", "m1", now);
  // 同 owner 不同 milestone 不受影响
  assert.equal(await rl.check("u1", "m2", now), true);
});

test("InMemoryRateLimiter — 窗口过期后重新允许", async () => {
  const rl = new InMemoryRateLimiter({ windowMs: 100, maxPerWindow: 1 });
  const past = new Date(Date.now() - 1000).toISOString();
  await rl.record("u1", "m1", past);
  // 窗口已过，重新允许
  const now = new Date().toISOString();
  assert.equal(await rl.check("u1", "m1", now), true);
});

test("InMemoryRateLimiter — 非法 occurredAt 拒绝", async () => {
  const rl = new InMemoryRateLimiter();
  assert.equal(await rl.check("u1", "m1", "not-a-date"), false);
});

test("InMemoryRateLimiter.clear — 清空后重新允许", async () => {
  const rl = new InMemoryRateLimiter({ windowMs: 60000, maxPerWindow: 1 });
  const now = new Date().toISOString();
  await rl.record("u1", "m1", now);
  assert.equal(await rl.check("u1", "m1", now), false);
  rl.clear();
  assert.equal(await rl.check("u1", "m1", now), true);
});

test("NoOpRateLimiter — 永远允许", async () => {
  const rl = new NoOpRateLimiter();
  assert.equal(await rl.check("u1", "m1", "now"), true);
  await rl.record("u1", "m1", "now"); // 不抛错
});

// ============================================================
// 9. MilestoneService.grantFromEvent — 成功路径
// ============================================================

test("grantFromEvent — 成功授予返回 granted", async () => {
  const { fetcher, calls } = mockFetcher();
  const svc = new MilestoneService(fetcher, { rateLimiter: new NoOpRateLimiter() });
  const result = await svc.grantFromEvent({
    ownerId: "user-1",
    milestoneId: "first_project_created",
    sourceId: "evt-001",
    occurredAt: "2026-08-14T10:00:00Z",
  });
  assert.equal(result.inserted, true);
  assert.equal(result.reason, "granted");
  assert.equal(result.milestoneId, "first_project_created");
  assert.equal(result.xp, 50);
  assert.equal(result.levelDelta, 0);
  // 调用 grant_milestone RPC
  assert.ok(calls.length >= 1);
  assert.match(calls[0].path, /rpc\/grant_milestone/);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.p_owner_id, "user-1");
  assert.equal(body.p_milestone_id, "first_project_created");
  assert.equal(body.p_xp, 50);
  assert.equal(body.p_level_delta, 0);
  assert.equal(body.p_idempotency_key, "evt:evt-001");
});

test("grantFromEvent — levelDelta 透传 (first_episode_published)", async () => {
  const { fetcher } = mockFetcher();
  const svc = new MilestoneService(fetcher, { rateLimiter: new NoOpRateLimiter() });
  const result = await svc.grantFromEvent({
    ownerId: "user-1",
    milestoneId: "first_episode_published",
    sourceId: "evt-002",
    occurredAt: "2026-08-14T10:00:00Z",
  });
  assert.equal(result.xp, 100);
  assert.equal(result.levelDelta, 1);
});

test("grantMilestoneFromEvent — 便捷函数等价于 service", async () => {
  const { fetcher } = mockFetcher();
  const result = await grantMilestoneFromEvent(fetcher, {
    ownerId: "user-1",
    milestoneId: "first_universe_built",
    sourceId: "evt-003",
    occurredAt: "2026-08-14T10:00:00Z",
  }, { rateLimiter: new NoOpRateLimiter() });
  assert.equal(result.reason, "granted");
  assert.equal(result.xp, 30);
});

// ============================================================
// 10. grantFromEvent — unknown_milestone (防 LLM 伪造)
// ============================================================

test("grantFromEvent — 未知 milestoneId 返回 unknown_milestone (不调用 RPC)", async () => {
  const { fetcher, calls } = mockFetcher();
  const svc = new MilestoneService(fetcher, { rateLimiter: new NoOpRateLimiter() });
  const result = await svc.grantFromEvent({
    ownerId: "user-1",
    milestoneId: "fake_llm_milestone",
    sourceId: "evt-001",
    occurredAt: "2026-08-14T10:00:00Z",
  });
  assert.equal(result.inserted, false);
  assert.equal(result.reason, "unknown_milestone");
  assert.equal(result.xp, 0);
  // 不应调用 RPC
  assert.equal(calls.length, 0);
});

test("grantFromEvent — allowUnknownMilestones 选项放行未知 milestone", async () => {
  const { fetcher, calls } = mockFetcher();
  const svc = new MilestoneService(fetcher, {
    rateLimiter: new NoOpRateLimiter(),
    allowUnknownMilestones: true,
  });
  const result = await svc.grantFromEvent({
    ownerId: "user-1",
    milestoneId: "custom_milestone",
    sourceId: "evt-001",
    occurredAt: "2026-08-14T10:00:00Z",
  });
  // 未知 milestone def 为 null, xp=0, levelDelta=0, 仍调用 RPC
  assert.equal(result.reason, "granted");
  assert.equal(result.xp, 0);
  assert.equal(calls.length, 1);
});

// ============================================================
// 11. grantFromEvent — invalid_input
// ============================================================

test("grantFromEvent — 缺 ownerId 返回 invalid_input 不抛错", async () => {
  const { fetcher, calls } = mockFetcher();
  const svc = new MilestoneService(fetcher, { rateLimiter: new NoOpRateLimiter() });
  const result = await svc.grantFromEvent({
    ownerId: "",
    milestoneId: "first_project_created",
    sourceId: "evt-001",
    occurredAt: "2026-08-14T10:00:00Z",
  });
  assert.equal(result.inserted, false);
  assert.equal(result.reason, "invalid_input");
  assert.equal(calls.length, 0);
});

test("grantFromEvent — 非法 occurredAt 返回 invalid_input", async () => {
  const { fetcher } = mockFetcher();
  const svc = new MilestoneService(fetcher, { rateLimiter: new NoOpRateLimiter() });
  const result = await svc.grantFromEvent({
    ownerId: "user-1",
    milestoneId: "first_project_created",
    sourceId: "evt-001",
    occurredAt: "not-a-date",
  });
  assert.equal(result.reason, "invalid_input");
});

// ============================================================
// 12. grantFromEvent — rate_limited (K21-KK-023 防刷量)
// ============================================================

test("K21-KK-023: 批量垃圾事件不能刷成长 (rate_limited)", async () => {
  const { fetcher, calls } = mockFetcher();
  const rl = new InMemoryRateLimiter({ windowMs: 60000, maxPerWindow: 2 });
  const svc = new MilestoneService(fetcher, { rateLimiter: rl });
  const now = new Date().toISOString();

  // 第 1、2 次成功
  const r1 = await svc.grantFromEvent({
    ownerId: "spammer",
    milestoneId: "first_project_created",
    sourceId: "evt-001",
    occurredAt: now,
  });
  assert.equal(r1.reason, "granted");

  const r2 = await svc.grantFromEvent({
    ownerId: "spammer",
    milestoneId: "first_project_created",
    sourceId: "evt-002",
    occurredAt: now,
  });
  assert.equal(r2.reason, "granted");

  // 第 3 次被反刷量拦截
  const r3 = await svc.grantFromEvent({
    ownerId: "spammer",
    milestoneId: "first_project_created",
    sourceId: "evt-003",
    occurredAt: now,
  });
  assert.equal(r3.inserted, false);
  assert.equal(r3.reason, "rate_limited");
  // RPC 只被调用 2 次
  const grantCalls = calls.filter((c) => /rpc\/grant_milestone/.test(c.path));
  assert.equal(grantCalls.length, 2, "刷量尝试不应继续调用 RPC");
});

test("K21-KK-023: rate_limited 不调用 RPC (节省 DB)", async () => {
  const { fetcher, calls } = mockFetcher();
  const rl = new InMemoryRateLimiter({ windowMs: 60000, maxPerWindow: 1 });
  const svc = new MilestoneService(fetcher, { rateLimiter: rl });
  const now = new Date().toISOString();

  await svc.grantFromEvent({
    ownerId: "u1",
    milestoneId: "first_project_created",
    sourceId: "evt-001",
    occurredAt: now,
  });
  calls.length = 0; // 重置

  const r2 = await svc.grantFromEvent({
    ownerId: "u1",
    milestoneId: "first_project_created",
    sourceId: "evt-002",
    occurredAt: now,
  });
  assert.equal(r2.reason, "rate_limited");
  assert.equal(calls.length, 0, "rate_limited 不应调用 RPC");
});

// ============================================================
// 13. grantFromEvent — grant_failed
// ============================================================

test("grantFromEvent — RPC 抛错返回 grant_failed 不传播异常", async () => {
  const { fetcher } = mockFetcher({ throwOnGrant: "DB connection refused" });
  const svc = new MilestoneService(fetcher, { rateLimiter: new NoOpRateLimiter() });
  const result = await svc.grantFromEvent({
    ownerId: "user-1",
    milestoneId: "first_project_created",
    sourceId: "evt-001",
    occurredAt: "2026-08-14T10:00:00Z",
  });
  assert.equal(result.inserted, false);
  assert.equal(result.reason, "grant_failed");
  // 即使失败仍返回 xp 信息便于审计
  assert.equal(result.xp, 50);
});

// ============================================================
// 14. 幂等性 — 同 sourceId 派生同 idempotency_key
// ============================================================

test("幂等 — 同 sourceId 派生同 idempotency_key (RPC 端 ON CONFLICT DO NOTHING)", async () => {
  const { fetcher, calls } = mockFetcher();
  const svc = new MilestoneService(fetcher, { rateLimiter: new NoOpRateLimiter() });
  const input = {
    ownerId: "user-1",
    milestoneId: "first_project_created",
    sourceId: "evt-replay-001",
    occurredAt: "2026-08-14T10:00:00Z",
  };
  // 模拟事件重放：同 sourceId 调用两次
  await svc.grantFromEvent(input);
  await svc.grantFromEvent(input);
  // 两次调用都派生相同 idempotency_key
  const k1 = JSON.parse(calls[0].init.body).p_idempotency_key;
  const k2 = JSON.parse(calls[1].init.body).p_idempotency_key;
  assert.equal(k1, "evt:evt-replay-001");
  assert.equal(k1, k2, "同 sourceId 必须派生同 idempotency_key (RPC 幂等基础)");
});

test("幂等 — 不同 sourceId 派生不同 idempotency_key", async () => {
  const { fetcher, calls } = mockFetcher();
  const svc = new MilestoneService(fetcher, { rateLimiter: new NoOpRateLimiter() });
  await svc.grantFromEvent({
    ownerId: "user-1",
    milestoneId: "first_project_created",
    sourceId: "evt-A",
    occurredAt: "2026-08-14T10:00:00Z",
  });
  await svc.grantFromEvent({
    ownerId: "user-1",
    milestoneId: "first_project_created",
    sourceId: "evt-B",
    occurredAt: "2026-08-14T10:00:00Z",
  });
  const k1 = JSON.parse(calls[0].init.body).p_idempotency_key;
  const k2 = JSON.parse(calls[1].init.body).p_idempotency_key;
  assert.notEqual(k1, k2);
});

// ============================================================
// 15. rateLimiter 默认 InMemoryRateLimiter
// ============================================================

test("MilestoneService — 默认使用 InMemoryRateLimiter", async () => {
  const { fetcher } = mockFetcher();
  const svc = new MilestoneService(fetcher); // 不传 rateLimiter
  // 默认 1 小时 5 次 — 多次同 owner+milestone 后第 6 次被限
  const now = new Date().toISOString();
  const results = [];
  for (let i = 0; i < 7; i++) {
    results.push(await svc.grantFromEvent({
      ownerId: "u1",
      milestoneId: "first_project_created",
      sourceId: `evt-${i}`,
      occurredAt: now,
    }));
  }
  const granted = results.filter((r) => r.reason === "granted").length;
  const limited = results.filter((r) => r.reason === "rate_limited").length;
  assert.equal(granted, 5, "默认窗口内最多 5 次");
  assert.equal(limited, 2, "第 6、7 次被限");
});

// ============================================================
// 16. MilestoneServiceError 结构
// ============================================================

test("MilestoneServiceError — 结构正确", () => {
  const err = new MilestoneServiceError("rate_limited", "too many", 429);
  assert.equal(err.name, "MilestoneServiceError");
  assert.equal(err.code, "rate_limited");
  assert.equal(err.status, 429);
  assert.match(err.message, /rate_limited/);
});

// ============================================================
// 17. actions.ts 不导出 grantMilestone 直接执行器 (LLM 不可绕过反刷量)
// ============================================================

test("K21-KK-023: milestones.ts 必须经过 MilestoneService (不能被绕过)", () => {
  const src = fs.readFileSync(path.join(ROOT, "lib/server/v2/kk/milestones.ts"), "utf-8");
  // 不得导出绕过反刷量的直接 RPC 调用函数
  assert.ok(!/export\s+(async\s+)?function\s+grantMilestoneDirect/.test(src),
    "不得导出绕过反刷量的直接执行器");
});
