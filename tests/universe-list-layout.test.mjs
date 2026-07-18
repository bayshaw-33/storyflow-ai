import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Universe 列表避开全局侧栏，只保留紧凑搜索、统计和卡片墙", async () => {
  const [page, globalStyles, universeStyles] = await Promise.all([
    read("../app/universes/page.tsx"),
    read("../app/globals.css"),
    read("../components/universe/universe.module.css"),
  ]);

  assert.match(page, /className=\{`\$\{styles\.page\} universe-library-page`\}/);
  assert.match(
    globalStyles,
    /\.universe-library-page[\s\S]*padding-left:\s*var\(--workspace-nav-offset\)/,
  );
  assert.match(page, /className=\{styles\.compactSearch\}/);
  assert.match(universeStyles, /\.compactSearch[\s\S]*max-width:\s*280px/);
  assert.match(page, /className=\{styles\.countsStrip\}/);
  assert.match(page, /className=\{styles\.cardGrid\}/);

  assert.doesNotMatch(page, /aria-label="status filter"/);
  assert.doesNotMatch(page, /aria-label="tag filter"/);
  assert.doesNotMatch(page, /aria-label="sort"/);
  assert.doesNotMatch(page, /aria-label="view mode"/);
  assert.doesNotMatch(page, /<UniverseGraph/);
});
