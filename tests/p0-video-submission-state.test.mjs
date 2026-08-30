import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildVideoJobMetadata,
  isAmbiguousVideoSubmissionError,
} from "../lib/storyboard/video-submission.ts";

test("timeouts and network disconnects are ambiguous, validation errors are not", () => {
  assert.equal(isAmbiguousVideoSubmissionError(new Error("PROVIDER_TIMEOUT")), true);
  assert.equal(isAmbiguousVideoSubmissionError(new Error("MINIMAX_VIDEO_TIMEOUT")), true);
  assert.equal(isAmbiguousVideoSubmissionError(new DOMException("aborted", "AbortError")), true);
  assert.equal(isAmbiguousVideoSubmissionError(new Error("fetch failed")), true);
  assert.equal(isAmbiguousVideoSubmissionError(new Error("ATLAS_SUBMIT_NO_PROMPT")), false);
});

test("job metadata preserves provenance while sub-status advances", () => {
  const provenance = {
    previsVersionId: "previs-v3",
    previsSnapshotHash: "snapshot-hash",
    firstframeJobId: "image-job-1",
    capabilityTranslation: { mode: "firstframe_prompt", preserved: ["first_frame"], lossy: ["camera_path"] },
    adoptedAt: "2026-08-30T10:00:00.000Z",
  };
  const queued = buildVideoJobMetadata("queued", provenance);
  const accepted = buildVideoJobMetadata("accepted", provenance, queued);
  assert.equal(accepted.sub_status, "accepted");
  assert.equal(accepted.previsVersionId, "previs-v3");
  assert.equal(accepted.firstframeJobId, "image-job-1");
});

test("ambiguous submit remains queryable and is never automatically resubmitted", async () => {
  const route = await readFile(new URL("../app/api/storyboard/shots/[shotId]/generate-video/route.ts", import.meta.url), "utf8");
  assert.match(route, /submission_unknown/);
  assert.match(route, /status:\s*"queued"/);
  assert.match(route, /status:\s*202/);
  assert.equal((route.match(/await provider\.submit/g) || []).length, 1);
});

test("job polling preserves provenance and reports generating, ingesting, completed, and failed sub-statuses", async () => {
  const source = await readFile(new URL("../app/api/storyboard/jobs/[jobId]/route.ts", import.meta.url), "utf8");
  for (const status of ["generating", "result_ingesting", "completed", "failed"]) {
    assert.match(source, new RegExp(`sub_status:\\s*"${status}"`));
  }
  assert.match(source, /\.\.\.job\.result_metadata/);
});
