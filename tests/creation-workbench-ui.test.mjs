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

test("the legacy screenplay entry redirects to the unified production route (P1-06)", async () => {
  const page = await read("../app/script-workbench/page.tsx");
  // K2.2 统一工作台：studio 由 /production 的 script tab 挂载；
  // 遗留入口只做解析重定向，不再直接挂载 ScreenplayStudio。
  assert.doesNotMatch(page, /<ScreenplayStudio \/>/);
  assert.match(page, /resolveUnifiedWorkbenchRoute/);
  assert.match(page, /tab: "script"/);
  // 解析失败停留本页保留 projectId（LegacyEntryNotice），不再甩回新建选择态
  assert.match(page, /LegacyEntryNotice/);
  assert.doesNotMatch(page, /router\.replace\("\/projects\/new-v2"\)/);
  assert.doesNotMatch(page, /novel-workbench\?new=/);
});
