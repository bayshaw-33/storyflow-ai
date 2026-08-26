import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => existsSync(path) ? readFileSync(path, "utf8") : "";
const submitRoute = read("app/api/audio/jobs/route.ts");
const pollRoute = read("app/api/audio/jobs/[jobId]/route.ts");
const capabilitiesRoute = read("app/api/audio/capabilities/route.ts");

test("audio submit route creates an audio job and returns async acceptance", () => {
  assert.match(submitRoute, /storyflow_generation_jobs/);
  assert.match(submitRoute, /provider_task_id/);
  assert.match(submitRoute, /202/);
  assert.match(submitRoute, /computeAudioIdempotencyHash/);
});

test("audio poll route persists bytes before marking completed", () => {
  assert.match(pollRoute, /persistAudioArtifact/);
  assert.match(pollRoute, /result_ingesting/);
  assert.match(pollRoute, /status: "completed"/);
  assert.match(pollRoute, /sanitizeAudioMetadata/);
});

test("audio asset Universe bindings are patched only after a real asset id exists", () => {
  assert.doesNotMatch(submitRoute, /assetId: "pending"/);
  assert.doesNotMatch(pollRoute, /assetId: "pending"/);
  assert.match(submitRoute, /storyflow_assets\?id=eq/);
  assert.match(pollRoute, /storyflow_assets\?id=eq/);
});

test("audio capability route exposes provider availability without secrets", () => {
  assert.match(capabilitiesRoute, /getAudioCapabilities/);
  assert.match(capabilitiesRoute, /MUSIC_PROVIDER/);
  assert.match(capabilitiesRoute, /TTS_PROVIDER/);
  assert.doesNotMatch(capabilitiesRoute, /API_KEY/);
});

test("audio submit route returns safe actionable provider errors", () => {
  assert.match(submitRoute, /classifyAudioProviderError/);
  assert.match(submitRoute, /providerFailure\.status/);
  assert.match(submitRoute, /providerFailure\.safeMessage/);
  assert.match(submitRoute, /providerFailure\.code/);
  assert.doesNotMatch(submitRoute, /message\.includes\("TIMEOUT"\)/);
});

test("audio submit idempotency distinguishes two candidates in one batch", () => {
  assert.match(submitRoute, /requestKey/);
  assert.match(submitRoute, /idempotencyTargetId/);
  assert.match(submitRoute, /computeAudioIdempotencyHash\(\{[^}]*targetId: idempotencyTargetId/s);
});

test("audio batch route creates two independently recoverable music jobs", () => {
  const batchRoute = read("app/api/audio/jobs/batch/route.ts");
  assert.match(batchRoute, /export async function POST/);
  assert.match(batchRoute, /candidates/);
  assert.match(batchRoute, /reconciling/);
  assert.match(batchRoute, /requestKey/);
  assert.match(batchRoute, /202/);
});

test("audio poll route reconciles missing provider ids before polling", () => {
  assert.match(pollRoute, /reconcil/);
  assert.match(pollRoute, /findAcceptedGmiRequest/);
  assert.match(pollRoute, /AUDIO_RESULT_INGEST_FAILED/);
});
