import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { computeVideoIdempotencyHash } from "../lib/ai/video/provider.ts";

const routePath = new URL("../app/api/storyboard/shots/[shotId]/generate-video/route.ts", import.meta.url);

test("previs-aware video submission resolves the saved version and exact first-frame job", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /previsVersionId/);
  assert.match(source, /readPrevisVersion/);
  assert.match(source, /resolveExactFirstframeJob/);
  assert.match(source, /adoptedInput\.prompt/);
  assert.match(source, /adoptedInput\.firstframeJobId/);
  assert.match(source, /previsSnapshotHash/);
  assert.match(source, /capabilityTranslation/);
});

test("different adopted snapshots cannot reuse the same video job", () => {
  const base = {
    shotId: "shot-1",
    prompt: "camera follows Mara",
    firstframeUrl: "https://storage.test/frame.png",
    duration: 5,
  };
  const first = computeVideoIdempotencyHash({ ...base, provenanceHash: "snapshot-a" });
  const second = computeVideoIdempotencyHash({ ...base, provenanceHash: "snapshot-b" });
  assert.notEqual(first, second);
});

test("queued job writes adopted provenance before provider submit", async () => {
  const source = await readFile(routePath, "utf8");
  const insertIndex = source.indexOf("/rest/v1/storyflow_generation_jobs");
  const submitIndex = source.indexOf("provider.submit");
  assert.ok(insertIndex >= 0 && submitIndex > insertIndex);
  assert.match(source, /result_metadata:\s*buildVideoJobMetadata/);
  assert.match(source, /input_params:[\s\S]*previsVersionId/);
});
