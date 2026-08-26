import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const readIfPresent = (path) => existsSync(path) ? readFileSync(path, "utf8") : "";
const providerSource = readIfPresent("lib/audio/provider.ts");
const typesSource = readIfPresent("lib/audio/types.ts");

test("audio provider contract has music, tts, poll and capability methods", () => {
  for (const name of ["MusicSubmitInput", "TTSSubmitInput", "AudioPollResult", "AudioProvider"]) {
    assert.ok(typesSource.includes(name), `${name} must exist`);
  }

  for (const name of ["resolveAudioProvider", "getAudioCapabilities"]) {
    assert.ok(providerSource.includes(name), `${name} must exist`);
  }
});

test("provider names include minimax, gmi and openai", () => {
  assert.match(typesSource, /minimax/);
  assert.match(typesSource, /gmi/);
  assert.match(typesSource, /openai/);
});

test("MiniMax capability checks support the two server-side account keys", () => {
  assert.match(providerSource, /MINIMAX_API_KEY_PRIMARY/);
  assert.match(providerSource, /MINIMAX_API_KEY_SECONDARY/);
});
