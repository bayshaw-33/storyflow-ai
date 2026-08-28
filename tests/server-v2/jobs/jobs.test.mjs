import assert from "node:assert/strict";
import test from "node:test";

const { mapLegacyJob, listUnifiedJobs, readUnifiedJob, transitionJob, V2JobsError } = await import("../../../lib/server/v2/jobs/index.ts");

test("a historical failed audio job stops elapsed time at its last update", () => {
  const job = mapLegacyJob({ id: "old-audio", job_type: "audio", status: "provider_timeout", created_at: "2026-08-26T09:00:00Z", updated_at: "2026-08-26T09:02:00Z" }, new Date("2026-08-28T12:00:00Z"));
  assert.equal(job.timing.elapsedSeconds, 120);
  assert.equal(job.completedAt, "2026-08-26T09:02:00Z");
});

test("archived test jobs leave the default feed but remain readable in history and detail", async () => {
  const archived = { id: "archived-audio", owner_id: "u-1", job_type: "audio", status: "failed", created_at: "2026-08-26T09:00:00Z", result_metadata: { archivedAt: "2026-08-28T12:00:00Z" } };
  const fetcher = async (path) => path.includes("storyflow_generation_jobs") ? [archived] : [];
  assert.deepEqual((await listUnifiedJobs({ fetcher, userId: "u-1" })).items, []);
  assert.equal((await listUnifiedJobs({ fetcher, userId: "u-1", includeArchived: true })).items[0].id, archived.id);
  assert.equal((await readUnifiedJob({ fetcher, userId: "u-1", jobId: archived.id })).job.status, "failed");
});

test("maps legacy video sub-states to the frozen v2 lifecycle", () => {
  assert.equal(mapLegacyJob({ id: "1", owner_id: "u-1", job_type: "video", status: "queued", created_at: "2026-08-12T00:00:00Z" }).status, "queued");
  assert.equal(mapLegacyJob({ id: "2", owner_id: "u-1", job_type: "video", status: "generating", created_at: "2026-08-12T00:00:00Z" }).status, "running");
  assert.equal(mapLegacyJob({ id: "3", owner_id: "u-1", job_type: "video", status: "result_ingesting", created_at: "2026-08-12T00:00:00Z" }).status, "result_ingesting");
  assert.equal(mapLegacyJob({ id: "4", owner_id: "u-1", job_type: "video", status: "partial_failure", created_at: "2026-08-12T00:00:00Z", result_metadata: { completedCount: 2, totalCount: 3, results: ["asset-1", "asset-2"] } }).status, "partial_failure");
  assert.equal(mapLegacyJob({ id: "5", owner_id: "u-1", job_type: "video", status: "cancel_requested", created_at: "2026-08-12T00:00:00Z" }).status, "queued");
});

test("unified job model reports phase and timing without fabricated precise progress", () => {
  const mapped = mapLegacyJob({
    id: "job-1", owner_id: "u-1", project_id: "project-1", job_type: "video", status: "running",
    created_at: "2026-08-12T00:00:00Z", started_at: "2026-08-12T00:10:00Z", updated_at: "2026-08-12T00:10:00Z", result_metadata: { historySeconds: [480, 600] },
  }, new Date("2026-08-12T00:12:00Z"));
  assert.equal(mapped.phase, "running");
  assert.equal(mapped.progress.total, 0);
  assert.equal(mapped.progress.completed, 0);
  assert.equal(mapped.timing.elapsedSeconds, 120);
  assert.deepEqual([mapped.timing.estimatedSecondsMin, mapped.timing.estimatedSecondsMax], [480, 600]);
  assert.equal(mapped.timing.estimateConfidence, "medium");
});

test("unified job DTO preserves server-owned result identity", () => {
  const mapped = mapLegacyJob({
    id: "job-identity",
    owner_id: "u-1",
    project_id: "project-server",
    job_type: "image",
    status: "completed",
    result_url: "/storyboard-workbench?projectId=project-stale&workId=work-stale&sourceUnitId=unit-1",
    result_metadata: {
      workId: "work-server",
      workbenchType: "storyboard",
      results: ["/storyboard-workbench?projectId=project-stale&workId=work-stale"],
    },
    created_at: "2026-08-12T00:00:00Z",
    completed_at: "2026-08-12T00:01:00Z",
  });

  assert.equal(mapped.workId, "work-server");
  assert.equal(mapped.workbenchType, "storyboard");
  assert.equal(
    mapped.resultUrl,
    "/storyboard-workbench?projectId=project-stale&workId=work-stale&sourceUnitId=unit-1",
  );
});

