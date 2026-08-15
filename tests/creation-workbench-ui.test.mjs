import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the retired novel route no longer mounts the legacy creation workbench", async () => {
  const page = await read("../app/novel-workbench/page.tsx");
  assert.doesNotMatch(page, /CreationWorkbench/);
  assert.match(page, /projects\/new-v2/);
  assert.doesNotMatch(page, /script-workbench\?projectId=/);
});

test("the active screenplay route mounts the V2.2 screenplay studio", async () => {
  const page = await read("../app/script-workbench/page.tsx");
  assert.match(page, /<ScreenplayStudio \/>/);
  assert.match(page, /resolve-work\?projectId=/);
  assert.match(page, /projects\/new-v2/);
  assert.doesNotMatch(page, /novel-workbench\?new=/);
});
