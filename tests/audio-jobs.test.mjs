import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const source = existsSync("lib/audio/jobs.ts") ? readFileSync("lib/audio/jobs.ts", "utf8") : "";

test("audio jobs define the persisted lifecycle states", () => {
  for (const status of ["queued", "generating", "result_ingesting", "completed", "failed", "provider_timeout"]) {
    assert.ok(source.includes(`"${status}"`), `missing ${status}`);
  }
});

test("audio jobs expose idempotency and provider URL sanitization helpers", () => {
  assert.match(source, /computeAudioIdempotencyHash/);
  assert.match(source, /sanitizeAudioMetadata/);
  assert.match(source, /providerTempUrl/);
});

test("audio provider submit errors distinguish timeout from temporary failure", () => {
  assert.match(source, /classifyAudioProviderError/);
  assert.match(source, /timeout\|timed out\|aborted/i);
  assert.match(source, /PROVIDER_TIMEOUT/);
  assert.match(source, /PROVIDER_TEMPORARY_ERROR/);
});

test("accepted-but-unconfirmed music submissions are recoverable", () => {
  assert.match(source, /reconciling/);
  assert.match(source, /GMI_SUBMIT_UNCONFIRMED/);
  assert.match(source, /任务已送达|being confirmed/);
});

test("reconciliation expires instead of leaving an audio job pending forever", async () => {
  const { shouldExpireAudioReconciliation } = await import("../lib/audio/jobs.ts");
  const now = Date.now();
  assert.equal(shouldExpireAudioReconciliation(now - 60_000, now), false);
  assert.equal(shouldExpireAudioReconciliation(now - 181_000, now), true);
});

test("music idempotency separates vocal, instrumental, and SFX requests", async () => {
  const { computeAudioIdempotencyHash } = await import("../lib/audio/jobs.ts");
  const base = { ownerId: "u1", kind: "music", targetId: "song1", text: "same prompt", provider: "atlascloud", model: "minimax/music-3.0" };
  assert.notEqual(computeAudioIdempotencyHash({ ...base, musicMode: "vocal" }), computeAudioIdempotencyHash({ ...base, musicMode: "instrumental" }));
  assert.notEqual(computeAudioIdempotencyHash({ ...base, musicMode: "instrumental" }), computeAudioIdempotencyHash({ ...base, musicMode: "sfx" }));
});
