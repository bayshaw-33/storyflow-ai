import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/song-workbench/page.tsx", "utf8");
const audio = readFileSync("components/song-workbench/AudioCandidates.tsx", "utf8");
const nav = readFileSync("components/song-workbench/SongWorkbenchNav.tsx", "utf8");

test("music workbench uses the product name and song-only destinations", () => {
  assert.match(nav, /音乐工作台/);
  assert.match(nav, /href="\/song-library"/);
  assert.match(nav, /href="\/song-voices"/);
  assert.match(nav, /href="\/song-toolkit"/);
  assert.doesNotMatch(page, /<button className="secondary-button song-history-button"/);
});

test("chat and audio actions have distinct labels", () => {
  assert.match(page, /聊一聊/);
  assert.match(page, /生成内容文档/);
  assert.match(audio, /生成音频候选/);
});

test("the old visible song workbench title is removed", () => {
  assert.doesNotMatch(`${page}\n${nav}`, /KIIKIS AI 歌曲工作台/);
  assert.doesNotMatch(page, /歌曲工作台已刷新|从歌曲工作台建立关联/);
});
