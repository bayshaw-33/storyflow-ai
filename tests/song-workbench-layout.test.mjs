import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const audio = readFileSync("components/song-workbench/AudioCandidates.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");

test("music controls keep mode, model, vocal direction, and generation in one desktop row", () => {
  assert.match(audio, /song-audio-top-controls/);
  assert.match(audio, /song-audio-mode-switch[\s\S]*song-audio-model-selector[\s\S]*song-audio-voice-selector[\s\S]*primary-button/);
  assert.match(styles, /\.song-audio-top-controls\s*\{[\s\S]*grid-template-columns:\s*auto\s+minmax\(180px,\s*1fr\)\s+124px\s+auto/);
});

test("song cover generation is a visible module, not only a history-row action", () => {
  assert.match(audio, /song-audio-cover-module/);
  assert.match(audio, /歌曲封面|Song cover/);
  assert.match(audio, /生成封面|Generate cover/);
  assert.match(audio, /下载封面|Download cover/);
  assert.match(styles, /\.song-audio-cover-module\s*\{/);
});
