import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("production lazily imports inactive stage workbenches", async () => {
  const source = await read("../../../components/production/ProductionWorkbench.tsx");
  assert.match(source, /import dynamic from "next\/dynamic"/);
  assert.match(source, /dynamic\([\s\S]*import\("@\/components\/v2\/screenplay-studio\/ScreenplayStudio"\)/);
  assert.match(source, /dynamic\(\(\) => import\("@\/components\/art\/ArtWorkbench"\)/);
  assert.match(source, /dynamic\([\s\S]*import\("\.\/UnifiedStoryboardStage"\)/);
});

test("production requests context once per project and gates only downstream stages", async () => {
  const source = await read("../../../components/production/ProductionWorkbench.tsx");
  assert.match(source, /\}, \[projectId\]\);/);
  assert.match(source, /activeStage !== "storyboard" && activeStage !== "video"/);
});
