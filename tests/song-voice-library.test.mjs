import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("song voice library is separate from TTS", () => {
  assert.ok(existsSync("lib/song/singers.ts"));
  assert.ok(existsSync("app/song-voices/page.tsx"));
  assert.ok(existsSync("components/song-workbench/SongVoiceLibrary.tsx"));
  const contract = readFileSync("lib/song/singers.ts", "utf8");
  const page = readFileSync("components/song-workbench/SongVoiceLibrary.tsx", "utf8");
  assert.match(contract, /export type SingerProfile/);
  assert.match(contract, /SONG_SINGER_LIBRARY_STORAGE_KEY/);
  assert.match(page, /SONG_WORKBENCH_STORAGE_KEY/);
  assert.match(page, /歌曲音色库/);
  assert.match(page, /应用到音乐工作台/);
  assert.doesNotMatch(page, /TTS|配音生成|语音克隆/);
});
