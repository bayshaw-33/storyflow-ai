/**
 * tests/ui-v2/navigation/resolver.test.mjs
 * KIIKIS 2.2 Phase 0 — shared navigation resolver contract tests.
 *
 * Dashboard, Task Center and KK all consume this module so they cannot
 * maintain contradictory fixture routes. Covers K22-JOB-006.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveArtWorkbenchEntry,
  resolveWorkbenchRoute,
  resolveProjectWorkbenchRoute,
  resolveJobDetailUrl,
  resolveJobResultUrl,
  isInternalAppRoute,
  resolveActionTarget,
} from "../../../lib/client/v2/navigation/resolver.ts";
import { WORK_TYPES } from "../../../lib/contracts/v2/work.ts";

test("resolveWorkbenchRoute keeps non-production work types on professional routes", () => {
  const expected = {
    song: "/song-workbench?projectId=p1&workId=w1",
    voice: "/casting?projectId=p1&workId=w1",
    editing: "/editor?projectId=p1&workId=w1",
  };
  for (const t of WORK_TYPES.filter((type) => type in expected)) {
    assert.equal(resolveWorkbenchRoute(t, { projectId: "p1", workId: "w1" }), expected[t]);
  }
});

test("resolveProjectWorkbenchRoute keeps professional workflows professional and stages audiovisual projects", () => {
  const expected = {
    creation: "/production?projectId=p1&tab=script",
    continuation: "/production?projectId=p1&tab=script",
    art: "/production?projectId=p1&tab=art",
    storyboard: "/production?projectId=p1&tab=storyboard",
    video: "/production?projectId=p1&tab=video",
    song: "/song-workbench?projectId=p1",
    voice: "/casting?projectId=p1",
    editing: "/editor?projectId=p1",
    viral: "/viral-workbench?projectId=source&dashboardProjectId=viral-source",
  };

  for (const [workflowType, route] of Object.entries(expected)) {
    const projectId = workflowType === "viral" ? "viral-source" : "p1";
    assert.equal(resolveProjectWorkbenchRoute(workflowType, { projectId }), route);
  }
});

test("resolveWorkbenchRoute URL-encodes ids to prevent open-redirect via crafted projectId", () => {
  const r = resolveWorkbenchRoute("script", {
    projectId: "p&evil=1",
    workId: "w#frag",
  });
  assert.ok(!r.includes("evil=1"));
  assert.ok(!r.includes("#frag"));
});

test("resolveJobDetailUrl returns /job-center/:jobId for any non-empty id", () => {
  assert.equal(resolveJobDetailUrl("abc"), "/job-center/abc");
  assert.equal(resolveJobDetailUrl("123-456"), "/job-center/123-456");
});

test("resolveJobDetailUrl rejects empty id", () => {
  assert.throws(() => resolveJobDetailUrl(""), /jobId/);
  assert.throws(() => resolveJobDetailUrl(null), /jobId/);
});

test("resolveJobResultUrl returns null when resultUrl absent (button must disable, not fake)", () => {
  assert.equal(resolveJobResultUrl({}), null);
  assert.equal(resolveJobResultUrl({ resultUrl: null }), null);
  assert.equal(resolveJobResultUrl({ resultUrl: "" }), null);
});

test("resolveJobResultUrl returns internal resultUrl as-is", () => {
  assert.equal(
    resolveJobResultUrl({ resultUrl: "/art-workbench?assetId=a1" }),
    "/art-workbench?assetId=a1",
  );
});

test("standalone Art entries retain their existing route and complete query identity", () => {
  for (const query of [
    "assetId=a1",
    "setup=1&universeId=u1",
    "universeId=u1&tool=reference-sheet&variant=v2",
  ]) {
    const resultUrl = `/art-workbench?${query}`;
    assert.deepEqual(resolveArtWorkbenchEntry(query), { kind: "standalone" });
    assert.equal(resolveJobResultUrl({ resultUrl }), resultUrl);
  }
});

test("project-bound Art entries expose the full identity needed for canonical routing", () => {
  assert.deepEqual(
    resolveArtWorkbenchEntry("projectId=p1&workId=w1&sourceUnitId=u1&assetId=a1"),
    { kind: "project", projectId: "p1", workId: "w1", unitId: "u1" },
  );
});

test("project-bound audiovisual job results use server identity and preserve result parameters", () => {
  const target = resolveJobResultUrl({
    resultUrl: "/art-workbench?projectId=stale&sourceUnitId=u1&assetId=a1#version-2",
    projectId: "p1",
    workId: "w1",
    workbenchType: "art",
  });
  const url = new URL(target, "https://kiikis.test");

  assert.equal(url.pathname, "/production");
  assert.equal(url.hash, "#version-2");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    projectId: "p1",
    assetId: "a1",
    workId: "w1",
    tab: "art",
    unitId: "u1",
  });
});

test("job result normalization preserves professional routes", () => {
  for (const resultUrl of [
    "/song-workbench?projectId=p1&workId=w-song",
    "/casting?projectId=p1&workId=w-voice",
    "/editor?projectId=p1&workId=w-edit",
    "/viral-workbench?projectId=p1",
  ]) {
    assert.equal(
      resolveJobResultUrl({ resultUrl, projectId: "p1", workbenchType: "script" }),
      resultUrl,
    );
  }
});

test("resolveJobResultUrl rejects external URLs to prevent open redirect", () => {
  assert.equal(
    resolveJobResultUrl({ resultUrl: "https://evil.example/path" }),
    null,
  );
  assert.equal(resolveJobResultUrl({ resultUrl: "//evil.example" }), null);
});

test("isInternalAppRoute accepts same-origin app paths only", () => {
  assert.equal(isInternalAppRoute("/dashboard"), true);
  assert.equal(isInternalAppRoute("/job-center/x"), true);
  assert.equal(isInternalAppRoute("https://evil.example"), false);
  assert.equal(isInternalAppRoute("//evil.example"), false);
  assert.equal(isInternalAppRoute(""), false);
});

test("resolveActionTarget returns null for unknown action kind (button disables)", () => {
  assert.equal(resolveActionTarget({ kind: "unknown" }, {}), null);
});

test("resolveActionTarget resolves view_details → /job-center/:jobId", () => {
  assert.equal(
    resolveActionTarget({ kind: "view_details" }, { jobId: "j1" }),
    "/job-center/j1",
  );
});

test("resolveActionTarget resolves view_results → internal resultUrl only", () => {
  assert.equal(
    resolveActionTarget(
      { kind: "view_results" },
      { resultUrl: "/art-workbench?assetId=a1" },
    ),
    "/art-workbench?assetId=a1",
  );
  assert.equal(
    resolveActionTarget(
      { kind: "view_results" },
      { resultUrl: "https://evil.example" },
    ),
    null,
  );
  assert.equal(resolveActionTarget({ kind: "view_results" }, {}), null);
});

test("resolveActionTarget resolves cancel/retry → /api/v2/jobs/:id (server action, not a page)", () => {
  assert.equal(
    resolveActionTarget({ kind: "cancel" }, { jobId: "j1" }),
    "/api/v2/jobs/j1",
  );
  assert.equal(
    resolveActionTarget({ kind: "retry" }, { jobId: "j1" }),
    "/api/v2/jobs/j1",
  );
});
