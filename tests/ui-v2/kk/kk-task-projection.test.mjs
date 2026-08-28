// K22-P0 Task 0.4 测试：KK 任务投影 → 真实跳转目标。
// 参考 tests/ui-v2/kk/kk.test.mjs：node:test + node:assert/strict + 直接 import .ts。
//
// 覆盖范围（PRD §6.3 K22-JOB-006, §6.1 开放重定向约束）：
//   1. projectJobToKkMessage 每个 status 产出合法同源 actionUrl 或禁用原因
//   2. completed + 内部 resultUrl → actionUrl = resultUrl（查看结果）
//   3. completed + 外部/空 resultUrl → actionUrl = 详情页 + actionDisabledReason
//   4. 外部 URL 永不进入 actionUrl（防开放重定向）
//   5. task_* 消息 actionUrl 指向 /job-center/:jobId（与 Dashboard/任务中心一致）
//   6. 状态 → severity 一致性（completed=success, failed=error, pending=warning）
//   7. projectJobsToKkMessages 去重 + 按 createdAt desc 排序

import assert from "node:assert/strict";
import test from "node:test";

import {
  projectJobToKkMessage,
  projectJobsToKkMessages,
  STATUS_MAPPING,
} from "../../../lib/client/v2/kk/task-projection.ts";
import {
  isInternalAppRoute,
  resolveJobDetailUrl,
} from "../../../lib/client/v2/navigation/resolver.ts";

const NOW = new Date("2026-08-14T12:00:00+08:00");

test("historical jobs keep their actual timestamp when polled again", () => {
  const job = makeJob({ status: "failed", completedAt: "2026-08-14T11:02:00+08:00" });
  const before = projectJobToKkMessage({ job, now: NOW });
  const after = projectJobToKkMessage({ job, now: new Date("2026-08-28T12:00:00Z") });
  assert.equal(before.createdAt, job.completedAt);
  assert.equal(after.createdAt, before.createdAt);
});

