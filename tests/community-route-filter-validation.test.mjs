import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

async function routeSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertRejectsInvalidFilter(source, condition) {
  const start = source.indexOf(`if (${condition})`);
  assert.notEqual(start, -1, `missing invalid-filter guard: ${condition}`);
  assert.match(source.slice(start, start + 500), /\{ status: 400 \}/);
}

test("community appeals rejects an invalid status instead of broadening the query", async () => {
  const source = await routeSource("app/api/v2/community/appeals/route.ts");
  assertRejectsInvalidFilter(source, "status && !isAppealStatus(status)");
});

test("moderation queue rejects invalid status and targetType filters", async () => {
  const source = await routeSource("app/api/v2/community/moderation/queue/route.ts");
  assertRejectsInvalidFilter(source, "status && !isModerationStatus(status)");
  assertRejectsInvalidFilter(source, "targetType && !isReportTargetType(targetType)");
});

test("community reports rejects an invalid status instead of broadening the query", async () => {
  const source = await routeSource("app/api/v2/community/reports/route.ts");
  assertRejectsInvalidFilter(source, "status && !isReportStatus(status)");
});
