/**
 * 分镜画布 — UnifiedStoryboardStage 第五子视图（自由排布画布）。
 *
 * 形态：Figma/Miro 风格自由画布（镜头卡 + 文字便签，拖放/平移/缩放）；
 * 持久化：随现有分镜草稿管线（scoped localStorage + 云端 upsert 同字段）。
 *
 * Run: node --test tests/contracts-v22/storyboard-canvas.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("canvas is the fifth storyboard subview with a Chinese label", () => {
  const stage = read("../../components/production/UnifiedStoryboardStage.tsx");
  assert.match(stage, /type StoryboardSubview = "shot_table" \| "grids" \| "motion" \| "prompts" \| "canvas"/);
  assert.match(stage, /\{ id: "canvas", label: "画布" \}/);
});

test("canvas state rides the production project state (draft pipeline field)", () => {
  const types = read("../../lib/production/types.ts");
  assert.match(types, /storyboardCanvas\?:\s*StoryboardCanvasState \| null/, "optional field on ProductionProjectState");
  assert.match(types, /export type StoryboardCanvasState = \{[\s\S]*?viewport[\s\S]*?shots[\s\S]*?notes/);
});

test("canvas component provides pan, zoom, item drag, and note editing", () => {
  const canvas = read("../../components/production/StoryboardCanvas.tsx");
  // 平移（背景拖拽）与缩放（滚轮 + 按钮 + 复位）
  assert.match(canvas, /onPointerDown=\{handleBackgroundPointerDown\}/, "background drag pans the viewport");
  assert.match(canvas, /onWheel=\{handleWheel\}/, "wheel zooms");
  assert.match(canvas, /重置视图/, "reset view action");
  // 镜头卡引用 scenes/frames 实时数据；便签可增删改
  assert.match(canvas, /添加便签/);
  assert.match(canvas, /全部镜头/, "one-click layout of all shots onto the canvas");
  assert.match(canvas, /note\.text/, "notes carry editable text");
  // 缩放夹取
  assert.match(canvas, /MIN_ZOOM|clampZoom/, "zoom clamped");
});

test("production workbench wires the canvas subview end-to-end", () => {
  const pw = read("../../components/production/ProductionWorkbench.tsx");
  assert.match(pw, /import \{ StoryboardCanvas \}/, "component imported");
  assert.match(pw, /canvas:\s*\(\s*<StoryboardCanvas/, "canvas content passed to the stage");
  assert.match(pw, /storyboardCanvas:\s*canvas/, "canvas persisted through the draft payload");
  assert.match(pw, /storyboardCanvas\s*\?\?\s*null/, "canvas restored from the draft on hydration");
  assert.match(pw, /requestedStoryboardSubview === "canvas"|=== "board"/, "URL alias storyboardView=canvas opens the subview");
});

test("shot cards resolve live scene/frame data by shotId", () => {
  const canvas = read("../../components/production/StoryboardCanvas.tsx");
  assert.match(canvas, /frames\[.*shotId/, "frame image resolved from the live frames map");
  assert.match(canvas, /镜头已删除|已失效/, "deleted shots degrade visibly instead of crashing");
});
