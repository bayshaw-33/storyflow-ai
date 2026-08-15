// K2-T-01 Dashboard 测试：fixture 结构、contract_version 校验、loadDashboardFixture 行为。
// 参考 tests/creation-state.test.mjs 写法：node:test + node:assert/strict + 直接 import .ts。

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  assertContractVersion,
  CONTRACT_VERSION,
} from "../../../lib/client/v2/dashboard/types.ts";
import {
  DashboardFixtureError,
  loadDashboardFixture,
} from "../../../lib/client/v2/dashboard/fixtures.ts";
import {
  dashboardEmptyFixture,
  dashboardErrorFixture,
  dashboardFixture,
} from "../../../lib/client/v2/dashboard/fixture-data.ts";

const FIXTURE_DIR = path.join(process.cwd(), "tests/fixtures/kiikis-v2");

function readFixture(name) {
  const raw = fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), "utf-8");
  return JSON.parse(raw);
}

// 校验 fixture 数据结构符合 DashboardData 类型定义。
function validateDashboardData(data) {
  assert.equal(typeof data.contractVersion, "string", "contractVersion 必须是字符串");
  assert.ok(Array.isArray(data.recentProjects), "recentProjects 必须是数组");
  assert.ok(Array.isArray(data.pendingConfirmations), "pendingConfirmations 必须是数组");
  assert.ok(Array.isArray(data.runningJobs), "runningJobs 必须是数组");
  assert.ok(Array.isArray(data.recentUniverses), "recentUniverses 必须是数组");
  assert.ok(Array.isArray(data.recentWorks), "recentWorks 必须是数组");
  assert.equal(typeof data.nextStepHint, "string", "nextStepHint 必须是字符串");

  for (const p of data.recentProjects) {
    assert.equal(typeof p.id, "string");
    assert.equal(typeof p.title, "string");
    assert.equal(typeof p.workflowType, "string");
    assert.equal(typeof p.currentStage, "string");
    assert.equal(typeof p.lastSavedAt, "string");
    assert.equal(typeof p.universeBound, "boolean");
    if (p.universeId !== undefined) assert.equal(typeof p.universeId, "string");
  }

  const validConfirmTypes = ["change_proposal", "canon_check", "asset_review"];
  for (const c of data.pendingConfirmations) {
    assert.ok(validConfirmTypes.includes(c.type), `pendingConfirmation.type 非法: ${c.type}`);
    assert.equal(typeof c.confidence, "number");
    assert.ok(c.confidence >= 0 && c.confidence <= 1, "confidence 必须在 0-1 之间");
  }

  const validStages = [
    "draft", "pending_confirm", "queued", "generating", "result_ingesting",
    "completed", "partial_failure", "failed", "cancelled",
  ];
  for (const j of data.runningJobs) {
    assert.ok(validStages.includes(j.stage), `runningJob.stage 非法: ${j.stage}`);
    assert.equal(typeof j.completed, "number");
    assert.equal(typeof j.total, "number");
    assert.ok(j.completed <= j.total, "completed 不能大于 total");
    assert.equal(typeof j.estimatedRangeMs, "object");
    assert.ok(j.estimatedRangeMs.min <= j.estimatedRangeMs.max, "estimate min 不能大于 max");
  }

  for (const u of data.recentUniverses) {
    const h = u.healthSummary;
    assert.equal(typeof h.canonCompleteness, "number");
    assert.equal(typeof h.characterCompleteness, "number");
    assert.equal(typeof h.relationshipTimeline, "number");
    assert.equal(typeof h.assetCoverage, "number");
    assert.equal(typeof h.pendingProposals, "number");
    assert.equal(typeof h.conflicts, "number");
  }
}

test("CONTRACT_VERSION 与 PRD §11.2 冻结值一致", () => {
  assert.equal(CONTRACT_VERSION, "2.0.0-alpha.1");
});

test("assertContractVersion 匹配时通过，不匹配时抛错", () => {
  assert.doesNotThrow(() => assertContractVersion("2.0.0-alpha.1"));
  assert.throws(
    () => assertContractVersion("1.0.0"),
    /contract version mismatch/,
  );
});

test("dashboard.json 结构符合 DashboardData 类型", () => {
  const data = readFixture("dashboard");
  validateDashboardData(data);
  assert.ok(data.recentProjects.length > 0, "正常 fixture 应至少有一个最近项目");
  assert.ok(data.pendingConfirmations.length > 0, "正常 fixture 应至少有一个待确认项");
  assert.ok(data.runningJobs.length > 0, "正常 fixture 应至少有一个运行中任务");
});

test("dashboard.json 的 contractVersion 与 CONTRACT_VERSION 一致", () => {
  const data = readFixture("dashboard");
  assert.equal(data.contractVersion, CONTRACT_VERSION);
});

test("loadDashboardFixture('dashboard') 返回正确数据", async () => {
  const data = await loadDashboardFixture("dashboard");
  validateDashboardData(data);
  assert.equal(data.contractVersion, CONTRACT_VERSION);
  assert.ok(data.recentProjects[0].title.length > 0);
});

test("dashboard-empty.json 所有列表为空且 nextStepHint 引导首次使用", () => {
  const data = readFixture("dashboard-empty");
  validateDashboardData(data);
  assert.equal(data.recentProjects.length, 0);
  assert.equal(data.pendingConfirmations.length, 0);
  assert.equal(data.runningJobs.length, 0);
  assert.equal(data.recentUniverses.length, 0);
  assert.equal(data.recentWorks.length, 0);
  assert.ok(data.nextStepHint.length > 0, "空 fixture 应给出首次使用引导");
});

