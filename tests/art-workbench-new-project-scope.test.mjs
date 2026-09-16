import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("独立美术台的新项目使用独立草稿作用域", async () => {
  const workbench = await read("components/art/ArtWorkbench.tsx");
  assert.match(workbench, /standaloneDraftId/);
  assert.match(workbench, /setStandaloneDraftScope\(next\.id\)/);
  assert.match(workbench, /getArtWorkbenchStorageKey\([^)]*standaloneDraftId/);
});

test("独立项目的资产详情链接携带 draftId，详情页按同一作用域读取", async () => {
  const workbench = await read("components/art/ArtWorkbench.tsx");
  const detail = await read("components/art/ArtAssetDetail.tsx");
  assert.match(workbench, /draftId/);
  assert.match(workbench, /searchParams\.set\("draftId"/);
  assert.match(detail, /searchParams\.get\("draftId"\)/);
  assert.match(detail, /getArtWorkbenchStorageKey\([^)]*standaloneDraftId/);
});
