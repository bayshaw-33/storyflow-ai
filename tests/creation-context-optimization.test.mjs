import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPath = new URL("../components/creation/CreationWorkbench.tsx", import.meta.url);
const promptsPath = new URL("../lib/ai/prompts.ts", import.meta.url);

test("creation context uses compressed uploaded source material instead of raw file dumps", async () => {
  const source = await readFile(componentPath, "utf8");

  assert.match(source, /function sourceMaterialContext\(\)/);
  assert.match(source, /sourceComprehension\?\.summary/);
  assert.match(source, /压缩成可复用的创作底稿|Compress the following materials into a reusable creative brief/);

  const contextSection = source.match(/function contextText\(\)\s*\{[\s\S]*?\n  \}/)?.[0] || "";
  const scopeSection = source.match(/function buildScopeContent\(\): string \{[\s\S]*?\n  \}\n\n  \/\/ P1-A/)?.[0] || "";

  assert.match(contextSection, /sourceMaterialContext\(\)/);
  assert.match(scopeSection, /const mats = sourceMaterialContext\(\)/);
  assert.doesNotMatch(contextSection, /sourceFiles\.map\(/);
  assert.doesNotMatch(scopeSection, /sourceFiles\.map\(/);
});

test("plot outline prompt is split into story spine and detailed outline sections", async () => {
  const prompts = await readFile(promptsPath, "utf8");

  assert.match(prompts, /---STORY_SPINE---/);
  assert.match(prompts, /---PLOT_OUTLINE---/);
  assert.match(prompts, /先输出[\s\S]*再输出/);
  assert.match(prompts, /## 大章 N｜标题/);
  assert.match(prompts, /### 第 N 章\/集｜标题/);
});
