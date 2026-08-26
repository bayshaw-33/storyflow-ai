import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const source = (path) => existsSync(path) ? readFileSync(path, "utf8") : "";
const minimax = source("lib/audio/providers/minimax.ts");
const gmi = source("lib/audio/providers/gmi.ts");
const openai = source("lib/audio/providers/openai.ts");
const voiceProvider = source("lib/voice/provider.ts");
const voiceTypes = source("lib/voice/types.ts");

test("MiniMax adapter uses official music and async speech endpoints", () => {
  assert.match(minimax, /music_generation/);
  assert.match(minimax, /t2a_async_v2/);
  assert.match(minimax, /query\/t2a_async_query_v2/);
  assert.match(minimax, /files\/retrieve_content/);
});

test("GMI adapter uses the request queue and MiniMax audio model ids", () => {
  assert.match(gmi, /requestqueue\/apikey/);
  assert.match(gmi, /`\$\{baseUrl\(\)\}\/requests/);
  assert.match(gmi, /minimax-music-3\.0/);
  assert.match(gmi, /minimax-tts-speech-2\.8-hd/);
  assert.match(gmi, /outcome/);
  assert.match(source("lib/audio/providers/helpers.ts"), /Array\.isArray\(value\)/);
});

test("audio OpenAI adapter remains TTS-only and voice resolver recognizes new providers", () => {
  assert.match(openai, /audio\/speech/);
  assert.doesNotMatch(openai, /music_generation/);
  assert.match(voiceTypes, /"minimax"/);
  assert.match(voiceTypes, /"gmi"/);
  assert.match(voiceProvider, /name === "minimax"/);
  assert.match(voiceProvider, /name === "gmi"/);
});
