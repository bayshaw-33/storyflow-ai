// K22-P0 Task 0.3 测试：transitionJob 状态机 + 导航解析器 + PATCH 契约。
// 参考 tests/ui-v2/dashboard/dashboard.test.mjs：node:test + node:assert/strict + 直接 import .ts。
//
// 覆盖范围（PRD §6.3 K22-JOB-004）：
//   1. transitionJob cancel/retry 合法/非法状态转换
//   2. owner 校验（not_found 当 jobId 不属于该 userId）
//   3. PATCH 命中三张 legacy 表
//   4. resolveJobDetailUrl / resolveActionTarget / resolveJobResultUrl
//   5. isInternalAppRoute 拒绝开放重定向
//   6. GenerationJob 契约新增 workId/workbenchType 等可选字段

import assert from "node:assert/strict";
import test from "node:test";

import {
  transitionJob,
  readUnifiedJob,
  V2JobsError,
} from "../../../lib/server/v2/jobs/index.ts";
import {
  resolveJobDetailUrl,
  resolveActionTarget,
  resolveJobResultUrl,
  isInternalAppRoute,
} from "../../../lib/client/v2/navigation/resolver.ts";

const USER_ID = "user-owner-001";
const JOB_ID = "job-abc-123";

/**
 * Build a mock fetcher that returns canned rows for each legacy table.
 * The fetcher inspects the path to decide which table is being queried.
 *
 * @param {object} opts
 * @param {object} [opts.tasksRow]   row returned by storyflow_generation_tasks
 * @param {object} [opts.jobsRow]    row returned by storyflow_generation_jobs
 * @param {object} [opts.exportsRow] row returned by storyflow_exports
 * @param {Array<{path:string,init?:object}>} [opts.patchLog] array to record PATCH calls
 */
function makeFetcher(opts = {}) {
  const { tasksRow = null, jobsRow = null, exportsRow = null, patchLog = [] } = opts;
  return async function fetcher(path, init) {
    // PATCH calls: record and return empty 204-like body.
    if (init && init.method === "PATCH") {
      patchLog.push({ path, init });
      return {};
    }
    // GET calls: return array of rows depending on which table is queried.
    if (path.includes("/storyflow_generation_tasks")) {
      return tasksRow ? [tasksRow] : [];
    }
    if (path.includes("/storyflow_generation_jobs")) {
      return jobsRow ? [jobsRow] : [];
    }
    if (path.includes("/storyflow_exports")) {
      return exportsRow ? [exportsRow] : [];
    }
    return [];
  };
}

