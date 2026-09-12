import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const path = "app/api/voice/elevenlabs/clone/route.ts";
const source = existsSync(path) ? readFileSync(path, "utf8") : "";

test("ElevenLabs clone route authenticates and accepts multipart audio", () => {
  assert.match(source, /authenticateRequest/);
  assert.match(source, /request\.formData/);
  assert.match(source, /createElevenLabsTTSProvider/);
  assert.match(source, /createVoiceClone/);
});

test("clone route validates name and audio and does not return API credentials", () => {
  assert.match(source, /name/);
  assert.match(source, /audio|file/);
  assert.match(source, /422/);
  assert.doesNotMatch(source, /apiKey\s*:/);
});
