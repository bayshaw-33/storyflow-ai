import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("video confirmation lists actual adopted conditions in an overlay", async () => {
  const source = await read("components/production/VideoGenerationConfirmDialog.tsx");
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /白模版本/);
  assert.match(source, /首帧/);
  assert.match(source, /提示词/);
  assert.match(source, /无法原样传递/);
  assert.match(source, /previsVersion\.firstframeUrl/);
});

test("confirmation reuses existing shell classes and adds no stylesheet", async () => {
  const source = await read("components/production/VideoGenerationConfirmDialog.tsx");
  assert.match(source, /workbench-shell\.module\.css/);
  assert.match(source, /styles\.overlay/);
  assert.match(source, /styles\.dialog/);
  assert.equal(existsSync(new URL("components/production/VideoGenerationConfirmDialog.module.css", root)), false);
});

test("existing shot video button opens confirmation and passes the adopted version id", async () => {
  const source = await read("components/production/ShotVideoPanel.tsx");
  assert.match(source, /VideoGenerationConfirmDialog/);
  assert.match(source, /setConfirmOpen\(true\)/);
  assert.match(source, /onGenerate\(previsVersion\?\.id\)/);
});

test("confirmation data flows through existing frame cards without a new layout region", async () => {
  const panels = await read("components/production/StoryboardPanels.tsx");
  const workbench = await read("components/production/ProductionWorkbench.tsx");
  assert.match(panels, /previsVersion=\{adoptedPrevisByShot\[shotId\]\}/);
  assert.match(workbench, /adoptedPrevisByShot=\{adoptedPrevisByShot\}/);
  assert.doesNotMatch(panels, /previsPersistentPanel|previsSidebar|previsColumn/);
});
