import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeUrl = new URL("../../app/api/v2/works/[workId]/screenplay/trilogy/route.ts", import.meta.url);

test("trilogy generation route authenticates and uses the existing screenplay services", () => {
  const source = readFileSync(routeUrl, "utf8");
  assert.match(source, /getViewerFromRequest\(request\)/);
  assert.match(source, /normalizeScreenplayConversationId/);
  assert.match(source, /ScreenplayTrilogyService/);
  assert.match(source, /ScreenplayUnitsService/);
  assert.match(source, /ScreenplayGenerationService/);
  assert.match(source, /generateAIContent/);
});

test("trilogy route does not introduce schema or migration behavior", () => {
  const source = readFileSync(routeUrl, "utf8");
  assert.doesNotMatch(source, /migration|create table|alter table/i);
  assert.match(source, /contractVersion: "2\.2\.0-alpha\.1"/);
});
