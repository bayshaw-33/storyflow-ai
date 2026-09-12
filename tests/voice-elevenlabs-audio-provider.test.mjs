import assert from "node:assert/strict";
import test from "node:test";

import { createElevenLabsAudioProvider } from "../lib/audio/providers/elevenlabs.ts";

test("ElevenLabs audio adapter is TTS-only and preserves the selected voice id", async () => {
  const response = {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "audio/mpeg" }),
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  };
  const calls = [];
  const provider = createElevenLabsAudioProvider({
    apiKey: "secret-key",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return response;
    },
  });

  assert.equal(provider.name, "elevenlabs");
  assert.equal(provider.isAvailable("tts"), true);
  assert.equal(provider.isAvailable("music"), false);
  assert.equal(provider.capabilities().music, false);
  assert.equal(provider.capabilities().tts, true);

  const result = await provider.submitTTS({
    text: "试音。",
    voiceProviderVoiceId: "voice-9",
    language: "zh-CN",
    speed: 1,
  });
  assert.equal(result.kind, "sync_done");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /voice-9/);
});
