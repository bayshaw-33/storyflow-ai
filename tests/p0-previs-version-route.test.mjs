import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("../app/api/storyboard/shots/[shotId]/previs-versions/route.ts", import.meta.url);

test("previs version route authenticates and scopes POST to the URL shot", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /authenticateRequest/);
  assert.match(source, /savePrevisVersion/);
  assert.match(source, /context\.params/);
  assert.match(source, /shotId/);
  assert.match(source, /success:\s*true,\s*version/);
});

test("previs version GET supports latest and explicit versionId", async () => {
  const source = await readFile(routePath, "utf8");
  assert.match(source, /readLatestPrevisVersion/);
  assert.match(source, /readPrevisVersion/);
  assert.match(source, /searchParams\.get\("versionId"\)/);
});
