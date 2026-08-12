/**
 * K2-T-05 全局任务中心测试
 *
 * 验证：
 *   1. fixture 数据结构符合 UnifiedJob 契约
 *   2. contract_version 校验
 *   3. 任务分组逻辑（按 stage / type）
 *   4. stats 统计正确性（byStatus / byType）
 *   5. 不伪造百分比：total=0 时 elapsedMs 和 stage 仍正常显示
 *   6. 失败任务有可执行 actions
 *
 * 运行：node --test tests/ui-v2/task-center/*.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  CONTRACT_VERSION,
} from "../../../lib/client/v2/jobs/types.ts";
import {
  ALL_JOB_TYPES,
  STAGE_ORDER,
  computeStats,
  formatElapsed,
  formatEstimatedRemaining,
  formatProgress,
  groupJobsByStage,
  groupJobsByType,
  isActiveStage,
  isTerminalStage,
} from "../../../lib/client/v2/jobs/grouping.ts";

const VALID_STAGES = STAGE_ORDER;
const VALID_TYPES = ALL_JOB_TYPES;

const raw = readFileSync("tests/fixtures/kiikis-v2/jobs.json", "utf8");
const dataset = JSON.parse(raw);
const jobs = dataset.jobs;
const stats = dataset.stats;

// ============================================================
// 1. contract_version 校验
// ============================================================

test("fixture contractVersion 等于常量 CONTRACT_VERSION", () => {
  assert.equal(dataset.contractVersion, "2.0.0-alpha.1");
  assert.equal(dataset.contractVersion, CONTRACT_VERSION);
});

// ============================================================
// 2. fixture 数据结构契约
// ============================================================

test("jobs 至少 15 个，覆盖全部 9 个阶段与 7 个类型", () => {
  assert.ok(Array.isArray(jobs), "jobs 必须是数组");
  assert.ok(jobs.length >= 15, `jobs 至少 15 个，实际 ${jobs.length}`);

  const stages = new Set(jobs.map((j) => j.stage));
  for (const s of VALID_STAGES) {
    assert.ok(stages.has(s), `缺少阶段 ${s}`);
  }

  const types = new Set(jobs.map((j) => j.type));
  for (const t of VALID_TYPES) {
    assert.ok(types.has(t), `缺少类型 ${t}`);
  }
});

test("每个 job 字段结构符合 UnifiedJob 契约", () => {
  for (const job of jobs) {
    assert.equal(typeof job.id, "string", "id 必须是 string");
    assert.equal(typeof job.name, "string", "name 必须是 string");
    assert.ok(VALID_TYPES.includes(job.type), `type 非法: ${job.type}`);
    assert.equal(typeof job.projectName, "string");
    assert.equal(typeof job.projectId, "string");
    assert.equal(typeof job.workbenchType, "string");
    assert.ok(VALID_STAGES.includes(job.stage), `stage 非法: ${job.stage}`);
    assert.equal(typeof job.completed, "number");
    assert.equal(typeof job.total, "number");
    assert.equal(typeof job.elapsedMs, "number");
    assert.ok(Array.isArray(job.actions), "actions 必须是数组");
    assert.equal(typeof job.createdAt, "string");
    if (job.estimatedRangeMs) {
      assert.equal(typeof job.estimatedRangeMs.min, "number");
      assert.equal(typeof job.estimatedRangeMs.max, "number");
      assert.ok(job.estimatedRangeMs.confidence >= 0 && job.estimatedRangeMs.confidence <= 1);
    }
    for (const a of job.actions) {
      assert.ok(["retry", "cancel", "view_detail"].includes(a.type), `action.type 非法: ${a.type}`);
      assert.equal(typeof a.label, "string");
    }
  }
});

// ============================================================
// 3. 任务分组逻辑
// ============================================================

test("groupJobsByStage 把每个任务归入唯一阶段桶", () => {
  const grouped = groupJobsByStage(jobs);
  let total = 0;
  for (const stage of VALID_STAGES) {
    assert.ok(Array.isArray(grouped[stage]));
    total += grouped[stage].length;
  }
  assert.equal(total, jobs.length, "分组后总数必须等于 jobs.length");
});

test("groupJobsByType 把每个任务归入唯一类型桶", () => {
  const grouped = groupJobsByType(jobs);
  let total = 0;
  for (const type of VALID_TYPES) {
    assert.ok(Array.isArray(grouped[type]));
    total += grouped[type].length;
  }
  assert.equal(total, jobs.length);
});

// ============================================================
// 4. stats 统计正确性
// ============================================================

test("computeStats().byStatus 与 fixture.stats.byStatus 一致", () => {
  const computed = computeStats(jobs);
  assert.equal(computed.total, jobs.length);
  assert.equal(computed.total, stats.total);
  for (const stage of VALID_STAGES) {
    assert.equal(computed.byStatus[stage], stats.byStatus[stage], `byStatus[${stage}] 不匹配`);
  }
});

test("computeStats().byType 与 fixture.stats.byType 一致", () => {
  const computed = computeStats(jobs);
  for (const type of VALID_TYPES) {
    assert.equal(computed.byType[type], stats.byType[type], `byType[${type}] 不匹配`);
  }
  const typeSum = VALID_TYPES.reduce((s, t) => s + computed.byType[t], 0);
  assert.equal(typeSum, jobs.length);
});

test("byStatus 计数之和等于 total", () => {
  const statusSum = VALID_STAGES.reduce((s, st) => s + (stats.byStatus[st] || 0), 0);
  assert.equal(statusSum, stats.total);
});

// ============================================================
// 5. 不伪造百分比
// ============================================================

test("formatProgress 永不返回百分比符号", () => {
  for (const job of jobs) {
    const p = formatProgress(job);
    assert.ok(!p.includes("%"), `formatProgress 出现 %: ${p}`);
  }
});

test("total=0 的任务仍保留 stage 与 elapsedMs，且进度为空", () => {
  const zeroTotalJobs = jobs.filter((j) => j.total === 0);
  assert.ok(zeroTotalJobs.length >= 1, "fixture 应至少包含一个 total=0 的任务");
  for (const job of zeroTotalJobs) {
    assert.ok(VALID_STAGES.includes(job.stage), "total=0 时 stage 仍有效");
    assert.equal(typeof job.elapsedMs, "number", "total=0 时 elapsedMs 仍存在");
    assert.equal(formatProgress(job), "", "total=0 时 formatProgress 必须为空串");
    // 阶段 + 耗时 仍可正常格式化
    assert.ok(formatElapsed(job.elapsedMs).length > 0);
    assert.ok(formatEstimatedRemaining(job).length > 0);
  }
});

test("total>0 的任务进度展示为 completed/total 计数", () => {
  for (const job of jobs.filter((j) => j.total > 0)) {
    const p = formatProgress(job);
    assert.equal(p, `${job.completed}/${job.total}`);
  }
});

test("排队中无区间的任务展示阶段+已耗时+历史平均，不合成百分比", () => {
  const queuedNoRange = jobs.find((j) => j.stage === "queued" && !j.estimatedRangeMs);
  if (queuedNoRange) {
    const text = formatEstimatedRemaining(queuedNoRange);
    assert.ok(text.includes("排队中"), `应包含"排队中"，实际: ${text}`);
    assert.ok(!text.includes("%"), "不应合成百分比");
  }
});

// ============================================================
// 6. 失败任务有可执行 actions
// ============================================================

test("failed 与 partial_failure 任务都提供 retry 与 view_detail 动作", () => {
  const failedJobs = jobs.filter((j) => j.stage === "failed" || j.stage === "partial_failure");
  assert.ok(failedJobs.length >= 2, "应至少有 2 个失败/部分失败任务");
  for (const job of failedJobs) {
    const actionTypes = job.actions.map((a) => a.type);
    assert.ok(actionTypes.includes("retry"), `任务 ${job.id} 缺少 retry 动作`);
    assert.ok(actionTypes.includes("view_detail"), `任务 ${job.id} 缺少 view_detail 动作`);
    assert.ok(job.failureReason, `任务 ${job.id} 应有 failureReason`);
  }
});

test("终态任务可被识别，活跃任务可被识别", () => {
  for (const job of jobs) {
    if (["completed", "partial_failure", "failed", "cancelled"].includes(job.stage)) {
      assert.ok(isTerminalStage(job.stage), `${job.stage} 应为终态`);
    } else {
      assert.ok(!isTerminalStage(job.stage), `${job.stage} 不应为终态`);
    }
  }
  const active = jobs.filter((j) => isActiveStage(j.stage));
  assert.ok(active.length >= 1, "应至少有 1 个活跃任务");
});

test("computeStats 对空数组返回 0 计数", () => {
  const empty = computeStats([]);
  assert.equal(empty.total, 0);
  for (const stage of VALID_STAGES) assert.equal(empty.byStatus[stage], 0);
  for (const type of VALID_TYPES) assert.equal(empty.byType[type], 0);
});
