import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("white model reuses the existing handoff button and saves before handing off", async () => {
  const source = await read("components/production/WhiteModelPrevis.tsx");
  assert.match(source, /savePrevisVersion/);
  assert.match(source, /保存并送视频/);
  assert.match(source, /await\s+storyboardClient\.savePrevisVersion/);
  assert.match(source, /onPrevisAdopted\(saved\)/);
  assert.doesNotMatch(source, /previsPersistentPanel|新增白模侧栏/);
});

test("storyboard client exposes scoped save and read methods", async () => {
  const source = await read("lib/storyboard/client.ts");
  assert.match(source, /async savePrevisVersion\(/);
  assert.match(source, /async getPrevisVersion\(/);
  assert.match(source, /previs-versions/);
});

test("unified stage order and storyboard subviews remain unchanged", async () => {
  const source = await read("components/production/UnifiedStoryboardStage.tsx");
  assert.match(source, /"shot_table"\s*\|\s*"grids"\s*\|\s*"motion"\s*\|\s*"prompts"\s*\|\s*"canvas"/);
  assert.equal((source.match(/id:\s*"motion"/g) || []).length, 1);
  assert.match(source, /storyboardClient=\{storyboardClient\}/);
  assert.match(source, /onPrevisAdopted=\{onPrevisAdopted\}/);
});

test("production workbench stores the adopted version and switches through the existing stage navigation", async () => {
  const source = await read("components/production/ProductionWorkbench.tsx");
  assert.match(source, /adoptedPrevisByShot/);
  assert.match(source, /handlePrevisAdopted/);
  assert.match(source, /navigateToStage\("video"\)/);
  assert.doesNotMatch(source, /previsPersistentPanel|previsSidebar|previsColumn/);
});