function baseTaskRow(overrides = {}) {
  return {
    id: JOB_ID,
    user_id: USER_ID,
    project_id: "proj-1",
    step_key: "analysis",
    phase_key: null,
    status: "queued",
    error_message: null,
    output_snapshot: null,
    created_at: "2026-08-14T10:00:00+08:00",
    started_at: "2026-08-14T10:00:05+08:00",
    completed_at: null,
    latency_ms: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. transitionJob — cancel 合法状态
// ---------------------------------------------------------------------------

test("transitionJob cancel: queued → cancelled", async () => {
  const patchLog = [];
  const fetcher = makeFetcher({
    tasksRow: baseTaskRow({ status: "queued" }),
    patchLog,
  });
  const { job } = await transitionJob({
    fetcher,
    userId: USER_ID,
    jobId: JOB_ID,
    action: "cancel",
    now: new Date("2026-08-14T10:05:00+08:00"),
  });
  assert.equal(job.status, "cancelled");
  assert.equal(job.phase, "cancelled");
  assert.ok(job.completedAt, "completedAt should be set after cancel");
  // cancel should patch all three legacy tables
  assert.equal(patchLog.length, 3, "cancel must PATCH all three legacy tables");
  assert.ok(patchLog.every((p) => p.init.method === "PATCH"));
  // actions after cancel: only view_details
  assert.deepEqual(job.actions, ["view_details"]);
});

test("transitionJob cancel: running → cancelled", async () => {
  const fetcher = makeFetcher({
    tasksRow: baseTaskRow({ status: "running" }),
  });
  const { job } = await transitionJob({
    fetcher,
    userId: USER_ID,
    jobId: JOB_ID,
    action: "cancel",
  });
  assert.equal(job.status, "cancelled");
});

test("transitionJob cancel: result_ingesting → cancelled", async () => {
  const fetcher = makeFetcher({
    tasksRow: baseTaskRow({ status: "result_ingesting" }),
  });
  const { job } = await transitionJob({
    fetcher,
    userId: USER_ID,
    jobId: JOB_ID,
    action: "cancel",
  });
  assert.equal(job.status, "cancelled");
});

// ---------------------------------------------------------------------------
// 2. transitionJob — cancel 非法状态
// ---------------------------------------------------------------------------

test("transitionJob cancel: completed → validation_failed", async () => {
  const fetcher = makeFetcher({
    tasksRow: baseTaskRow({ status: "completed", completed_at: "2026-08-14T10:02:00+08:00" }),
  });
  await assert.rejects(
    () => transitionJob({ fetcher, userId: USER_ID, jobId: JOB_ID, action: "cancel" }),
    (err) => {
      assert.ok(err instanceof V2JobsError);
      assert.equal(err.code, "validation_failed");
      return true;
    },
  );
});

test("transitionJob cancel: failed → validation_failed", async () => {
  const fetcher = makeFetcher({
    tasksRow: baseTaskRow({ status: "failed", error_message: "provider timeout" }),
  });
  await assert.rejects(
    () => transitionJob({ fetcher, userId: USER_ID, jobId: JOB_ID, action: "cancel" }),
    (err) => {
      assert.equal(err.code, "validation_failed");
      return true;
    },
  );
});

test("transitionJob cancel: cancelled → validation_failed (idempotent reject)", async () => {
  const fetcher = makeFetcher({
    tasksRow: baseTaskRow({ status: "cancelled", completed_at: "2026-08-14T10:03:00+08:00" }),
  });
  await assert.rejects(
    () => transitionJob({ fetcher, userId: USER_ID, jobId: JOB_ID, action: "cancel" }),
    (err) => {
      assert.equal(err.code, "validation_failed");
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// 3. transitionJob — retry 合法状态
// ---------------------------------------------------------------------------

test("transitionJob retry: failed → queued (error cleared)", async () => {
  const patchLog = [];
  const fetcher = makeFetcher({
    tasksRow: baseTaskRow({ status: "failed", error_message: "provider timeout" }),
    patchLog,
  });
  const { job } = await transitionJob({
    fetcher,
    userId: USER_ID,
    jobId: JOB_ID,
    action: "retry",
  });
  assert.equal(job.status, "queued");
  assert.equal(job.phase, "queued");
  assert.equal(job.completedAt, null, "completedAt must be cleared on retry");
  assert.equal(job.failedItemCount, 0, "failedItemCount must reset on retry");
  // retry should patch all three legacy tables
  assert.equal(patchLog.length, 3, "retry must PATCH all three legacy tables");
  // actions after retry (queued): cancel + view_details
  assert.deepEqual(job.actions, ["cancel", "view_details"]);
});

test("transitionJob retry: partial_failure → queued", async () => {
  const fetcher = makeFetcher({
    tasksRow: baseTaskRow({ status: "partial_failure" }),
  });
  const { job } = await transitionJob({
    fetcher,
    userId: USER_ID,
    jobId: JOB_ID,
    action: "retry",
  });
  assert.equal(job.status, "queued");
});

// ---------------------------------------------------------------------------
// 4. transitionJob — retry 非法状态
// ---------------------------------------------------------------------------

test("transitionJob retry: completed → validation_failed", async () => {
  const fetcher = makeFetcher({
    tasksRow: baseTaskRow({ status: "completed", completed_at: "2026-08-14T10:02:00+08:00" }),
  });
  await assert.rejects(
    () => transitionJob({ fetcher, userId: USER_ID, jobId: JOB_ID, action: "retry" }),
    (err) => {
      assert.equal(err.code, "validation_failed");
      return true;
    },
  );
});

test("transitionJob retry: queued → validation_failed", async () => {
  const fetcher = makeFetcher({
    tasksRow: baseTaskRow({ status: "queued" }),
  });
  await assert.rejects(
    () => transitionJob({ fetcher, userId: USER_ID, jobId: JOB_ID, action: "retry" }),
    (err) => {
      assert.equal(err.code, "validation_failed");
      return true;
    },
  );
});

test("transitionJob retry: cancelled → validation_failed", async () => {
  const fetcher = makeFetcher({
    tasksRow: baseTaskRow({ status: "cancelled", completed_at: "2026-08-14T10:03:00+08:00" }),
  });
  await assert.rejects(
    () => transitionJob({ fetcher, userId: USER_ID, jobId: JOB_ID, action: "retry" }),
    (err) => {
      assert.equal(err.code, "validation_failed");
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// 5. transitionJob — owner / 存在性校验
// ---------------------------------------------------------------------------

test("transitionJob: job not found → not_found (owner mismatch yields not_found)", async () => {
  // fetcher returns empty arrays for all tables → no row matches
  const fetcher = makeFetcher({});
  await assert.rejects(
    () => transitionJob({ fetcher, userId: USER_ID, jobId: JOB_ID, action: "cancel" }),
    (err) => {
      assert.equal(err.code, "not_found");
      return true;
    },
  );
});

test("transitionJob: empty userId → unauthenticated", async () => {
  const fetcher = makeFetcher({ tasksRow: baseTaskRow() });
  await assert.rejects(
    () => transitionJob({ fetcher, userId: "", jobId: JOB_ID, action: "cancel" }),
    (err) => {
      assert.equal(err.code, "unauthenticated");
      return true;
    },
  );
});

test("transitionJob: empty jobId → validation_failed", async () => {
  const fetcher = makeFetcher({ tasksRow: baseTaskRow() });
  await assert.rejects(
    () => transitionJob({ fetcher, userId: USER_ID, jobId: "", action: "cancel" }),
    (err) => {
      assert.equal(err.code, "validation_failed");
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// 6. readUnifiedJob — 基本读取 + owner 过滤
// ---------------------------------------------------------------------------

test("readUnifiedJob: returns mapped job when row exists", async () => {
  const fetcher = makeFetcher({
    jobsRow: {
      id: JOB_ID,
      owner_id: USER_ID,
      project_id: "proj-1",
      job_type: "image",
      status: "running",
      error: null,
      result_metadata: { completedCount: 3, totalCount: 10 },
      created_at: "2026-08-14T10:00:00+08:00",
      updated_at: "2026-08-14T10:01:00+08:00",
      completed_at: null,
    },
  });
  const { job } = await readUnifiedJob({ fetcher, userId: USER_ID, jobId: JOB_ID });
  assert.equal(job.id, JOB_ID);
  assert.equal(job.jobType, "image");
  assert.equal(job.status, "running");
  assert.equal(job.progress.completed, 3);
  assert.equal(job.progress.total, 10);
});

test("readUnifiedJob: not_found when no row in any table", async () => {
  const fetcher = makeFetcher({});
  await assert.rejects(
    () => readUnifiedJob({ fetcher, userId: USER_ID, jobId: JOB_ID }),
    (err) => {
      assert.equal(err.code, "not_found");
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// 7. 导航解析器 — resolveJobDetailUrl
// ---------------------------------------------------------------------------

test("resolveJobDetailUrl: returns /job-center/:encodedJobId", () => {
  assert.equal(resolveJobDetailUrl("job-123"), "/job-center/job-123");
  // special chars are encoded (no open redirect / path injection)
  assert.equal(
    resolveJobDetailUrl("job/evil?x=1"),
    "/job-center/job%2Fevil%3Fx%3D1",
  );
});

test("resolveJobDetailUrl: throws on empty jobId", () => {
  assert.throws(() => resolveJobDetailUrl(""), /jobId is required/);
});

// ---------------------------------------------------------------------------
// 8. 导航解析器 — resolveActionTarget
// ---------------------------------------------------------------------------

test("resolveActionTarget: view_details returns job detail url", () => {
  assert.equal(
    resolveActionTarget({ kind: "view_details" }, { jobId: "job-1" }),
    "/job-center/job-1",
  );
});

test("resolveActionTarget: view_details returns null when no jobId", () => {
  assert.equal(resolveActionTarget({ kind: "view_details" }, {}), null);
});

test("resolveActionTarget: view_results accepts internal route", () => {
  assert.equal(
    resolveActionTarget({ kind: "view_results" }, { resultUrl: "/projects/p1/results" }),
    "/projects/p1/results",
  );
});

test("resolveActionTarget: view_results rejects external URL (open redirect guard)", () => {
  assert.equal(
    resolveActionTarget({ kind: "view_results" }, { resultUrl: "https://evil.com/x" }),
    null,
  );
  assert.equal(
    resolveActionTarget({ kind: "view_results" }, { resultUrl: "//evil.com" }),
    null,
  );
  assert.equal(
    resolveActionTarget({ kind: "view_results" }, { resultUrl: null }),
    null,
  );
});

test("resolveActionTarget: cancel/retry returns api endpoint", () => {
  assert.equal(
    resolveActionTarget({ kind: "cancel" }, { jobId: "job-1" }),
    "/api/v2/jobs/job-1",
  );
  assert.equal(
    resolveActionTarget({ kind: "retry" }, { jobId: "job-1" }),
    "/api/v2/jobs/job-1",
  );
});

test("resolveActionTarget: cancel/retry returns null when no jobId", () => {
  assert.equal(resolveActionTarget({ kind: "cancel" }, {}), null);
});

// ---------------------------------------------------------------------------
// 9. 导航解析器 — resolveJobResultUrl + isInternalAppRoute
// ---------------------------------------------------------------------------

test("resolveJobResultUrl: internal route passes through", () => {
  assert.equal(resolveJobResultUrl({ resultUrl: "/foo" }), "/foo");
});

test("resolveJobResultUrl: external/null rejected", () => {
  assert.equal(resolveJobResultUrl({ resultUrl: "https://x.com" }), null);
  assert.equal(resolveJobResultUrl({ resultUrl: null }), null);
  assert.equal(resolveJobResultUrl({}), null);
});

test("isInternalAppRoute: only same-origin app paths", () => {
  assert.equal(isInternalAppRoute("/foo"), true);
  assert.equal(isInternalAppRoute("/foo?bar=1"), true);
  // rejected
  assert.equal(isInternalAppRoute("//evil.com"), false);
  assert.equal(isInternalAppRoute("https://evil.com"), false);
  assert.equal(isInternalAppRoute(""), false);
  assert.equal(isInternalAppRoute(null), false);
  assert.equal(isInternalAppRoute(undefined), false);
  assert.equal(isInternalAppRoute(123), false);
});

// ---------------------------------------------------------------------------
// 10. 契约字段：GenerationJob 新增可选字段
// ---------------------------------------------------------------------------

test("GenerationJob contract: workId/workbenchType/targetType/targetId/detailUrl/resultUrl are optional", async () => {
  // readUnifiedJob 返回的 job 应能携带 Phase 0 新增字段（可选）。
  // 这里通过 jobsRow 模拟一个携带新字段的行，验证 mapLegacyJob 不会抛错。
  const fetcher = makeFetcher({
    jobsRow: {
      id: JOB_ID,
      owner_id: USER_ID,
      project_id: "proj-1",
      job_type: "video",
      status: "completed",
      error: null,
      result_metadata: {
        completedCount: 1,
        totalCount: 1,
        results: ["/exports/job-abc-123/package"],
        workId: "work-1",
        workbenchType: "video",
      },
      created_at: "2026-08-14T10:00:00+08:00",
      completed_at: "2026-08-14T10:02:00+08:00",
    },
  });
  const { job } = await readUnifiedJob({ fetcher, userId: USER_ID, jobId: JOB_ID });
  assert.equal(job.status, "completed");
  assert.deepEqual(job.resultReferences, ["/exports/job-abc-123/package"]);
  // actions for completed: view_results + view_details
  assert.deepEqual(job.actions, ["view_results", "view_details"]);
});
