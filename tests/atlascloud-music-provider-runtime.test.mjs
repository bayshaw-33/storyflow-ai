import assert from "node:assert/strict";
import test from "node:test";
import { createAtlasCloudAudioProvider } from "../lib/audio/providers/atlascloud.ts";

function response(body, status = 200, contentType = "application/json") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
    json: async () => body,
    arrayBuffer: async () => new Uint8Array([73, 68, 51, 4]).buffer,
  };
}

test("Atlas music adapter submits, polls nested outputs, and downloads real bytes", async () => {
  const originalKey = process.env.ATLASCLOUD_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.ATLASCLOUD_API_KEY = "test-atlas-key";
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) return response({ data: { id: "music-prediction-1" } });
    if (calls.length === 2) return response({ data: { status: "succeeded", output: { audio_url: "https://cdn.example/audio.mp3" } } });
    return response(null, 200, "audio/mpeg");
  };
  try {
    const provider = createAtlasCloudAudioProvider();
    const submitted = await provider.submitMusic({ model: "minimax/music-3.0", prompt: "cinematic piano", lyrics: "[Verse] hello", musicMode: "vocal" });
    assert.deepEqual(submitted, { kind: "async_submitted", providerTaskId: "music-prediction-1" });
    const polled = await provider.poll("music-prediction-1", "music");
    assert.equal(polled.status, "done");
    assert.equal(polled.audioUrl, "https://cdn.example/audio.mp3");
    const downloaded = await provider.download(polled.audioUrl);
    assert.equal(downloaded.contentType, "audio/mpeg");
    assert.equal(downloaded.bytes.byteLength, 4);
    assert.equal(calls[0].url, "https://api.atlascloud.ai/api/v1/model/generateAudio");
    assert.equal(calls[1].url, "https://api.atlascloud.ai/api/v1/model/prediction/music-prediction-1");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey) process.env.ATLASCLOUD_API_KEY = originalKey;
    else delete process.env.ATLASCLOUD_API_KEY;
  }
});

test("Atlas adapter never treats an HTML error page as an audio artifact", async () => {
  const originalKey = process.env.ATLASCLOUD_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.ATLASCLOUD_API_KEY = "test-atlas-key";
  globalThis.fetch = async () => response("<html>error</html>", 200, "text/html");
  try {
    await assert.rejects(() => createAtlasCloudAudioProvider().download("https://cdn.example/not-audio"), /AUDIO_DOWNLOAD_INVALID_CONTENT_TYPE/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey) process.env.ATLASCLOUD_API_KEY = originalKey;
    else delete process.env.ATLASCLOUD_API_KEY;
  }
});
