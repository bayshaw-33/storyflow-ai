import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.NEXT_PUBLIC_USE_JOB_FIXTURE = "false";
process.env.NEXT_PUBLIC_USE_KK_FIXTURE = "false";

const { fetchJobs } = await import("../../lib/client/v2/jobs/api.ts");
const kkApi = await import("../../lib/client/v2/kk/api.ts");
const { resolveJobResultUrl } = await import("../../lib/client/v2/navigation/resolver.ts");

const JOBS_RESPONSE = {
  success: true,
  contractVersion: "2.0.0-alpha.1",
  hasMore: false,
  items: [
    {
      id: "job-storyboard",
      projectId: "project-server",
      workId: "work-server",
      workbenchType: "storyboard",
      resultUrl:
        "/storyboard-workbench?projectId=project-stale&workId=work-stale&sourceUnitId=unit-1&shotId=shot-2",
      jobType: "image",
      status: "completed",
      phase: "completed",
      progress: { completed: 1, total: 1 },
      resultReferences: [
        "/storyboard-workbench?projectId=project-stale&workId=work-stale&sourceUnitId=unit-1&shotId=shot-2",
      ],
      actions: ["view_results", "view_details"],
      createdAt: "2026-08-20T04:00:00.000Z",
      completedAt: "2026-08-20T04:01:00.000Z",
    },
    {
      id: "job-standalone-art",
      projectId: null,
      workId: null,
      workbenchType: "art",
      resultUrl: "/art-workbench?assetId=asset-1&setup=portrait&universeId=universe-1",
      jobType: "image",
      status: "completed",
      phase: "completed",
      progress: { completed: 1, total: 1 },
      resultReferences: [],
      actions: ["view_results", "view_details"],
      createdAt: "2026-08-20T03:00:00.000Z",
      completedAt: "2026-08-20T03:01:00.000Z",
    },
    {
      id: "job-song",
      projectId: "project-song",
      workId: "work-song",
      workbenchType: "song",
      resultUrl: "/song-workbench?projectId=project-song&workId=work-song&asset=track-1",
      jobType: "audio",
      status: "completed",
      phase: "completed",
      progress: { completed: 1, total: 1 },
      resultReferences: [],
      actions: ["view_results", "view_details"],
      createdAt: "2026-08-20T02:00:00.000Z",
      completedAt: "2026-08-20T02:01:00.000Z",
    },
  ],
};

function installJobsResponse() {
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "/api/v2/jobs");
    return new Response(JSON.stringify(JOBS_RESPONSE), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function assertAuthoritativeStoryboardDestination(destination) {
  const url = new URL(destination, "https://kiikis.test");
  assert.equal(url.pathname, "/production");
  assert.equal(url.searchParams.get("projectId"), "project-server");
  assert.equal(url.searchParams.get("workId"), "work-server");
  assert.equal(url.searchParams.get("tab"), "storyboard");
  assert.equal(url.searchParams.get("unitId"), "unit-1");
  assert.equal(url.searchParams.get("shotId"), "shot-2");
}

test("live jobs response drives Task Center to the server-owned Work and canonical tab", async () => {
  installJobsResponse();
  const result = await fetchJobs("token");
  const job = result.jobs.find((item) => item.id === "job-storyboard");
  assert.ok(job);
  assert.equal(job.workId, "work-server");
  assert.equal(job.workbenchType, "storyboard");
  assert.equal(job.resultUrl, JOBS_RESPONSE.items[0].resultUrl);

  const destination = resolveJobResultUrl({
    resultUrl: job.resultUrl,
    projectId: job.projectId,
    workId: job.workId,
    workbenchType: job.workbenchType,
  });
  assert.ok(destination);
  assertAuthoritativeStoryboardDestination(destination);

  const taskCardSource = readFileSync(
    new URL("../../components/v2/task-center/TaskCard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(taskCardSource, /workId:\s*job\.workId/);
});

test("live jobs response drives the KK runtime message path without rewriting standalone or professional results", async () => {
  assert.equal(
    typeof kkApi.fetchKkJobMessages,
    "function",
    "KK production API must expose the live job-message loader used by KkRuntimeProvider",
  );
  installJobsResponse();
  const messages = await kkApi.fetchKkJobMessages("token", {
    now: new Date("2026-08-20T05:00:00.000Z"),
  });

  const storyboard = messages.find((message) => message.relatedJobId === "job-storyboard");
  const standalone = messages.find((message) => message.relatedJobId === "job-standalone-art");
  const professional = messages.find((message) => message.relatedJobId === "job-song");
  assert.ok(storyboard?.actionUrl);
  assertAuthoritativeStoryboardDestination(storyboard.actionUrl);
  assert.equal(
    standalone?.actionUrl,
    "/art-workbench?assetId=asset-1&setup=portrait&universeId=universe-1",
  );
  assert.equal(
    professional?.actionUrl,
    "/song-workbench?projectId=project-song&workId=work-song&asset=track-1",
  );

  const providerSource = readFileSync(
    new URL("../../components/v2/kk/KkRuntimeProvider.tsx", import.meta.url),
    "utf8",
  );
  assert.match(providerSource, /fetchKkJobMessages/);
  assert.match(providerSource, /setJobMessages/);
});
