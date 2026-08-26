import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const kk = existsSync("lib/audio/kk-events.ts") ? readFileSync("lib/audio/kk-events.ts", "utf8") : "";
const universe = existsSync("lib/audio/universe-links.ts") ? readFileSync("lib/audio/universe-links.ts", "utf8") : "";

test("audio job stages map to the existing KK task event vocabulary", () => {
  for (const name of ["task_queued", "task_running", "task_ingesting", "task_completed", "task_failed"]) assert.match(kk, new RegExp(name));
  assert.match(kk, /recordAudioJobEvent/);
});

test("audio assets expose a Universe binding helper without private URLs", () => {
  assert.match(universe, /buildAudioUniverseBinding/);
  assert.match(universe, /assetId/);
  assert.doesNotMatch(universe, /storagePath/);
});