test("listUnifiedJobs aggregates text, media, transfer, export and analysis sources for one owner", async () => {
  const calls = [];
  const fetcher = async (path) => {
    calls.push(path);
    if (path.includes("storyflow_generation_tasks")) return [{ id: "text-1", user_id: "u-1", project_id: "p-1", step_key: "script", phase_key: "script_production", status: "completed", created_at: "2026-08-12T00:00:00Z", completed_at: "2026-08-12T00:01:00Z", output_snapshot: "done" }];
    if (path.includes("storyflow_generation_jobs")) return [{ id: "media-1", owner_id: "u-1", project_id: "p-1", job_type: "video", status: "partial_failure", created_at: "2026-08-12T00:00:00Z", result_metadata: { completedCount: 2, totalCount: 3, results: ["asset-1", "asset-2"] } }];
    if (path.includes("storyflow_exports")) return [{ id: "export-1", user_id: "u-1", project_id: "p-1", status: "completed", created_at: "2026-08-12T00:03:00Z" }];
    if (path.includes("storyflow_projects")) return [{ id: "p-1", workflow_type: "script", mode: null, data: {} }];
    throw new Error(`unexpected query: ${path}`);
  };
  const result = await listUnifiedJobs({ fetcher, userId: "u-1", projectId: "p-1", now: new Date("2026-08-12T00:10:00Z") });
  assert.equal(result.items.length, 3);
  assert.ok(result.items.some((job) => job.id === "text-1"));
  assert.equal(result.items.find((job) => job.id === "media-1").progress.completed, 2);
  assert.equal(result.items.find((job) => job.id === "media-1").progress.total, 3);
  assert.deepEqual(result.items.find((job) => job.id === "media-1").resultReferences, ["asset-1", "asset-2"]);
  assert.equal(calls.every((path) => path.includes("u-1") || path.includes("user_id=eq.u-1") || path.includes("owner_id=eq.u-1") || path.includes("storyflow_projects")), true);
});

test("listUnifiedJobs hides jobs whose project has an explicit retired novel marker", async () => {
  const fetcher = async (path) => {
    if (path.includes("storyflow_generation_tasks")) return [{ id: "novel-task", user_id: "u-1", project_id: "p-novel", step_key: "script", phase_key: "script_production", status: "completed", created_at: "2026-08-12T00:00:00Z" }];
    if (path.includes("storyflow_generation_jobs")) return [];
    if (path.includes("storyflow_exports")) return [];
    if (path.includes("storyflow_projects")) return [{ id: "p-novel", workflow_type: "creation", mode: "novel", data: {} }];
    throw new Error(`unexpected query: ${path}`);
  };
  const result = await listUnifiedJobs({ fetcher, userId: "u-1" });
  assert.deepEqual(result.items, []);
});

test("missing jobs are distinguishable from service errors", async () => {
  const emptyFetcher = async () => [];
  await assert.rejects(readUnifiedJob({ fetcher: emptyFetcher, userId: "u-1", jobId: "missing" }), (error) => error instanceof V2JobsError && error.code === "not_found");
  // 网络类失败经 classifyServiceError 归为 provider_failed / service_unavailable，但绝不与 not_found 混淆
  const failingFetcher = async () => { throw new Error("network down"); };
  await assert.rejects(listUnifiedJobs({ fetcher: failingFetcher, userId: "u-1" }), (error) => error instanceof V2JobsError && (error.code === "service_unavailable" || error.code === "provider_failed"));
});

// ============================================================
// P0-05: storyflow_exports schema alignment (baseline.sql:521 —
// the table has NO updated_at / completed_at columns)
// ============================================================

