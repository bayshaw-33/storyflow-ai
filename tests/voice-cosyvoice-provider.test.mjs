/**
 * Phase 5 Task 5.4 — CosyVoice provider adapter (RED).
 *
 * Verifies (network tests use a fake fetch, never a live model):
 *   - submit maps domain input to CosyVoice request, records task id
 *   - poll maps running/completed/failed + temporary URL
 *   - timeout & provider failure map to typed errors
 *   - health check; model/params recorded in metadata
 *   - temporary URL is ingestion-only (never marks asset ready)
 *
 * Run: node --test tests/voice-cosyvoice-provider.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createCosyVoiceProvider, CosyVoiceProviderError } from "../lib/voice/providers/cosyvoice.ts";

const BASE_URL = "http://cosyvoice.local";
const TOKEN = "test-token";

function fakeFetch(script) {
  const calls = [];
  return async (url, init) => {
    calls.push({ url: String(url), init });
    const match = script(url, init);
    if (match instanceof Error) throw match;
    return {
      ok: match.ok !== false,
      status: match.status ?? 200,
      json: async () => match.json ?? {},
    };
  };
}

test("submit maps domain input to CosyVoice request and returns task id", async () => {
  const fetchImpl = fakeFetch((url, init) => {
    assert.ok(url.startsWith(`${BASE_URL}/api/v1/tasks`), "posts to /tasks");
    const body = JSON.parse(String(init.body));
    assert.equal(body.text, "你好，废土旅人。");
    assert.equal(body.language, "zh-CN");
    assert.equal(body.emotion, "calm");
    assert.equal(body.speed, 0.9);
    assert.equal(body.voice_ref, "voice-9");
    return { json: { task_id: "task-1", status: "running" } };
  });
  const provider = createCosyVoiceProvider({ baseUrl: BASE_URL, token: TOKEN, fetchImpl });
  const result = await provider.submit({
    text: "你好，废土旅人。",
    language: "zh-CN",
    emotion: "calm",
    speed: 0.9,
    voiceRef: "voice-9",
  });
  assert.equal(result.providerTaskId, "task-1");
  assert.equal(provider.name, "cosyvoice");
});

test("poll maps running / completed(temporary URL) / failed", async () => {
  const responses = [
    { status: "running" },
    { status: "completed", audio_url: "http://cosyvoice.local/tasks/task-1/out.wav" },
  ];
  let n = 0;
  const fetchImpl = fakeFetch((url) => {
    assert.ok(url.includes("/tasks/task-1"));
    return { json: responses[n++] };
  });
  const provider = createCosyVoiceProvider({ baseUrl: BASE_URL, token: TOKEN, fetchImpl });
  const running = await provider.poll("task-1");
  assert.equal(running.status, "running");
  const done = await provider.poll("task-1");
  assert.equal(done.status, "completed");
  assert.ok(done.temporaryUrl.includes("out.wav"), "temporary URL returned for ingestion only");
  assert.equal(done.error, undefined);
});

test("failed poll surfaces the provider error", async () => {
  const fetchImpl = fakeFetch(() => ({ json: { status: "failed", error: "synthesis error" } }));
  const provider = createCosyVoiceProvider({ baseUrl: BASE_URL, token: TOKEN, fetchImpl });
  const result = await provider.poll("task-1");
  assert.equal(result.status, "failed");
  assert.ok(result.error.includes("synthesis error"));
});

test("timeout maps to a typed CosyVoiceProviderError", async () => {
  const fetchImpl = fakeFetch(() => {
    const err = new Error("timeout of 3000ms exceeded");
    err.name = "TimeoutError";
    return err;
  });
  const provider = createCosyVoiceProvider({ baseUrl: BASE_URL, token: TOKEN, fetchImpl, timeoutMs: 3000 });
  await assert.rejects(
    () => provider.submit({ text: "x", language: "zh-CN" }),
    (e) => e instanceof CosyVoiceProviderError && e.code === "timeout",
  );
});

test("provider 5xx maps to service_unavailable, 401 to unauthorized", async () => {
  const five = createCosyVoiceProvider({
    baseUrl: BASE_URL, token: TOKEN,
    fetchImpl: fakeFetch(() => ({ ok: false, status: 503, json: { error: "busy" } })),
  });
  await assert.rejects(
    () => five.submit({ text: "x", language: "zh-CN" }),
    (e) => e instanceof CosyVoiceProviderError && e.code === "service_unavailable",
  );
  const unauthorized = createCosyVoiceProvider({
    baseUrl: BASE_URL, token: TOKEN,
    fetchImpl: fakeFetch(() => ({ ok: false, status: 401, json: { error: "invalid token" } })),
  });
  await assert.rejects(
    () => unauthorized.submit({ text: "x", language: "zh-CN" }),
    (e) => e instanceof CosyVoiceProviderError && e.code === "unauthorized",
  );
});

test("health check reports reachable / unreachable", async () => {
  const ok = createCosyVoiceProvider({
    baseUrl: BASE_URL, token: TOKEN,
    fetchImpl: fakeFetch((url) => (url.includes("/health") ? { json: { ok: true } } : { json: {} })),
  });
  assert.equal(await ok.health(), true);
  const down = createCosyVoiceProvider({
    baseUrl: BASE_URL, token: TOKEN,
    fetchImpl: fakeFetch(() => new Error("connection refused")),
  });
  assert.equal(await down.health(), false);
});

test("model & params are recorded in provider metadata, never secrets", async () => {
  const fetchImpl = fakeFetch(() => ({ json: { task_id: "t1", model: "cosyvoice2" } }));
  const provider = createCosyVoiceProvider({ baseUrl: BASE_URL, token: TOKEN, fetchImpl, model: "cosyvoice2" });
  await provider.submit({ text: "x", language: "zh-CN", emotion: "calm", speed: 1.0 });
  const meta = provider.lastMetadata;
  assert.equal(meta.model, "cosyvoice2");
  assert.equal(meta.params.emotion, "calm");
  assert.equal(meta.token, undefined, "token never recorded");
});
