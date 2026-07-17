import assert from "node:assert/strict";
import test from "node:test";

const { requestLyricsTranslation } = await import("../lib/song/translation.ts");

test("requests a lyric translation for the selected target language", async () => {
  const controller = new AbortController();
  let capturedUrl = "";
  let capturedInit;
  const fetcher = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return new Response(JSON.stringify({ success: true, output: "[Chorus]\n月光" }));
  };

  const output = await requestLyricsTranslation({
    accessToken: "test-token",
    projectTitle: "Moon Song",
    sourceLyrics: "[Chorus]\nMoonlight",
    targetLanguage: "Chinese",
    signal: controller.signal,
    fetcher,
  });

  assert.equal(output, "[Chorus]\n月光");
  assert.equal(capturedUrl, "/api/ai/generate");
  assert.equal(capturedInit.signal, controller.signal);
  const body = JSON.parse(capturedInit.body);
  assert.equal(body.taskType, "translation");
  assert.equal(body.options.targetLanguage, "Chinese");
  assert.match(body.input, /Moonlight/);
});

test("rejects an empty translation instead of clearing the current result", async () => {
  const fetcher = async () => new Response(JSON.stringify({ success: true, output: "  " }));

  await assert.rejects(
    requestLyricsTranslation({
      accessToken: "test-token",
      projectTitle: "Moon Song",
      sourceLyrics: "Moonlight",
      targetLanguage: "Chinese",
      signal: new AbortController().signal,
      fetcher,
    }),
    /empty translation/i,
  );
});

test("propagates cancellation so an obsolete translation cannot refill the UI", async () => {
  const controller = new AbortController();
  const fetcher = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });

  const request = requestLyricsTranslation({
    accessToken: "test-token",
    projectTitle: "Moon Song",
    sourceLyrics: "Moonlight",
    targetLanguage: "Chinese",
    signal: controller.signal,
    fetcher,
  });
  controller.abort();

  await assert.rejects(request, (error) => error?.name === "AbortError");
});
