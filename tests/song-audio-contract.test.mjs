import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const page = readFileSync("app/song-workbench/page.tsx", "utf8");
const component = existsSync("components/song-workbench/AudioCandidates.tsx") ? readFileSync("components/song-workbench/AudioCandidates.tsx", "utf8") : "";

test("song workbench exposes first-party audio generation", () => {
  assert.match(page, /AudioCandidates/);
  assert.match(page, /api\/audio\/jobs/);
  assert.match(component, /生成 2 首|Generate 2 tracks/);
});

test("song audio candidates support playback and job stages", () => {
  assert.match(component, /<audio/);
  assert.match(component, /resultUrl/);
  assert.match(component, /result_ingesting/);
  assert.match(component, /生成 2 首|Generate 2 tracks/);
});

test("one generation action submits two independently tracked song candidates", () => {
  assert.match(page, /\["A", "B"\]/);
  assert.match(page, /api\/audio\/jobs\/batch/);
  assert.match(page, /candidates:\s*\[/);
  assert.match(page, /requestKey/);
  assert.match(component, /生成 2 首|Generate 2 tracks/);
});

test("song candidates render as compact music players", () => {
  assert.match(component, /song-audio-player/);
  assert.match(component, /song-audio-cover/);
  assert.match(component, /<audio/);
});
