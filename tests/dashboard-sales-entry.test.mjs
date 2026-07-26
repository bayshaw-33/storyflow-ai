import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardPagePath = new URL("../app/dashboard/page.tsx", import.meta.url);

test("does not render the sales panel entry card in the workspace dashboard", async () => {
  const source = await readFile(dashboardPagePath, "utf8");

  assert.doesNotMatch(source, /SalesEntryCard/);
  assert.doesNotMatch(source, /dashboard-sales-entry/);
});
