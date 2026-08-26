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