test("exports queries select only columns that exist on storyflow_exports", async () => {
  const calls = [];
  const fetcher = async (path) => {
    calls.push(path);
    return [];
  };
  await listUnifiedJobs({ fetcher, userId: "u-1" });
  const exportsCalls = calls.filter((path) => path.includes("storyflow_exports"));
  assert.ok(exportsCalls.length >= 1, "listUnifiedJobs should query storyflow_exports");
  for (const path of exportsCalls) {
    const select = /select=([a-z_,]+)/.exec(path)?.[1] ?? "";
    const columns = select.split(",");
    assert.ok(!columns.includes("updated_at"), `storyflow_exports has no updated_at column: ${path}`);
    assert.ok(!columns.includes("completed_at"), `storyflow_exports has no completed_at column: ${path}`);
  }
});

test("completed export rows without metadata report no fabricated 1/1 progress", () => {
  const mapped = mapLegacyJob({
    id: "export-no-meta", user_id: "u-1", export_type: "docx", status: "completed", created_at: "2026-08-12T00:00:00Z",
  });
  assert.equal(mapped.progress.total, 0);
  assert.equal(mapped.progress.completed, 0);
});

test("cancel PATCH to storyflow_exports writes only existing columns", async () => {
  const row = { id: "export-q1", user_id: "u-1", project_id: "p-1", export_type: "docx", status: "queued", created_at: "2026-08-14T00:00:00Z" };
  const fetcher = makeTransitionFetcher({ row, ownerId: "u-1" });
  await transitionJob({ fetcher, userId: "u-1", jobId: "export-q1", action: "cancel" });
  const exportsPatch = fetcher.patches.find((p) => p.path.includes("storyflow_exports"));
  assert.ok(exportsPatch, "should PATCH the exports table");
  const body = JSON.parse(exportsPatch.body);
  assert.equal(body.status, "cancelled");
  assert.ok(!("completed_at" in body), "storyflow_exports has no completed_at column to write");
});

test("supabase schema errors surface as schema_not_deployed without leaking SQL", async () => {
  const rawSql = "Could not find the 'updated_at' column of 'storyflow_exports' in the 'public' schema";
  const failingFetcher = async () => {
    throw new Error(`SUPABASE_SERVICE_ERROR:400:${JSON.stringify({ code: "PGRST204", message: rawSql })}`);
  };
  await assert.rejects(
    listUnifiedJobs({ fetcher: failingFetcher, userId: "u-1" }),
    (error) => {
      assert.equal(error.code, "schema_not_deployed");
      assert.ok(!error.message.includes("PGRST204"));
      assert.ok(!error.message.includes(rawSql));
      return true;
    },
  );
});

// ============================================================
// Phase 0 Task 0.3: transitionJob state machine (PRD §6.3)
// ============================================================

/**
 * Mock fetcher that simulates Supabase REST for transitionJob tests.
 * - GET (no init.method): returns `row` from the jobs table when id + owner match.
 * - PATCH (init.method === "PATCH"): records the call and returns [] (success).
 */
function makeTransitionFetcher({ row, ownerId }) {
  const patches = [];
  const fetcher = async (path, init) => {
    if (init && init.method === "PATCH") {
      patches.push({ path, body: init.body });
      return [];
    }
    // GET: readUnifiedJob queries 3 tables filtered by id + owner/user
    if (!row) return [];
    const encOwner = encodeURIComponent(ownerId);
    const ownerMatch = path.includes(`owner_id=eq.${encOwner}`) || path.includes(`user_id=eq.${encOwner}`);
    if (!ownerMatch) return [];
    const encId = encodeURIComponent(row.id);
    if (!path.includes(`id=eq.${encId}`)) return [];
    // Return the row from the jobs table (primary source for media jobs)
    return [row];
  };
  fetcher.patches = patches;
  return fetcher;
}

test("transitionJob cancel: queued → cancelled", async () => {
  const row = { id: "job-q1", owner_id: "u-1", project_id: "p-1", job_type: "video", status: "queued", created_at: "2026-08-14T00:00:00Z" };
  const fetcher = makeTransitionFetcher({ row, ownerId: "u-1" });
  const result = await transitionJob({ fetcher, userId: "u-1", jobId: "job-q1", action: "cancel" });
  assert.equal(result.job.status, "cancelled");
  assert.equal(result.job.phase, "cancelled");
  assert.ok(result.job.completedAt, "completedAt should be set after cancel");
  assert.ok(result.job.actions.includes("view_details"));
  assert.ok(!result.job.actions.includes("cancel"), "cancelled job should not offer cancel");
  // PATCH was sent to all 3 tables
  assert.ok(fetcher.patches.length >= 3, "should PATCH all 3 tables");
  // jobs table PATCH includes cancelRequested metadata
  const jobsPatch = fetcher.patches.find((p) => p.path.includes("storyflow_generation_jobs"));
  assert.ok(jobsPatch, "should PATCH the jobs table");
  const jobsBody = JSON.parse(jobsPatch.body);
  assert.equal(jobsBody.status, "cancelled");
  assert.deepEqual(jobsBody.result_metadata, { cancelRequested: true });
});

