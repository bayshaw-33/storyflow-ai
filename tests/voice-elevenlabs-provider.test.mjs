import assert from "node:assert/strict";
import test from "node:test";

import {
  createElevenLabsTTSProvider,
  ElevenLabsProviderError,
} from "../lib/voice/providers/elevenlabs.ts";

function fakeResponse({ status = 200, json, bytes, contentType = "application/json" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
    json: async () => json ?? {},
    text: async () => JSON.stringify(json ?? {}),
    arrayBuffer: async () => (bytes ?? new Uint8Array([1, 2, 3])).buffer,
  };
}

function scriptedFetch(script) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return script(String(url), init);
  };
  return { fetchImpl, calls };
}

test("listVoices uses the authenticated personal voices endpoint and maps metadata", async () => {
  const { fetchImpl, calls } = scriptedFetch((url, init) => {
    assert.match(url, /^https:\/\/eleven\.local\/v2\/voices\?/);
    assert.match(url, /page_size=20/);
    assert.match(url, /search=warm/);
    assert.equal(init.headers["xi-api-key"], "secret-key");
    return fakeResponse({
      json: {
        voices: [{
          voice_id: "voice-1",
          name: "Warm Narrator",
          category: "professional",
          description: "Warm and clear",
          labels: { language: "zh", use_case: "narration" },
          preview_url: "https://cdn.example/voice.mp3",
          verified_languages: [{ language: "zh", locale: "zh-CN" }],
          is_owner: true,
          voice_type: "personal",
        }],
        has_more: true,
        next_page_token: "next-1",
      },
    });
  });
  const provider = createElevenLabsTTSProvider({
    apiKey: "secret-key",
    baseUrl: "https://eleven.local",
    fetchImpl,
  });

  const result = await provider.listVoices({ pageSize: 20, search: "warm" });
  assert.equal(calls.length, 1);
  assert.deepEqual(result, {
    voices: [{
      voiceId: "voice-1",
      name: "Warm Narrator",
      category: "professional",
      description: "Warm and clear",
      labels: { language: "zh", use_case: "narration" },
      previewUrl: "https://cdn.example/voice.mp3",
      verifiedLanguages: [{ language: "zh", locale: "zh-CN" }],
      isOwner: true,
      voiceType: "personal",
    }],
    hasMore: true,
    nextPageToken: "next-1",
  });
});

test("listSharedVoices forwards safe filters and returns community voice metadata", async () => {
  const { fetchImpl } = scriptedFetch((url, init) => {
    assert.match(url, /^https:\/\/eleven\.local\/v1\/shared-voices\?/);
    assert.match(url, /language=zh/);
    assert.match(url, /gender=female/);
    assert.match(url, /page=2/);
    assert.equal(init.headers["xi-api-key"], "secret-key");
    return fakeResponse({
      json: {
        voices: [{ voice_id: "shared-1", name: "Calm Voice", language: "zh", preview_url: "https://cdn.example/shared.mp3" }],
        has_more: false,
        total_count: 1,
      },
    });
  });
  const provider = createElevenLabsTTSProvider({ apiKey: "secret-key", baseUrl: "https://eleven.local", fetchImpl });
  const result = await provider.listSharedVoices({ pageSize: 30, language: "zh", gender: "female", page: 2 });
  assert.equal(result.voices[0].voiceId, "shared-1");
  assert.equal(result.voices[0].name, "Calm Voice");
  assert.equal(result.hasMore, false);
});

test("submit sends the selected voice id and returns ElevenLabs audio bytes", async () => {
  const bytes = new Uint8Array([0x49, 0x44, 0x33]);
  const { fetchImpl, calls } = scriptedFetch((url, init) => {
    assert.match(url, /\/v1\/text-to-speech\/voice-1\?/);
    assert.match(url, /output_format=mp3_44100_128/);
    assert.equal(init.headers["xi-api-key"], "secret-key");
    const body = JSON.parse(init.body);
    assert.equal(body.text, "你好，世界。");
    assert.equal(body.model_id, "eleven_multilingual_v2");
    assert.equal(body.voice_settings.speed, 1.2);
    assert.equal(body.voice_settings.stability, 0.8);
    return fakeResponse({ bytes, contentType: "audio/mpeg" });
  });
  const provider = createElevenLabsTTSProvider({
    apiKey: "secret-key",
    baseUrl: "https://eleven.local",
    fetchImpl,
  });
  const result = await provider.submit({
    text: "你好，世界。",
    voiceProviderVoiceId: "voice-1",
    language: "zh-CN",
    speed: 1.5,
    stability: 0.8,
    pitch: 0,
    stylePrompt: "warm",
  });

  assert.equal(calls.length, 1);
  assert.equal(result.kind, "sync_done");
  assert.deepEqual([...result.audioBytes], [...bytes]);
  assert.equal(result.contentType, "audio/mpeg");
  assert.equal(result.providerMetadata.voiceId, "voice-1");
  assert.equal(result.providerMetadata.apiKey, undefined);
});

test("provider is unavailable without an API key and rejects missing voice ids", async () => {
  const unavailable = createElevenLabsTTSProvider({ apiKey: "", fetchImpl: async () => fakeResponse() });
  assert.equal(unavailable.isAvailable(), false);

  const provider = createElevenLabsTTSProvider({ apiKey: "secret-key", fetchImpl: async () => fakeResponse() });
  await assert.rejects(
    () => provider.submit({ text: "x", voiceProviderVoiceId: null, language: "zh-CN" }),
    (error) => error instanceof ElevenLabsProviderError && error.code === "validation_failed",
  );
});

test("provider maps auth and upstream errors without exposing the API key", async () => {
  const provider = createElevenLabsTTSProvider({
    apiKey: "secret-key",
    fetchImpl: async () => fakeResponse({ status: 401, json: { detail: { message: "invalid key" } } }),
  });
  await assert.rejects(
    () => provider.listVoices(),
    (error) => error instanceof ElevenLabsProviderError
      && error.code === "unauthorized"
      && !error.message.includes("secret-key"),
  );
});

test("createVoiceClone sends the uploaded sample as multipart form data", async () => {
  const { fetchImpl, calls } = scriptedFetch((url, init) => {
    assert.equal(url, "https://eleven.local/v1/voices/add");
    assert.equal(init.headers["xi-api-key"], "secret-key");
    assert.equal(init.headers["Content-Type"], undefined, "multipart boundary is generated by fetch");
    assert.ok(init.body instanceof FormData);
    assert.equal(init.body.get("name"), "Studio Narrator");
    assert.equal(init.body.get("description"), "中文旁白");
    assert.equal(init.body.get("remove_background_noise"), "true");
    assert.equal(init.body.get("files").name, "sample.wav");
    return fakeResponse({ json: { voice_id: "cloned-1", requires_verification: true } });
  });
  const provider = createElevenLabsTTSProvider({ apiKey: "secret-key", baseUrl: "https://eleven.local", fetchImpl });
  const result = await provider.createVoiceClone({
    name: "Studio Narrator",
    description: "中文旁白",
    removeBackgroundNoise: true,
    file: new File([new Uint8Array([1, 2])], "sample.wav", { type: "audio/wav" }),
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(result, { voiceId: "cloned-1", requiresVerification: true });
});
