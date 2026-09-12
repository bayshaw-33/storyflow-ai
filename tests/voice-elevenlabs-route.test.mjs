import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const path = "app/api/voice/elevenlabs/voices/route.ts";
const source = existsSync(path) ? readFileSync(path, "utf8") : "";

test("ElevenLabs voice directory route requires authentication and server configuration", () => {
  assert.match(source, /authenticateRequest/);
  assert.match(source, /createElevenLabsTTSProvider/);
  assert.match(source, /provider\.isAvailable/);
});

test("voice directory supports personal and shared sources with pagination and filters", () => {
  assert.match(source, /source/);
  assert.match(source, /personal/);
  assert.match(source, /shared/);
  assert.match(source, /pageToken/);
  assert.match(source, /pageSize/);
  assert.match(source, /search/);
  assert.match(source, /language/);
  assert.match(source, /gender/);
  assert.match(source, /listVoices/);
  assert.match(source, /listSharedVoices/);
});

test("voice directory response is metadata-only and never returns provider secrets", () => {
  assert.match(source, /voices: page\.voices/);
  assert.match(source, /nextPageToken/);
  assert.doesNotMatch(source, /apiKey\s*:/);
  assert.doesNotMatch(source, /process\.env\.ELEVENLABS_API_KEY[^;]*return/);
});
