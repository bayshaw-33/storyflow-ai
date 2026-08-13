/**
 * K2-I-02 任务中心 API 适配器测试
 *
 * 验证 lib/client/v2/jobs/api.ts 在 USE_FIXTURE=false 模式下：
 *   1. 调用 GET /api/v2/jobs（路径、方法、headers）
 *   2. filters 转换为 projectId/jobType/status 查询参数
 *   3. Codex GenerationJob DTO 正确映射为 UnifiedJob
 *      - timing.elapsedSeconds → elapsedMs（×1000）
 *      - timing.estimatedSeconds* → estimatedRangeMs.min/max（×1000）
 *      - timing.estimateConfidence → confidence（high=0.9/medium=0.7/low=0.5）
 *      - progress.completed/total → 平铺 completed/total
 *      - actions 字符串 → JobAction（带中文 label）
 *      - resultReferences → currentResult（join）+ resultUrl（首项）
 *      - failedItemCount + status → failureReason
 *      - jobType → type + workbenchType（粗粒度映射）
 *      - name/projectName 降级（Codex 不提供）
 *   4. 错误响应（401/404/503/网络异常）抛出带 code 的 JobsApiError
 *   5. cancelJob 调用 1.0 POST /api/production/jobs action=cancel
 *   6. retryJob 抛 not_implemented
 *   7. stats 基于映射后的 jobs 计算
 *
 * 运行：node --test tests/ui-v2/task-center/*.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

// 必须在 import api.ts 之前设置，使 USE_FIXTURE=false
process.env.NEXT_PUBLIC_USE_JOB_FIXTURE = "false";

const { fetchJobs, cancelJob, retryJob, JobsApiError, USE_FIXTURE } = await import(
  "../../../lib/client/v2/jobs/api.ts"
);

// ============ mock fetch 工具 ============

let lastCall = null;

function mockFetchOnce(response, status = 200) {
  lastCall = null;
  globalThis.fetch = async (url, init) => {
    lastCall = { url: String(url), init };
    const body = typeof response === "string" ? response : JSON.stringify(response);
    return new Response(body, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function mockFetchThrow(err) {
  lastCall = null;
  globalThis.fetch = async () => {
    throw err;
  };
}

function getLastCall() {
  return lastCall;
}

function makeCodexJob(overrides = {}) {
  return {
    id: "job-xyz-123456",
    projectId: "p-101",
    jobType: "video",
    status: "running",
    phase: "running",
    progress: { completed: 3, total: 10 },
    timing: {
      elapsedSeconds: 150,
      estimatedSecondsMin: 300,
      estimatedSecondsMax: 480,
      estimateConfidence: "high",
    },
    resultReferences: ["/projects/p-101/video?shot=s1", "/projects/p-101/video?shot=s2"],
    failedItemCount: 0,
    actions: ["cancel", "view_details"],
    createdAt: "2026-08-12T01:12:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

// ============================================================
// 1. USE_FIXTURE 已关闭
// ============================================================

test("USE_FIXTURE 在 NEXT_PUBLIC_USE_JOB_FIXTURE=false 时为 false", () => {
  assert.equal(USE_FIXTURE, false);
});

// ============================================================
// 2. fetchJobs 调用 GET /api/v2/jobs
// ============================================================

test("fetchJobs 调用 GET /api/v2/jobs 并携带 Bearer token", async () => {
  mockFetchOnce({ success: true, contractVersion: "2.0.0-alpha.1", items: [], hasMore: false });
  await fetchJobs("token-abc");
  const call = getLastCall();
  assert.equal(call.init.method, "GET", "应为 GET 方法");
  assert.equal(call.url, "/api/v2/jobs", "API 路径应为 /api/v2/jobs");
  assert.equal(call.init.headers.Authorization, "Bearer token-abc", "应携带 Bearer token");
  assert.equal(call.init.headers["Content-Type"], "application/json");
});

test("fetchJobs 不传 token 时不带 Authorization", async () => {
  mockFetchOnce({ success: true, contractVersion: "2.0.0-alpha.1", items: [], hasMore: false });
  await fetchJobs(null);
  const call = getLastCall();
  assert.equal(call.init.headers.Authorization, undefined, "无 token 时不应带 Authorization");
});

test("fetchJobs 不带 filters 时 URL 无 query string", async () => {
  mockFetchOnce({ success: true, contractVersion: "2.0.0-alpha.1", items: [], hasMore: false });
  await fetchJobs("t");
  const call = getLastCall();
  assert.equal(call.url, "/api/v2/jobs");
});

// ============================================================
// 3. filters 转 query string
// ============================================================

test("fetchJobs 把 filters 转为 projectId/jobType/status 查询参数", async () => {
  mockFetchOnce({ success: true, contractVersion: "2.0.0-alpha.1", items: [], hasMore: false });
  await fetchJobs("t", { projectId: "p-1", type: "image", stage: "running" });
  const call = getLastCall();
  assert.equal(call.url, "/api/v2/jobs?projectId=p-1&jobType=image&status=running");
});

test("fetchJobs 部分 filters 只输出对应参数", async () => {
  mockFetchOnce({ success: true, contractVersion: "2.0.0-alpha.1", items: [], hasMore: false });
  await fetchJobs("t", { type: "text" });
  const call = getLastCall();
  assert.equal(call.url, "/api/v2/jobs?jobType=text");
});

// ============================================================
// 4. Codex GenerationJob → UnifiedJob DTO 映射
// ============================================================

test("fetchJobs 把 Codex GenerationJob 正确映射为 UnifiedJob（running 任务）", async () => {
  mockFetchOnce({
    success: true,
    contractVersion: "2.0.0-alpha.1",
    items: [makeCodexJob()],
    hasMore: false,
  });
  const result = await fetchJobs("t");
  assert.equal(result.source, "api");
  assert.equal(result.contractVersion, "2.0.0-alpha.1");
  assert.equal(result.jobs.length, 1);

  const job = result.jobs[0];
  assert.equal(job.id, "job-xyz-123456");
  assert.equal(job.type, "video", "jobType → type");
  assert.equal(job.projectId, "p-101");
  assert.equal(job.stage, "running", "status → stage（running 不是 generating）");
  assert.equal(job.completed, 3, "progress.completed → completed");
  assert.equal(job.total, 10, "progress.total → total");
  assert.equal(job.elapsedMs, 150000, "timing.elapsedSeconds * 1000");
  assert.deepEqual(
    job.estimatedRangeMs,
    { min: 300000, max: 480000, confidence: 0.9 },
    "timing.estimatedSeconds* * 1000 + confidence high→0.9",
  );
  assert.equal(
    job.currentResult,
    "/projects/p-101/video?shot=s1、/projects/p-101/video?shot=s2",
    "resultReferences join 为 currentResult",
  );
  assert.equal(job.resultUrl, "/projects/p-101/video?shot=s1", "resultReferences 首项为 resultUrl");
  assert.equal(job.failureReason, undefined, "running 无 failureReason");
  assert.deepEqual(
    job.actions,
    [
      { type: "cancel", label: "取消" },
      { type: "view_detail", label: "查看详情" },
    ],
    "actions 字符串 → JobAction 带 label",
  );
  assert.equal(job.createdAt, "2026-08-12T01:12:00.000Z");
  assert.equal(job.projectName, "未知项目", "Codex 无 projectName，降级为未知项目");
  assert.equal(job.workbenchType, "video", "jobType=video → workbenchType=video");
  assert.ok(job.name.includes("视频"), `name 应含"视频"：${job.name}`);
  assert.ok(job.name.includes("job-xy"), `name 应含 id 前 6 位：${job.name}`);
});

test("partial_failure 任务映射 failureReason 与 retry 动作", async () => {
  const codexJob = makeCodexJob({
    id: "job-pf",
    projectId: null,
    jobType: "image",
    status: "partial_failure",
    phase: "partial_failure",
    progress: { completed: 7, total: 10 },
    timing: { elapsedSeconds: 600 },
    resultReferences: [],
    failedItemCount: 3,
    actions: ["retry", "view_details"],
    createdAt: "2026-08-12T00:30:00.000Z",
  });
  mockFetchOnce({
    success: true,
    contractVersion: "2.0.0-alpha.1",
    items: [codexJob],
    hasMore: false,
  });
  const result = await fetchJobs("t");
  const job = result.jobs[0];
  assert.equal(job.failureReason, "部分失败，3 项未完成");
  assert.equal(job.projectId, "", "null projectId 应映射为空串");
  assert.equal(job.workbenchType, "art", "jobType=image → workbenchType=art");
  assert.equal(job.elapsedMs, 600000);
  assert.equal(job.estimatedRangeMs, undefined, "无 estimatedSeconds 时不应构造区间");
  assert.equal(job.currentResult, undefined, "空 resultReferences → currentResult undefined");
  assert.equal(job.resultUrl, undefined);
  assert.deepEqual(job.actions, [
    { type: "retry", label: "重试" },
    { type: "view_detail", label: "查看详情" },
  ]);
});

test("failed 任务映射 failureReason（无 failedItemCount 时降级文案）", async () => {
  const codexJob = makeCodexJob({
    id: "j-f",
    projectId: "p-1",
    jobType: "export",
    status: "failed",
    phase: "failed",
    progress: { completed: 0, total: 1 },
    timing: { elapsedSeconds: 45 },
    actions: ["retry", "view_details"],
    createdAt: "2026-08-12T02:00:00.000Z",
  });
  mockFetchOnce({
    success: true,
    contractVersion: "2.0.0-alpha.1",
    items: [codexJob],
    hasMore: false,
  });
  const result = await fetchJobs("t");
  assert.equal(result.jobs[0].failureReason, "任务失败");
  assert.equal(result.jobs[0].workbenchType, "production", "jobType=export → workbenchType=production");
});

test("estimateConfidence medium/low 映射为 0.7/0.5", async () => {
  const items = [
    makeCodexJob({
      id: "j-m",
      jobType: "text",
      status: "queued",
      timing: {
        elapsedSeconds: 10,
        estimatedSecondsMin: 60,
        estimatedSecondsMax: 120,
        estimateConfidence: "medium",
      },
      actions: [],
    }),
    makeCodexJob({
      id: "j-l",
      jobType: "text",
      status: "queued",
      timing: {
        elapsedSeconds: 10,
        estimatedSecondsMin: 60,
        estimatedSecondsMax: 120,
        estimateConfidence: "low",
      },
      actions: [],
    }),
  ];
  mockFetchOnce({ success: true, contractVersion: "2.0.0-alpha.1", items, hasMore: false });
  const result = await fetchJobs("t");
  assert.equal(result.jobs[0].estimatedRangeMs.confidence, 0.7, "medium → 0.7");
  assert.equal(result.jobs[1].estimatedRangeMs.confidence, 0.5, "low → 0.5");
});

test("estimateConfidence 缺失时不构造 estimatedRangeMs", async () => {
  const codexJob = makeCodexJob({
    id: "j-nc",
    jobType: "text",
    status: "queued",
    timing: {
      elapsedSeconds: 10,
      estimatedSecondsMin: 60,
      estimatedSecondsMax: 120,
      estimateConfidence: null,
    },
    actions: [],
  });
  mockFetchOnce({
    success: true,
    contractVersion: "2.0.0-alpha.1",
    items: [codexJob],
    hasMore: false,
  });
  const result = await fetchJobs("t");
  assert.equal(result.jobs[0].estimatedRangeMs, undefined, "confidence 为 null 时不应构造区间");
});

test("view_results 动作映射为 view_detail + 查看结果 label", async () => {
  const codexJob = makeCodexJob({
    id: "j-c",
    jobType: "export",
    status: "completed",
    phase: "completed",
    progress: { completed: 1, total: 1 },
    timing: { elapsedSeconds: 100 },
    resultReferences: ["/exports/ex-001"],
    actions: ["view_results", "view_details"],
  });
  mockFetchOnce({
    success: true,
    contractVersion: "2.0.0-alpha.1",
    items: [codexJob],
    hasMore: false,
  });
  const result = await fetchJobs("t");
  assert.deepEqual(result.jobs[0].actions, [
    { type: "view_detail", label: "查看结果" },
    { type: "view_detail", label: "查看详情" },
  ]);
  assert.equal(result.jobs[0].resultUrl, "/exports/ex-001");
});

test("jobType 全覆盖 workbenchType 映射", async () => {
  const cases = [
    { jobType: "text", expected: "text" },
    { jobType: "image", expected: "art" },
    { jobType: "video", expected: "video" },
    { jobType: "audio", expected: "song" },
    { jobType: "export", expected: "production" },
    { jobType: "transfer", expected: "production" },
    { jobType: "analysis", expected: "analysis" },
  ];
  const items = cases.map((c, i) =>
    makeCodexJob({
      id: `j-${i}`,
      jobType: c.jobType,
      status: "draft",
      progress: { completed: 0, total: 0 },
      timing: undefined,
      resultReferences: [],
      actions: [],
    }),
  );
  mockFetchOnce({ success: true, contractVersion: "2.0.0-alpha.1", items, hasMore: false });
  const result = await fetchJobs("t");
  for (let i = 0; i < cases.length; i++) {
    assert.equal(
      result.jobs[i].workbenchType,
      cases[i].expected,
      `jobType=${cases[i].jobType} → workbenchType=${cases[i].expected}`,
    );
  }
});

test("timing 缺失时 elapsedMs=0 且无 estimatedRangeMs", async () => {
  const codexJob = makeCodexJob({
    id: "j-nt",
    timing: undefined,
  });
  mockFetchOnce({
    success: true,
    contractVersion: "2.0.0-alpha.1",
    items: [codexJob],
    hasMore: false,
  });
  const result = await fetchJobs("t");
  assert.equal(result.jobs[0].elapsedMs, 0);
  assert.equal(result.jobs[0].estimatedRangeMs, undefined);
});

test("progress 缺失时 completed/total 降级为 0", async () => {
  const codexJob = makeCodexJob({ id: "j-np", progress: undefined });
  // progress 是必填字段，但防御性测试：删除后映射应降级
  delete codexJob.progress;
  mockFetchOnce({
    success: true,
    contractVersion: "2.0.0-alpha.1",
    items: [codexJob],
    hasMore: false,
  });
  const result = await fetchJobs("t");
  assert.equal(result.jobs[0].completed, 0);
  assert.equal(result.jobs[0].total, 0);
});

test("resultReferences 含 http URL 时优先作为 resultUrl", async () => {
  const codexJob = makeCodexJob({
    id: "j-url",
    jobType: "image",
    status: "completed",
    resultReferences: ["https://cdn.example.com/img-1.png", "/local/path"],
  });
  mockFetchOnce({
    success: true,
    contractVersion: "2.0.0-alpha.1",
    items: [codexJob],
    hasMore: false,
  });
  const result = await fetchJobs("t");
  assert.equal(result.jobs[0].resultUrl, "https://cdn.example.com/img-1.png");
});

// ============================================================
// 5. 错误状态抛 JobsApiError
// ============================================================

test("401 响应抛 JobsApiError code=unauthenticated", async () => {
  mockFetchOnce(
    { success: false, error: "Authentication is required.", code: "unauthenticated" },
    401,
  );
  await assert.rejects(
    () => fetchJobs("t"),
    (err) =>
      err instanceof JobsApiError &&
      err.code === "unauthenticated" &&
      err.httpStatus === 401 &&
      err.message.includes("Authentication"),
  );
});

test("404 响应抛 JobsApiError code=not_found", async () => {
  mockFetchOnce({ success: false, error: "Job not found.", code: "not_found" }, 404);
  await assert.rejects(
    () => fetchJobs("t"),
    (err) => err instanceof JobsApiError && err.code === "not_found" && err.httpStatus === 404,
  );
});

test("503 响应抛 JobsApiError code=service_unavailable", async () => {
  mockFetchOnce(
    { success: false, error: "Job service unavailable.", code: "service_unavailable" },
    503,
  );
  await assert.rejects(
    () => fetchJobs("t"),
    (err) => err instanceof JobsApiError && err.code === "service_unavailable",
  );
});

test("422 响应抛 JobsApiError code=validation_failed", async () => {
  mockFetchOnce(
    { success: false, error: "Invalid filter.", code: "validation_failed" },
    422,
  );
  await assert.rejects(
    () => fetchJobs("t"),
    (err) => err instanceof JobsApiError && err.code === "validation_failed" && err.httpStatus === 422,
  );
});

test("网络异常抛 JobsApiError code=network_error", async () => {
  mockFetchThrow(new TypeError("fetch failed"));
  await assert.rejects(
    () => fetchJobs("t"),
    (err) =>
      err instanceof JobsApiError &&
      err.code === "network_error" &&
      err.message.includes("网络错误"),
  );
});

test("非 JSON 响应抛 JobsApiError code=service_unavailable", async () => {
  globalThis.fetch = async () => new Response("Internal Server Error", { status: 500 });
  await assert.rejects(
    () => fetchJobs("t"),
    (err) => err instanceof JobsApiError && err.code === "service_unavailable",
  );
});

test("success=false 但无 code 时按 HTTP 状态回退", async () => {
  mockFetchOnce({ success: false, error: "Forbidden." }, 403);
  await assert.rejects(
    () => fetchJobs("t"),
    (err) => err instanceof JobsApiError && err.code === "forbidden" && err.httpStatus === 403,
  );
});

// ============================================================
// 6. cancelJob 调用 1.0 API
// ============================================================

test("cancelJob 调用 POST /api/production/jobs action=cancel", async () => {
  mockFetchOnce({ success: true, job: { id: "job-1", status: "cancelled" } });
  await cancelJob("job-1", "token");
  const call = getLastCall();
  assert.equal(call.url, "/api/production/jobs", "cancel 复用 1.0 API 路径");
  assert.equal(call.init.method, "POST");
  const body = JSON.parse(call.init.body);
  assert.equal(body.action, "cancel");
  assert.equal(body.jobId, "job-1");
  assert.equal(call.init.headers.Authorization, "Bearer token");
});

test("cancelJob 成功时不抛错", async () => {
  mockFetchOnce({ success: true, job: { id: "job-1", status: "cancelled" } });
  await assert.doesNotReject(() => cancelJob("job-1", "t"));
});

test("cancelJob 失败时抛 JobsApiError", async () => {
  mockFetchOnce({ success: false, error: "任务不存在。" }, 404);
  await assert.rejects(
    () => cancelJob("job-x", "t"),
    (err) =>
      err instanceof JobsApiError &&
      err.message.includes("任务不存在") &&
      err.httpStatus === 404,
  );
});

test("cancelJob 网络异常抛 network_error", async () => {
  mockFetchThrow(new Error("connection reset"));
  await assert.rejects(
    () => cancelJob("job-1", "t"),
    (err) => err instanceof JobsApiError && err.code === "network_error",
  );
});

// ============================================================
// 7. retryJob 抛 not_implemented
// ============================================================

test("retryJob 在非 fixture 模式抛 not_implemented 错误", async () => {
  await assert.rejects(
    () => retryJob("job-1", "t"),
    (err) =>
      err instanceof JobsApiError &&
      err.message.includes("尚未实现") &&
      err.code === "service_unavailable",
  );
});

test("retryJob 不调用 fetch", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}", { status: 200 });
  };
  try {
    await retryJob("job-1", "t");
  } catch {
    // 预期抛错
  }
  assert.equal(called, false, "retryJob 不应发起网络请求");
});

// ============================================================
// 8. stats 基于映射后的 jobs
// ============================================================

test("fetchJobs 返回的 stats 基于映射后的 jobs", async () => {
  const items = [
    makeCodexJob({
      id: "1",
      jobType: "text",
      status: "running",
      progress: { completed: 0, total: 1 },
      actions: [],
    }),
    makeCodexJob({
      id: "2",
      jobType: "image",
      status: "completed",
      progress: { completed: 1, total: 1 },
      actions: [],
    }),
    makeCodexJob({
      id: "3",
      jobType: "image",
      status: "running",
      progress: { completed: 0, total: 0 },
      actions: [],
    }),
  ];
  mockFetchOnce({ success: true, contractVersion: "2.0.0-alpha.1", items, hasMore: false });
  const result = await fetchJobs("t");
  assert.equal(result.stats.total, 3);
  assert.equal(result.stats.byStatus.running, 2, "running 计数应为 2");
  assert.equal(result.stats.byStatus.completed, 1);
  assert.equal(result.stats.byType.image, 2);
  assert.equal(result.stats.byType.text, 1);
});

test("空 items 返回空 jobs 与零计数 stats", async () => {
  mockFetchOnce({ success: true, contractVersion: "2.0.0-alpha.1", items: [], hasMore: false });
  const result = await fetchJobs("t");
  assert.equal(result.jobs.length, 0);
  assert.equal(result.stats.total, 0);
});

test("hasMore 字段不影响当前批次返回", async () => {
  mockFetchOnce({
    success: true,
    contractVersion: "2.0.0-alpha.1",
    items: [makeCodexJob()],
    hasMore: true,
  });
  const result = await fetchJobs("t");
  assert.equal(result.jobs.length, 1, "hasMore=true 时仍返回当前 items 全部");
});
