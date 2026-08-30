import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workbenchPath = new URL("../components/production/ProductionWorkbench.tsx", import.meta.url);

test("storyboard and video stages restore latest adopted previs versions in bounded batches", async () => {
  const source = await readFile(workbenchPath, "utf8");
  assert.match(source, /activeStage !== "storyboard" && activeStage !== "video"/);
  assert.match(source, /getPrevisVersion/);
  assert.match(source, /adoptedPrevisByShot/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /slice\(index, index \+ 8\)/);
  assert.match(source, /summarizePrevisVersion/);
});

test("video job restoration carries server-owned sub-status and provider task identity", async () => {
  const workbench = await readFile(workbenchPath, "utf8");
  const route = await readFile(new URL("../app/api/storyboard/jobs/route.ts", import.meta.url), "utf8");
  assert.match(route, /result_metadata/);
  assert.match(route, /provider_task_id/);
  assert.match(workbench, /job\.result_metadata/);
  assert.match(workbench, /subStatus/);
});

test("failed previs recovery never clears existing adopted state", async () => {
  const source = await readFile(workbenchPath, "utf8");
  assert.match(source, /setAdoptedPrevisByShot\(\(current\)/);
  assert.doesNotMatch(source, /catch[\s\S]{0,120}setAdoptedPrevisByShot\(\{\}\)/);
});