test("transitionJob cancel: running → cancelled", async () => {
  const row = { id: "job-r1", owner_id: "u-1", job_type: "image", status: "running", created_at: "2026-08-14T00:00:00Z" };
  const fetcher = makeTransitionFetcher({ row, ownerId: "u-1" });
  const result = await transitionJob({ fetcher, userId: "u-1", jobId: "job-r1", action: "cancel" });
  assert.equal(result.job.status, "cancelled");
});

test("transitionJob cancel: result_ingesting → cancelled", async () => {
  const row = { id: "job-i1", owner_id: "u-1", job_type: "video", status: "result_ingesting", created_at: "2026-08-14T00:00:00Z" };
  const fetcher = makeTransitionFetcher({ row, ownerId: "u-1" });
  const result = await transitionJob({ fetcher, userId: "u-1", jobId: "job-i1", action: "cancel" });
  assert.equal(result.job.status, "cancelled");
});

test("transitionJob cancel: completed cannot be cancelled", async () => {
  const row = { id: "job-c1", owner_id: "u-1", job_type: "video", status: "completed", created_at: "2026-08-14T00:00:00Z" };
  const fetcher = makeTransitionFetcher({ row, ownerId: "u-1" });
  await assert.rejects(
    transitionJob({ fetcher, userId: "u-1", jobId: "job-c1", action: "cancel" }),
    (error) => error instanceof V2JobsError && error.code === "validation_failed",
  );
});

test("transitionJob cancel: failed cannot be cancelled", async () => {
  const row = { id: "job-f1", owner_id: "u-1", job_type: "video", status: "failed", created_at: "2026-08-14T00:00:00Z" };
  const fetcher = makeTransitionFetcher({ row, ownerId: "u-1" });
  await assert.rejects(
    transitionJob({ fetcher, userId: "u-1", jobId: "job-f1", action: "cancel" }),
    (error) => error instanceof V2JobsError && error.code === "validation_failed",
  );
});

test("transitionJob cancel: cancelled cannot be re-cancelled", async () => {
  const row = { id: "job-x1", owner_id: "u-1", job_type: "video", status: "cancelled", created_at: "2026-08-14T00:00:00Z" };
  const fetcher = makeTransitionFetcher({ row, ownerId: "u-1" });
  await assert.rejects(
    transitionJob({ fetcher, userId: "u-1", jobId: "job-x1", action: "cancel" }),
    (error) => error instanceof V2JobsError && error.code === "validation_failed",
  );
});

test("transitionJob retry: failed → queued", async () => {
  const row = { id: "job-f2", owner_id: "u-1", project_id: "p-1", job_type: "video", status: "failed", created_at: "2026-08-14T00:00:00Z", error: "timeout" };
  const fetcher = makeTransitionFetcher({ row, ownerId: "u-1" });
  const result = await transitionJob({ fetcher, userId: "u-1", jobId: "job-f2", action: "retry" });
  assert.equal(result.job.status, "queued");
  assert.equal(result.job.phase, "queued");
  assert.equal(result.job.completedAt, null, "completedAt should be cleared after retry");
  assert.equal(result.job.failedItemCount, 0, "failedItemCount should be cleared after retry");
  assert.ok(result.job.actions.includes("cancel"), "queued job should offer cancel");
  assert.ok(result.job.actions.includes("view_details"));
  // PATCH was sent with status=queued
  const jobsPatch = fetcher.patches.find((p) => p.path.includes("storyflow_generation_jobs"));
  const jobsBody = JSON.parse(jobsPatch.body);
  assert.equal(jobsBody.status, "queued");
  assert.equal(jobsBody.error, null, "error should be cleared on retry");
});

