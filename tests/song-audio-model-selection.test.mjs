import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync("app/song-workbench/page.tsx", "utf8");
const component = readFileSync("components/song-workbench/AudioCandidates.tsx", "utf8");

test("song workbench exposes Atlas Cloud model selection and three music modes", () => {
  assert.match(page, /minimax\/music-3\.0/);
  assert.match(page, /suno\/chirp-v5/);
  assert.match(page, /musicMode/);
  assert.match(component, /vocal/);
  assert.match(component, /instrumental/);
  assert.match(component, /sfx/);
});

test("song audio requests persist the selected model and mode", () => {
  assert.match(page, /provider:\s*["']atlascloud["']/);
  assert.match(page, /model:\s*selectedMusicModel/);
  assert.match(page, /musicMode:\s*musicMode/);
});

test("non-vocal modes tell the AI and user how lyrics are handled", () => {
  assert.match(page, /instrumental|纯音乐/);
  assert.match(`${page}\n${component}`, /sound[- ]effect|音效/);
});
