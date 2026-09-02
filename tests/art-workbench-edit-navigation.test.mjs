import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../components/art/ArtWorkbench.tsx", import.meta.url);

test("嵌入美术工作台的新增角色卡也能进入带 scope 的编辑页", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.doesNotMatch(
    source,
    /embedded\s*\?\s*<div className=\{styles\.assetCard\}/,
    "嵌入模式不得把资产卡降级成不可点击的 div",
  );
  assert.match(
    source,
    /<Link className=\{styles\.assetCard\} href=\{assetDetailHref\}>\{cardContent\}<\/Link>/,
    "所有资产卡都必须复用带 projectId/sourceUnitId 的详情链接",
  );
});
