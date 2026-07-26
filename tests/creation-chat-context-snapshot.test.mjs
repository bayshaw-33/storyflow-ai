import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../components/creation/CreationWorkbench.tsx", import.meta.url);

test("creation AI requests build context from the same latest project snapshot", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /function contextText\(requestProject: DramaProject\)/);
  assert.match(source, /context:\s*contextText\(requestProject\)/);
  assert.doesNotMatch(source, /context:\s*contextText\(\)/);
});
