import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const component = readFileSync("components/song-workbench/AudioCandidates.tsx", "utf8");
const page = readFileSync("app/song-workbench/page.tsx", "utf8");

test("audio candidates expose a shared player and per-track retry", () => {
  assert.match(component, /Persistent|persistent|song-audio-persistent-player/);
  assert.match(component, /HTMLAudioElement|audioRef|useRef/);
  assert.match(component, /onRetry/);
  assert.match(component, /波形|waveform|song-audio-wave/);
});

test("song generation uses one music batch request for A and B", () => {
  assert.match(page, /audio\/jobs\/batch/);
  assert.match(page, /candidates:\s*\[/);
  assert.doesNotMatch(page, /Promise\.allSettled\(placeholders\.map/);
});

test("reconciling is a visible non-terminal candidate state", () => {
  assert.match(component, /reconciling/);
  assert.match(page, /reconciling/);
});

test("song candidates keep polling through reconciliation and hide internal non-terminal errors", () => {
  assert.match(page, /attempt\s*<\s*90/);
  assert.match(page, /job\.status\s*===\s*["']reconciling["']\s*\?\s*null/);
  assert.match(component, /canRetry\s*&&\s*candidate\.error/);
});
