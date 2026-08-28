import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("C1 Universe community page uses the real Universe projection and creation APIs", async () => {
  const source = await read("app/universe/[universeId]/community/page.tsx");
  assert.match(source, /readCommunityUniverse/);
  assert.match(source, /getViewerFromCookies/);
  assert.match(source, /api\/v2\/project-start/);
  assert.match(source, /api\/v2\/projects/);
  assert.match(source, /idempotency-key/);
});

test("C1 Universe UI distinguishes Canon, Local Overlay, and draft candidates", async () => {
  const [page, entities, timeline] = await Promise.all([
    read("components/v2/community/UniverseCommunityPage.tsx"),
    read("components/v2/community/UniverseEntitiesSection.tsx"),
    read("components/v2/community/UniverseTimeline.tsx"),
  ]);
  const source = `${page}\n${entities}\n${timeline}`;
  assert.match(source, /Canon/);
  assert.match(source, /Local Overlay/);
  assert.match(source, /草稿候选|Draft candidates/);
  assert.match(source, /Universe/);
});

test("C1 Universe UI keeps honest degraded and unavailable states", async () => {
  const source = await read("components/v2/community/UniverseCommunityPage.tsx");
  assert.match(source, /degraded/);
  assert.match(source, /重试|Retry/);
  assert.doesNotMatch(source, /fixture|demo/i);
});
