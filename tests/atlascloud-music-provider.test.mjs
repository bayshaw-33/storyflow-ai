import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const source = existsSync("lib/audio/providers/atlascloud.ts") ? readFileSync("lib/audio/providers/atlascloud.ts", "utf8") : "";

test("Atlas adapter uses the unified Atlas Cloud audio endpoint and both model IDs", () => {
  assert.match(source, /api\.atlascloud\.ai/);
  assert.match(source, /api\/v1\/model\/generateAudio/);
  assert.match(source, /minimax\/music-3\.0/);
  assert.match(source, /suno\/chirp-v5/);
  assert.match(source, /lyrics_optimizer/);
  assert.match(source, /is_instrumental/);
});

test("Atlas adapter polls prediction IDs and does not implement TTS", () => {
  assert.match(source, /model\/prediction/);
  assert.match(source, /providerTaskId/);
  assert.doesNotMatch(source, /speech|text-to-speech/i);
});

test("Atlas adapter maps instrumental and sound-effect modes", () => {
  assert.match(source, /musicMode/);
  assert.match(source, /instrumental/);
  assert.match(source, /sfx/);
});
