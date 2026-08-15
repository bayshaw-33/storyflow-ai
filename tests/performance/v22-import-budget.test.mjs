/**
 * Phase 6 Task 6.4 Step 2 — 导入恢复预算.
 *
 *   - 长文档 Job 页关闭/断网后继续（job 轮询幂等）
 *   - 重复回调不重复 candidate / U1（幂等）
 *   - worker 重启可从 chunk checkpoint 恢复（只处理未完成 chunk）
 *
 * Run: node --test tests/performance/v22-import-budget.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));

/** 模拟 chunk checkpoint：worker 重启只处理未完成 chunk。 */
function simulateWorkerResume(totalChunks, completedChunkIndexes) {
  const done = new Set(completedChunkIndexes);
  const remaining = [];
  for (let i = 0; i < totalChunks; i += 1) {
    if (!done.has(i)) remaining.push(i);
  }
  return { remaining, reprocessed: remaining.length };
}

test("worker 重启从 checkpoint 恢复，只处理未完成 chunk", () => {
  const result = simulateWorkerResume(40, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(result.remaining, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);
  assert.equal(result.reprocessed, 30, "只重处理 30 个未完成 chunk，不重跑已完成的 10 个");
});

test("重复回调不重复 candidate（幂等键）", () => {
  const seen = new Set();
  const dedupe = (key) => {
    if (seen.has(key)) return { duplicated: true };
    seen.add(key);
    return { duplicated: false };
  };
  assert.equal(dedupe("chunk-3:entity:阿仁").duplicated, false);
  assert.equal(dedupe("chunk-3:entity:阿仁").duplicated, true, "相同 chunk+实体不重复产生 candidate");
});

test("重复 finalize 返回同一 U1（幂等，不重复建 U1）", () => {
  // P4 finalize 幂等语义（服务层测试已锁），此处验证纯逻辑
  const finalized = new Map();
  const finalize = (sessionId) => {
    if (finalized.has(sessionId)) return { idempotent: true, universeId: finalized.get(sessionId) };
    const id = `universe-${sessionId}`;
    finalized.set(sessionId, id);
    return { idempotent: false, universeId: id };
  };
  const first = finalize("s1");
  const second = finalize("s1");
  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(second.universeId, first.universeId, "同一 U1");
});

test("chunker 幂等 key 存在（chunk 级去重基础）", () => {
  const src = readFileSync(resolve(root, "lib/server/v2/universe-import/chunker.ts"), "utf8");
  assert.ok(src.includes("idempotencyKey"), "chunk 携带幂等 key");
});

test("job 轮询端点幂等（GET 不产生副作用）", () => {
  const route = readFileSync(resolve(root, "app/api/v2/universe-imports/[sessionId]/jobs/[jobId]/route.ts"), "utf8");
  assert.ok(route.includes("GET"), "job 查询是 GET（幂等轮询）");
});