test("loadDashboardFixture('dashboard-empty') 返回空数据", async () => {
  const data = await loadDashboardFixture("dashboard-empty");
  assert.equal(data.recentProjects.length, 0);
  assert.equal(data.runningJobs.length, 0);
  assert.equal(data.recentUniverses.length, 0);
});

test("dashboard-error.json 包含 error 字段", () => {
  const data = readFixture("dashboard-error");
  assert.ok(data.error, "error fixture 必须包含 error 字段");
  assert.equal(typeof data.error.code, "string");
  assert.equal(typeof data.error.message, "string");
  assert.equal(data.contractVersion, CONTRACT_VERSION, "error fixture 仍需带 contractVersion");
});

test("loadDashboardFixture('dashboard-error') 抛 DashboardFixtureError", async () => {
  await assert.rejects(
    () => loadDashboardFixture("dashboard-error"),
    (err) => {
      assert.ok(err instanceof DashboardFixtureError, "应是 DashboardFixtureError");
      assert.equal(err.code, "DASHBOARD_FETCH_FAILED");
      return true;
    },
  );
});

test("三份 fixture 的 contractVersion 都匹配契约", () => {
  for (const name of ["dashboard", "dashboard-empty", "dashboard-error"]) {
    const data = readFixture(name);
    assert.equal(data.contractVersion, CONTRACT_VERSION, `${name}.json contractVersion 不匹配`);
  }
});

test("Universe 健康度六维度齐全（对齐 PRD §7.8）", () => {
  const data = readFixture("dashboard");
  for (const u of data.recentUniverses) {
    const keys = Object.keys(u.healthSummary).sort();
    assert.deepEqual(
      keys,
      [
        "assetCoverage",
        "canonCompleteness",
        "characterCompleteness",
        "conflicts",
        "pendingProposals",
        "relationshipTimeline",
      ],
      `Universe ${u.id} 健康度维度不齐`,
    );
  }
});

// 防数据漂移：TS 内联数据必须与 tests/fixtures/kiikis-v2/*.json 完全一致。
// 这样 JSON 文件作为 K2-I-01 集成校验依据、TS 模块作为浏览器运行时数据源，两者不会脱节。
test("TS 内联 dashboardFixture 与 dashboard.json 一致（防数据漂移）", () => {
  const json = readFixture("dashboard");
  assert.deepEqual(JSON.parse(JSON.stringify(dashboardFixture)), json);
});

test("TS 内联 dashboardEmptyFixture 与 dashboard-empty.json 一致（防数据漂移）", () => {
  const json = readFixture("dashboard-empty");
  assert.deepEqual(JSON.parse(JSON.stringify(dashboardEmptyFixture)), json);
});

test("TS 内联 dashboardErrorFixture 与 dashboard-error.json 一致（防数据漂移）", () => {
  const json = readFixture("dashboard-error");
  assert.deepEqual(JSON.parse(JSON.stringify(dashboardErrorFixture)), json);
});

test("loadDashboardFixture 未知 fixture 名抛错", async () => {
  await assert.rejects(
    () => loadDashboardFixture("nonexistent"),
    (err) => {
      assert.ok(err instanceof DashboardFixtureError);
      assert.equal(err.code, "DASHBOARD_FIXTURE_NOT_FOUND");
      return true;
    },
  );
});

// ============================================================
// Phase 0 Task 0.3: code inspection — DashboardSections & DashboardClient
// ============================================================

test("DashboardSections.tsx does not reference deleted resolver functions", () => {
  const src = fs.readFileSync(path.resolve("components/v2/dashboard/DashboardSections.tsx"), "utf8");
  assert.ok(!/resolveProjectTarget/.test(src), "DashboardSections must not reference resolveProjectTarget");
  assert.ok(!/fromRecentProject/.test(src), "DashboardSections must not reference fromRecentProject");
  assert.ok(!/fromDashboardJob/.test(src), "DashboardSections must not reference fromDashboardJob");
});

test("DashboardSections RunningJobsSection uses resolveJobDetailUrl for navigation", () => {
  const src = fs.readFileSync(path.resolve("components/v2/dashboard/DashboardSections.tsx"), "utf8");
  assert.ok(/resolveJobDetailUrl/.test(src), "DashboardSections must reference resolveJobDetailUrl");
  assert.ok(/resolveJobDetailUrl\s*\(\s*job\.id\s*\)/.test(src), "RunningJobsSection must use resolveJobDetailUrl(job.id)");
});

test("dashboard project management uses real project data and card-plus-table layout", () => {
  const clientSrc = fs.readFileSync(path.resolve("components/v2/dashboard/DashboardClient.tsx"), "utf8");
  const managementSrc = fs.readFileSync(path.resolve("components/v2/dashboard/ProjectManagement.tsx"), "utf8");
  assert.match(clientSrc, /ProjectManagement/);
  assert.match(managementSrc, /fetchProjectLibrary/);
  assert.match(managementSrc, /deleteProjectFromLibrary/);
  assert.match(managementSrc, /projectGrid/);
  assert.match(managementSrc, /<table/);
  assert.match(managementSrc, /getProjectWorkbenchHref/);
});

test("production job list is fail-closed by default instead of fixture-on", () => {
  const src = fs.readFileSync(path.resolve("lib/client/v2/jobs/api.ts"), "utf8");
  assert.match(src, /NEXT_PUBLIC_USE_JOB_FIXTURE\s*===\s*["']true["']/);
});
