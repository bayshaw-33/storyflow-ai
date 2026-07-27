import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../components/creation/CreationWorkbench.tsx", import.meta.url);

test("creation AI context compresses uploaded materials before reuse", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /function sourceMaterialContext\(\)/);
  assert.match(source, /sourceComprehension\?\.summary/);
  assert.match(source, /压缩成可复用的创作底稿|Compress the following materials into a reusable creative brief/);
  assert.match(source, /context:\s*contextText\(\)/);
  assert.doesNotMatch(source, /sourceFiles\.map\(\(file\) => `资料 \$\{file\.name\}：\\n\$\{file\.text\}`\)\.join/);
});