test("transitionJob retry: partial_failure → queued", async () => {
  const row = { id: "job-pf1", owner_id: "u-1", job_type: "image", status: "partial_failure", created_at: "2026-08-14T00:00:00Z", result_metadata: { completedCount: 2, totalCount: 3 } };
  const fetcher = makeTransitionFetcher({ row, ownerId: "u-1" });
  const result = await transitionJob({ fetcher, userId: "u-1", jobId: "job-pf1", action: "retry" });
  assert.equal(result.job.status, "queued");
});

test("transitionJob retry: completed cannot be retried", async () => {
  const row = { id: "job-c2", owner_id: "u-1", job_type: "video", status: "completed", created_at: "2026-08-14T00:00:00Z" };
  const fetcher = makeTransitionFetcher({ row, ownerId: "u-1" });
  await assert.rejects(
    transitionJob({ fetcher, userId: "u-1", jobId: "job-c2", action: "retry" }),
    (error) => error instanceof V2JobsError && error.code === "validation_failed",
  );
});

test("transitionJob retry: cancelled cannot be retried", async () => {
  const row = { id: "job-x2", owner_id: "u-1", job_type: "video", status: "cancelled", created_at: "2026-08-14T00:00:00Z" };
  const fetcher = makeTransitionFetcher({ row, ownerId: "u-1" });
  await assert.rejects(
    transitionJob({ fetcher, userId: "u-1", jobId: "job-x2", action: "retry" }),
    (error) => error instanceof V2JobsError && error.code === "validation_failed",
  );
});

test("transitionJob retry: queued cannot be retried", async () => {
  const row = { id: "job-q2", owner_id: "u-1", job_type: "video", status: "queued", created_at: "2026-08-14T00:00:00Z" };
  const fetcher = makeTransitionFetcher({ row, ownerId: "u-1" });
  await assert.rejects(
    transitionJob({ fetcher, userId: "u-1", jobId: "job-q2", action: "retry" }),
    (error) => error instanceof V2JobsError && error.code === "validation_failed",
  );
});

test("transitionJob retry: running cannot be retried", async () => {
  const row = { id: "job-r2", owner_id: "u-1", job_type: "video", status: "running", created_at: "2026-08-14T00:00:00Z" };
  const fetcher = makeTransitionFetcher({ row, ownerId: "u-1" });
  await assert.rejects(
    transitionJob({ fetcher, userId: "u-1", jobId: "job-r2", action: "retry" }),
    (error) => error instanceof V2JobsError && error.code === "validation_failed",
  );
});

test("transitionJob validates owner: mismatched userId → not_found", async () => {
  const row = { id: "job-o1", owner_id: "u-1", job_type: "video", status: "queued", created_at: "2026-08-14T00:00:00Z" };
  // Fetcher only returns the row when ownerId matches "u-1".
  // Calling with userId "u-2" means the owner filter won't match → empty → not_found.
  const fetcher = makeTransitionFetcher({ row, ownerId: "u-1" });
  await assert.rejects(
    transitionJob({ fetcher, userId: "u-2", jobId: "job-o1", action: "cancel" }),
    (error) => error instanceof V2JobsError && error.code === "not_found",
  );
});

test("transitionJob: missing jobId → validation_failed", async () => {
  const fetcher = makeTransitionFetcher({ row: null, ownerId: "u-1" });
  await assert.rejects(
    transitionJob({ fetcher, userId: "u-1", jobId: "", action: "cancel" }),
    (error) => error instanceof V2JobsError && error.code === "validation_failed",
  );
});

test("transitionJob: missing userId → unauthenticated", async () => {
  const fetcher = makeTransitionFetcher({ row: null, ownerId: "u-1" });
  await assert.rejects(
    transitionJob({ fetcher, userId: "", jobId: "job-1", action: "cancel" }),
    (error) => error instanceof V2JobsError && error.code === "unauthenticated",
  );
});

test("transitionJob: job not found in any table → not_found", async () => {
  const fetcher = makeTransitionFetcher({ row: null, ownerId: "u-1" });
  await assert.rejects(
    transitionJob({ fetcher, userId: "u-1", jobId: "nonexistent", action: "cancel" }),
    (error) => error instanceof V2JobsError && error.code === "not_found",
  );
});
