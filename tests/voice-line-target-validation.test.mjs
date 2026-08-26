import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const helper = existsSync("lib/validation/ids.ts") ? readFileSync("lib/validation/ids.ts", "utf8") : "";
const batch = readFileSync("app/api/voice-lines/batch/route.ts", "utf8");
const characterRoute = readFileSync("app/api/universes/[universeId]/characters/[entityId]/voice-lines/route.ts", "utf8");
const lightweightRoute = readFileSync("app/api/voice-lines/generate/route.ts", "utf8");
const itemRoute = readFileSync("app/api/voice-lines/[voiceLineId]/generate/route.ts", "utf8");
const pollRoute = readFileSync("app/api/audio/jobs/[jobId]/route.ts", "utf8");

test("Voice Line targets use one UUID predicate before database filters", () => {
  assert.match(helper, /export function isUuid/);
  assert.match(helper, /UUID_RE/);
  assert.match(batch, /isUuid\(body\.universeId\)/);
  assert.match(batch, /normalizeOptionalUuid/);
  assert.match(characterRoute, /isUuid\(universeId\)/);
  assert.match(characterRoute, /isUuid\(entityId\)/);
});

test("empty or synthetic optional IDs never reach UUID columns", () => {
  assert.match(batch, /projectId\s*=\s*normalizeOptionalUuid/);
  assert.match(batch, /sceneId\s*=\s*normalizeOptionalUuid/);
  assert.match(batch, /shotId\s*=\s*normalizeOptionalUuid/);
  assert.match(characterRoute, /projectId\s*=\s*normalizeOptionalUuid/);
  assert.match(characterRoute, /sceneId\s*=\s*normalizeOptionalUuid/);
  assert.match(characterRoute, /shotId\s*=\s*normalizeOptionalUuid/);
});

test("lightweight voice generation rejects synthetic targets and authenticates the caller", () => {
  assert.match(lightweightRoute, /authenticateRequest/);
  assert.match(lightweightRoute, /isUuid\(targetId\)/);
  assert.match(lightweightRoute, /INVALID_VOICE_LINE_ID/);
});

test("async voice ingestion binds from the owned Voice Line and exposes retryable failures", () => {
  assert.match(itemRoute, /fetchVoiceLineById/);
  assert.match(itemRoute, /voiceLine\.id/);
  assert.match(pollRoute, /AUDIO_RESULT_INGEST_FAILED/);
  assert.match(pollRoute, /status: "failed"/);
  assert.match(pollRoute, /voiceLineId/);
});
