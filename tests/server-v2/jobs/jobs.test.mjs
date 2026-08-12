import assert from "node:assert/strict";
import test from "node:test";

const { mapLegacyJob, listUnifiedJobs, readUnifiedJob, V2JobsError } = await import("../../../lib/server/v2/jobs/index.ts");

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

test("listUnifiedJobs aggregates text, media, transfer, export and analysis sources for one owner", async () => {
  const calls = [];
  const fetcher = async (path) => {
    calls.push(path);
    if (path.includes("storyflow_generation_tasks")) return [{ id: "text-1", user_id: "u-1", project_id: "p-1", step_key: "script", phase_key: "script_production", status: "completed", created_at: "2026-08-12T00:00:00Z", completed_at: "2026-08-12T00:01:00Z", output_snapshot: "done" }];
    if (path.includes("storyflow_generation_jobs")) return [{ id: "media-1", owner_id: "u-1", project_id: "p-1", job_type: "video", status: "partial_failure", created_at: "2026-08-12T00:00:00Z", result_metadata: { completedCount: 2, totalCount: 3, results: ["asset-1", "asset-2"] } }];
    if (path.includes("storyflow_exports")) return [{ id: "export-1", user_id: "u-1", project_id: "p-1", status: "completed", created_at: "2026-08-12T00:03:00Z" }];
    throw new Error(`unexpected query: ${path}`);
  };
  const result = await listUnifiedJobs({ fetcher, userId: "u-1", projectId: "p-1", now: new Date("2026-08-12T00:10:00Z") });
  assert.equal(result.items.length, 3);
  assert.ok(result.items.some((job) => job.id === "text-1"));
  assert.equal(result.items.find((job) => job.id === "media-1").progress.completed, 2);
  assert.equal(result.items.find((job) => job.id === "media-1").progress.total, 3);
  assert.deepEqual(result.items.find((job) => job.id === "media-1").resultReferences, ["asset-1", "asset-2"]);
  assert.equal(calls.every((path) => path.includes("u-1") || path.includes("user_id=eq.u-1") || path.includes("owner_id=eq.u-1")), true);
});

test("missing jobs are distinguishable from service errors", async () => {
  const emptyFetcher = async () => [];
  await assert.rejects(readUnifiedJob({ fetcher: emptyFetcher, userId: "u-1", jobId: "missing" }), (error) => error instanceof V2JobsError && error.code === "not_found");
  const failingFetcher = async () => { throw new Error("network down"); };
  await assert.rejects(listUnifiedJobs({ fetcher: failingFetcher, userId: "u-1" }), (error) => error instanceof V2JobsError && error.code === "service_unavailable");
});