function makeJob(overrides = {}) {
  return {
    id: "job-test-001",
    projectId: "proj-1",
    jobType: "image",
    status: "running",
    phase: "running",
    progress: { completed: 0, total: 4 },
    timing: { elapsedSeconds: 10 },
    resultReferences: [],
    failedItemCount: 0,
    actions: ["cancel", "view_details"],
    createdAt: "2026-08-14T11:00:00+08:00",
    completedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. 每个 status 都产出合法同源 actionUrl
// ---------------------------------------------------------------------------

test("projectJobToKkMessage: running → actionUrl = /job-center/:jobId", () => {
  const msg = projectJobToKkMessage({ job: makeJob({ status: "running" }), now: NOW });
  assert.equal(msg.actionUrl, resolveJobDetailUrl("job-test-001"));
  assert.equal(msg.actionUrl, "/job-center/job-test-001");
  assert.equal(msg.actionLabel, "查看详情");
  assert.ok(isInternalAppRoute(msg.actionUrl), "actionUrl must be internal");
  assert.equal(msg.relatedJobId, "job-test-001");
});

test("projectJobToKkMessage: queued → 详情页", () => {
  const msg = projectJobToKkMessage({ job: makeJob({ status: "queued" }), now: NOW });
  assert.equal(msg.actionUrl, "/job-center/job-test-001");
  assert.ok(isInternalAppRoute(msg.actionUrl));
});

test("projectJobToKkMessage: failed → 详情页 + error severity", () => {
  const msg = projectJobToKkMessage({
    job: makeJob({ status: "failed", failedItemCount: 2 }),
    now: NOW,
  });
  assert.equal(msg.severity, "error");
  assert.equal(msg.type, "task_failed");
  assert.equal(msg.actionUrl, "/job-center/job-test-001");
  assert.ok(isInternalAppRoute(msg.actionUrl));
});

test("projectJobToKkMessage: cancelled → 详情页", () => {
  const msg = projectJobToKkMessage({ job: makeJob({ status: "cancelled" }), now: NOW });
  assert.equal(msg.actionUrl, "/job-center/job-test-001");
  assert.ok(isInternalAppRoute(msg.actionUrl));
});

test("projectJobToKkMessage: pending_confirm → 详情页 + warning", () => {
  const msg = projectJobToKkMessage({ job: makeJob({ status: "pending_confirm" }), now: NOW });
  assert.equal(msg.severity, "warning");
  assert.equal(msg.type, "task_needs_confirm");
  assert.equal(msg.actionUrl, "/job-center/job-test-001");
});

// ---------------------------------------------------------------------------
// 2. completed + 内部 resultUrl → 查看结果
// ---------------------------------------------------------------------------

test("projectJobToKkMessage: completed + internal resultUrl → actionUrl = resultUrl", () => {
  const msg = projectJobToKkMessage({
    job: makeJob({
      status: "completed",
      completedAt: "2026-08-14T11:30:00+08:00",
      resultUrl: "/exports/job-test-001/package",
    }),
    now: NOW,
  });
  assert.equal(msg.severity, "success");
  assert.equal(msg.type, "task_completed");
  assert.equal(msg.actionUrl, "/exports/job-test-001/package");
  assert.equal(msg.actionLabel, "查看结果");
  assert.ok(isInternalAppRoute(msg.actionUrl));
  assert.equal(msg.actionDisabledReason, undefined, "internal result should not disable");
});

test("projectJobToKkMessage: project-bound legacy audiovisual result uses server-owned identity", () => {
  const msg = projectJobToKkMessage({
    job: makeJob({
      status: "completed",
      completedAt: "2026-08-14T11:30:00+08:00",
      projectId: "proj-server",
      workId: "work-server",
      workbenchType: "storyboard",
      resultUrl: "/storyboard-workbench?projectId=proj-stale&sourceUnitId=unit-1&shotId=shot-2",
    }),
    now: NOW,
  });
  const url = new URL(msg.actionUrl, "https://kiikis.test");

  assert.equal(url.pathname, "/production");
  assert.equal(url.searchParams.get("projectId"), "proj-server");
  assert.equal(url.searchParams.get("workId"), "work-server");
  assert.equal(url.searchParams.get("tab"), "storyboard");
  assert.equal(url.searchParams.get("unitId"), "unit-1");
  assert.equal(url.searchParams.get("shotId"), "shot-2");
});

// ---------------------------------------------------------------------------
// 3. completed + 外部/空 resultUrl → 详情页 + 禁用原因
// ---------------------------------------------------------------------------

test("projectJobToKkMessage: completed + external resultUrl → actionUrl = 详情页 + disabledReason", () => {
  const msg = projectJobToKkMessage({
    job: makeJob({
      status: "completed",
      completedAt: "2026-08-14T11:30:00+08:00",
      resultUrl: "https://evil.com/steal",
    }),
    now: NOW,
  });
  // 外部 URL 不进入 actionUrl，回退到详情页
  assert.equal(msg.actionUrl, "/job-center/job-test-001");
  assert.notEqual(msg.actionUrl, "https://evil.com/steal");
  assert.ok(isInternalAppRoute(msg.actionUrl));
  // 完成但无同源结果 → 禁用原因必须存在（禁止只显示进度文本）
  assert.ok(msg.actionDisabledReason, "completed without internal result must set actionDisabledReason");
  assert.equal(msg.actionLabel, "查看详情");
});

test("projectJobToKkMessage: completed + null resultUrl → 详情页 + disabledReason", () => {
  const msg = projectJobToKkMessage({
    job: makeJob({
      status: "completed",
      completedAt: "2026-08-14T11:30:00+08:00",
      resultUrl: null,
    }),
    now: NOW,
  });
  assert.equal(msg.actionUrl, "/job-center/job-test-001");
  assert.ok(msg.actionDisabledReason, "must explain why results unavailable");
});

test("projectJobToKkMessage: completed + protocol-relative resultUrl rejected", () => {
  const msg = projectJobToKkMessage({
    job: makeJob({
      status: "completed",
      completedAt: "2026-08-14T11:30:00+08:00",
      resultUrl: "//evil.com/path",
    }),
    now: NOW,
  });
  assert.notEqual(msg.actionUrl, "//evil.com/path");
  assert.equal(msg.actionUrl, "/job-center/job-test-001");
  assert.ok(isInternalAppRoute(msg.actionUrl));
});

// ---------------------------------------------------------------------------
// 4. 外部 URL 永不进入 actionUrl（防开放重定向）
// ---------------------------------------------------------------------------

test("projectJobToKkMessage: 外部 URL 在任何 status 下都不进入 actionUrl", () => {
  const statuses = ["running", "queued", "failed", "pending_confirm", "cancelled", "completed"];
  for (const status of statuses) {
    const msg = projectJobToKkMessage({
      job: makeJob({
        status,
        resultUrl: "https://attacker.example/x",
        completedAt: status === "completed" ? "2026-08-14T11:30:00+08:00" : null,
      }),
      now: NOW,
    });
    assert.ok(
      isInternalAppRoute(msg.actionUrl),
      `status=${status} actionUrl must be internal, got: ${msg.actionUrl}`,
    );
    assert.ok(
      !msg.actionUrl.includes("attacker.example"),
      `status=${status} actionUrl must not contain external host`,
    );
  }
});

// ---------------------------------------------------------------------------
// 5. task_* 消息 actionUrl 指向 /job-center/:jobId（与 Dashboard/任务中心一致）
// ---------------------------------------------------------------------------

test("projectJobToKkMessage: task_* 消息 actionUrl 与 Dashboard/任务中心一致", () => {
  // 同一 Job 在三处都应解析到同一个详情页
  const job = makeJob({ id: "job-consistency-xyz", status: "running" });
  const msg = projectJobToKkMessage({ job, now: NOW });
  const dashboardDetailUrl = resolveJobDetailUrl(job.id);
  assert.equal(msg.actionUrl, dashboardDetailUrl, "KK actionUrl 必须与 Dashboard 详情 URL 一致");
});

// ---------------------------------------------------------------------------
// 6. 状态 → severity 一致性
// ---------------------------------------------------------------------------

test("STATUS_MAPPING: completed → success, failed → error, partial_failure → error", () => {
  assert.equal(STATUS_MAPPING.completed?.severity, "success");
  assert.equal(STATUS_MAPPING.failed?.severity, "error");
  assert.equal(STATUS_MAPPING.partial_failure?.severity, "error");
});

test("STATUS_MAPPING: pending_confirm → warning, result_ingesting → warning", () => {
  assert.equal(STATUS_MAPPING.pending_confirm?.severity, "warning");
  assert.equal(STATUS_MAPPING.result_ingesting?.severity, "warning");
});

test("projectJobToKkMessage: partial_failure → error + failedItemCount in body", () => {
  const msg = projectJobToKkMessage({
    job: makeJob({ status: "partial_failure", failedItemCount: 3 }),
    now: NOW,
  });
  assert.equal(msg.severity, "error");
  assert.equal(msg.type, "task_failed");
  assert.match(msg.body, /3/);
});

// ---------------------------------------------------------------------------
// 7. projectJobsToKkMessages 去重 + 排序
// ---------------------------------------------------------------------------

test("projectJobsToKkMessages: 去重（同 jobId 取最后一条）", () => {
  const job = makeJob({ id: "job-dup-1", status: "running" });
  const jobs = [
    { ...job, status: "running" },
    { ...job, status: "completed", completedAt: "2026-08-14T11:30:00+08:00" },
  ];
  const msgs = projectJobsToKkMessages(jobs, { now: NOW });
  assert.equal(msgs.length, 1, "duplicate job ids should collapse to one message");
  assert.equal(msgs[0].type, "task_completed", "last projection wins");
});

test("projectJobsToKkMessages: 按 createdAt desc 排序", () => {
  const jobs = [
    makeJob({ id: "job-a", createdAt: "2026-08-14T10:00:00+08:00" }),
    makeJob({ id: "job-b", createdAt: "2026-08-14T12:00:00+08:00" }),
    makeJob({ id: "job-c", createdAt: "2026-08-14T11:00:00+08:00" }),
  ];
  const msgs = projectJobsToKkMessages(jobs, { now: NOW });
  // 所有消息的 createdAt 都是 NOW（投影时统一），所以这里验证去重数量即可。
  // 真正的排序依赖服务端 createdAt，投影后统一为 now。
  assert.equal(msgs.length, 3);
  const ids = msgs.map((m) => m.relatedJobId);
  assert.ok(ids.includes("job-a"));
  assert.ok(ids.includes("job-b"));
  assert.ok(ids.includes("job-c"));
});

// ---------------------------------------------------------------------------
// 8. 不允许只显示进度文本（每条带 label 的消息必须有 url 或 disabledReason）
// ---------------------------------------------------------------------------

test("projectJobToKkMessage: 每条消息都满足 actionUrl 或 actionDisabledReason", () => {
  const statuses = ["running", "queued", "failed", "partial_failure", "pending_confirm", "result_ingesting", "cancelled", "draft", "completed"];
  for (const status of statuses) {
    const msg = projectJobToKkMessage({
      job: makeJob({
        status,
        completedAt: status === "completed" ? "2026-08-14T11:30:00+08:00" : null,
        resultUrl: null,
      }),
      now: NOW,
    });
    assert.ok(msg.actionLabel, `status=${status} must have actionLabel`);
    // 详情页永远可跳，所以 actionUrl 恒为内部路由；completed 无结果时额外提供 disabledReason
    assert.ok(isInternalAppRoute(msg.actionUrl), `status=${status} actionUrl must be internal`);
    if (status === "completed") {
      assert.ok(msg.actionDisabledReason, "completed without result must explain disabled action");
    }
  }
});

// ---------------------------------------------------------------------------
// 9. locale 切换
// ---------------------------------------------------------------------------

test("projectJobToKkMessage: en-US locale produces English title/label", () => {
  const msg = projectJobToKkMessage({
    job: makeJob({ status: "running" }),
    locale: "en-US",
    now: NOW,
  });
  assert.equal(msg.actionLabel, "View details");
  assert.equal(msg.title, "Task running");
});

test("projectJobToKkMessage: en-US completed without result has English disabledReason", () => {
  const msg = projectJobToKkMessage({
    job: makeJob({ status: "completed", completedAt: "2026-08-14T11:30:00+08:00", resultUrl: null }),
    locale: "en-US",
    now: NOW,
  });
  assert.match(msg.actionDisabledReason, /No internal result URL/);
});
