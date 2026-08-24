import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("screenplay bootstraps with a bounded recent KK history page", async () => {
  const studio = await read("../../../components/v2/screenplay-studio/ScreenplayStudio.tsx");
  const api = await read("../../../lib/client/v2/screenplay-studio/api.ts");
  assert.match(studio, /listMessages\(workId, conversationId, \{ limit: 30 \}\)/);
  assert.match(api, /hasMore: boolean/);
  assert.match(api, /nextBefore: string \| null/);
});

test("screenplay room exposes an explicit action to load older messages", async () => {
  const room = await read("../../../components/v2/screenplay-studio/KkScreenplayRoom.tsx");
  assert.match(room, /onLoadOlder/);
  assert.match(room, /加载更早对话/);
});
