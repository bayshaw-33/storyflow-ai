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
  resolveWorkbenchRoute,
  resolveJobDetailUrl,
  resolveJobResultUrl,
  isInternalAppRoute,
  resolveActionTarget,
} from "../../../lib/client/v2/navigation/resolver.ts";
import { WORK_TYPES } from "../../../lib/contracts/v2/work.ts";

test("resolveWorkbenchRoute emits /<workbench>?projectId=&workId= for every WorkType", () => {
  for (const t of WORK_TYPES) {
    const r = resolveWorkbenchRoute(t, { projectId: "p1", workId: "w1" });
    assert.match(r, /^\/[a-z-]+\?projectId=p1&workId=w1$/);
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
