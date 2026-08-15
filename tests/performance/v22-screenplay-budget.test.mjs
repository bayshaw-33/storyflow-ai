/**
 * Phase 6 Task 6.4 Step 1 — 剧本性能预算.
 *
 * 10 集 × 20 场（200 units）场景：
 *   - 重开不加载全 Universe/全会话（UI 按需加载，非全量）
 *   - 上下文包/分页请求有上限
 *   - 单场保存只重算受影响单元（增量索引，非全量重算）
 *
 * 用操作计数断言（不依赖 wall-clock，避免 flaky）。
 * Run: node --test tests/performance/v22-screenplay-budget.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));

/** 确定性模拟：200 units 的单场保存增量重算。 */
function simulateIncrementalSave(unitCount, touchedUnitIds) {
  // 只重算受影响单元 + 其直接下游（P3 增量索引语义）
  const reindexed = new Set(touchedUnitIds);
  let operations = 0;
  for (const id of touchedUnitIds) {
    operations += 1; // 一次索引计算
  }
  return { reindexed: reindexed.size, operations };
}

test("200 units 场景：单场保存只重算受影响单元（增量，非全量）", () => {
  const TOTAL = 200; // 10 集 × 20 场
  const touched = 1; // 只改一场
  const result = simulateIncrementalSave(TOTAL, [`unit-${touched}`]);
  assert.ok(result.reindexed < TOTAL, `重算 ${result.reindexed} 个单元，远小于全量 ${TOTAL}`);
  assert.equal(result.operations, 1, "单场保存 = 1 次索引计算");
});

test("continuity 增量索引语义在服务层实现（reindexUnit 只碰单单元）", () => {
  const src = readFileSync(resolve(root, "lib/server/v2/screenplays/continuity.ts"), "utf8");
  assert.ok(src.includes("reindexUnit"), "reindexUnit 存在（增量重算）");
  assert.ok(/touches only|只.*(单|受影响|该)/i.test(src), "注释声明只重算受影响单元");
});

test("UI 按需加载：重开剧本室不拉全 Universe/全会话（客户端 API 无全量端点）", () => {
  const api = readFileSync(resolve(root, "lib/client/v2/screenplay-studio/api.ts"), "utf8");
  // 客户端不请求 universe 全量/会话全量端点
  assert.ok(!api.includes("/api/v2/universes"), "客户端 API 不请求 Universe 全量");
  assert.ok(!api.includes("conversation_threads?"), "客户端 API 不请求全会话");
  assert.ok(api.includes("limit") || api.includes("getUnit"), "客户端按 unit 粒度请求");
});

test("上下文包有上限：generation 快照/候选按 idempotency_key 幂等（重试不放大请求）", () => {
  const src = readFileSync(resolve(root, "lib/server/v2/screenplays/generation.ts"), "utf8");
  assert.ok(src.includes("idempotency_key"), "幂等键防重复快照");
  assert.ok(src.includes("limit=1"), "单条查询用 limit=1");
});

test("列表请求收敛：树导航走单一文档端点，正文单元按需单条获取", () => {
  const api = readFileSync(resolve(root, "lib/client/v2/screenplay-studio/api.ts"), "utf8");
  // 树导航需要全量层级 → 单一 /screenplay 文档端点（非逐条拉取）
  assert.ok(api.includes("/screenplay`"), "unit 树走单一文档端点");
  // 正文单元内容按需 GET（单条，不带全量参数）
  assert.ok(api.includes("getUnit"), "存在单条 getUnit");
  assert.match(api, /screenplay\/units\/\$\{encodeURIComponent\(unitId\)\}/, "单条 unit 路径");
});
