import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => existsSync(path) ? readFileSync(path, "utf8") : "";

test("GMI reconciliation helper queries the request queue without resubmitting music", () => {
  const source = read("lib/audio/providers/gmi-reconciliation.ts");
  assert.match(source, /findAcceptedGmiRequest/);
  assert.match(source, /\/requests\?\$\{query\.toString\(\)\}/);
  assert.match(source, /prompt/);
  assert.match(source, /lyrics/);
  assert.doesNotMatch(source, /method:\s*["']POST["']/);
});

test("provider JSON helper preserves a top-level request queue array", async () => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = process.env.GMI_AUDIO_BASE_URL;
  process.env.GMI_AUDIO_BASE_URL = "https://gmi.example.test/requestqueue";
  globalThis.fetch = async () => new Response(JSON.stringify([
    {
      request_id: "gmi-request-1",
      model: "minimax-music-3.0",
      status: "dispatched",
      created_at: Math.floor(Date.now() / 1000),
      payload: { prompt: "warm synth pop", lyrics: "hello world" },
    },
  ]), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const { requestJson } = await import("../lib/audio/providers/helpers.ts");
    const result = await requestJson("https://gmi.example.test/requestqueue/requests", "test-key");
    assert.equal(result.data?.[0]?.request_id, "gmi-request-1");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.GMI_AUDIO_BASE_URL;
    else process.env.GMI_AUDIO_BASE_URL = originalBaseUrl;
  }
});

test("result ingestion failure is explicit and retryable", () => {
  const source = read("app/api/audio/jobs/[jobId]/route.ts");
  assert.match(source, /AUDIO_RESULT_INGEST_FAILED/);
  assert.match(source, /status:\s*["']failed["']/);
});
