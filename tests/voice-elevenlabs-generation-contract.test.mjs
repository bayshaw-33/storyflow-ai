import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const submitRoute = readFileSync("app/api/audio/jobs/route.ts", "utf8");
const downloadRoute = readFileSync("app/api/audio/jobs/[jobId]/download/route.ts", "utf8");
const provider = readFileSync("lib/audio/provider.ts", "utf8");

test("audio job submission can resolve ElevenLabs for TTS and persists provider voice id input", () => {
  assert.match(provider, /name === "elevenlabs"/);
  assert.match(submitRoute, /voiceProviderVoiceId/);
  assert.match(submitRoute, /provider\.submitTTS/);
  assert.match(submitRoute, /persistAudioArtifact/);
});

test("generated ElevenLabs audio uses owner-scoped forced-download URL", () => {
  assert.match(downloadRoute, /authenticateRequest/);
  assert.match(downloadRoute, /owner_id=eq/);
  assert.match(downloadRoute, /createSignedUrl/);
  assert.match(downloadRoute, /download:/);
});
