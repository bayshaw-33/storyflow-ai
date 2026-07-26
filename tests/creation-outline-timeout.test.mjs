import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("./CreationWorkbench-latest.tsx", import.meta.url);

test("outline generation uses a longer timeout than the default creation chat window", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /const LONG_FORM_AI_TIMEOUT = 520_000/);
  assert.match(source, /function getAiTimeoutMs\(taskType: TaskType\)/);
  assert.match(source, /creation_plot_outline/);
  assert.match(source, /creation_episode_plan/);
  assert.match(source, /return LONG_FORM_AI_TIMEOUT;/);
  assert.match(source, /window\.setTimeout\(\(\) => controller\.abort\(\), getAiTimeoutMs\(taskType\)\)/);
  assert.doesNotMatch(source, /const AI_TIMEOUT = 240_000/);
});
