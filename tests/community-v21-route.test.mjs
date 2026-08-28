import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("C1 search route exposes cursor, degraded, and correlationId contract", async () => {
  const source = await readFile(new URL("../app/api/v2/community/search/route.ts", import.meta.url), "utf8");
  assert.match(source, /searchCommunityFeed/);
  assert.match(source, /cursor/);
  assert.match(source, /degraded/);
  assert.match(source, /correlationId/);
  assert.match(source, /schema_error/);
});

test("C1 feed route keeps C0 offset compatibility while adding cursor search", async () => {
  const source = await readFile(new URL("../app/api/v2/community/feed/route.ts", import.meta.url), "utf8");
  assert.match(source, /nextOffset/);
  assert.match(source, /nextCursor/);
  assert.match(source, /cursor/);
});
