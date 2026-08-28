import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const routePath = new URL("../app/api/v2/community/feed/route.ts", import.meta.url);

test("C0 feed route has an explicit section allow-list and paginated response", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /COMMUNITY_FEED_SECTIONS/);
  assert.match(source, /recommended/);
  assert.match(source, /universes/);
  assert.match(source, /works/);
  assert.match(source, /actors/);
  assert.match(source, /assets/);
  assert.match(source, /nextOffset/);
  assert.match(source, /hasMore/);
});

test("C0 feed route exposes correlationId for service failures", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /correlationId/);
  assert.match(source, /schema_error/);
  assert.match(source, /service_unavailable/);
});
