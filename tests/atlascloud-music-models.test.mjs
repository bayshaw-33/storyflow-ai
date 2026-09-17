import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const source = existsSync("lib/audio/music-models.ts") ? readFileSync("lib/audio/music-models.ts", "utf8") : "";

test("Atlas Cloud song catalog contains MiniMax and all three Suno V6 variants", () => {
  assert.match(source, /minimax\/music-3\.0/);
  assert.match(source, /suno\/chirp-v6/);
  assert.match(source, /suno\/chirp-v6-wild/);
  assert.match(source, /suno\/chirp-v6-mini/);
  assert.match(source, /labelZh: ["']Suno V6 Mini["']/);
  assert.match(source, /return ["']suno\/chirp-v6-mini["']/);
  assert.doesNotMatch(source, /suno\/chirp-v5/);
  assert.doesNotMatch(source, /minimax\/music-2\.6/);
  assert.doesNotMatch(source, /speech|tts|asr/i);
});

test("song capabilities expose music-only model metadata", () => {
  assert.match(source, /kind: ["']music["']/);
  assert.match(source, /provider: ["']atlascloud["']/);
  assert.match(source, /getDefaultAtlasCloudMusicModel/);
});
