/**
 * Phase 5 Task 5.3 — 分镜合并概念 (RED).
 *
 * Verifies:
 *   - 顶级入口只保留“分镜”（无独立“动态分镜”Tab）
 *   - 单一页面承载镜头表/宫格/运动预览/视频提示词/版本 Diff（tab 集）
 *   - 旧动态分镜 URL 只做兼容重定向，不再显示顶级 Tab
 *   - 动态 grid schema 仍可解析（历史数据兼容）
 *
 * Run: node --test tests/storyboard-e2e-scenarios.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  STORYBOARD_ENTRY,
  STORYBOARD_WORKBENCH_TABS,
  legacyDynamicStoryboardRedirect,
  isDynamicGridTab,
} from "../lib/storyboard/contracts.ts";
import { DYNAMIC_GRID_SCHEMA_VERSION } from "../lib/storyboard/dynamic-grid-contract.ts";

test("only one top-level storyboard entry exists (no separate dynamic tab)", () => {
  assert.equal(STORYBOARD_ENTRY.id, "storyboard");
  // isDynamicGridTab 识别旧“动态分镜”tab（历史遗留），它不是顶级入口
  assert.equal(isDynamicGridTab("dynamic-storyboard"), true);
  assert.equal(isDynamicGridTab("storyboard"), false);
});

test("single page carries shot list / grid / motion / video prompt / version diff tabs", () => {
  const ids = STORYBOARD_WORKBENCH_TABS.map((t) => t.id);
  assert.deepEqual(ids, ["shots", "grid", "motion", "video_prompt", "diff"]);
});

test("legacy dynamic storyboard URL redirects compatibly (never a top-level tab)", () => {
  const redirect = legacyDynamicStoryboardRedirect("/storyboard-workbench?view=dynamic");
  assert.ok(redirect.target.includes("storyboard"));
  assert.ok(!redirect.target.includes("view=dynamic"));
  assert.equal(redirect.permanent, false);
});

test("legacy dynamic grid schema version stays parseable", () => {
  assert.equal(DYNAMIC_GRID_SCHEMA_VERSION, "kiikis.dynamic-grid-storyboard/1");
});

test("production keeps one storyboard stage and moves motion grid inside it", () => {
  const productionSource = readFileSync(new URL("../components/production/ProductionWorkbench.tsx", import.meta.url), "utf8");
  const stageSource = readFileSync(new URL("../components/production/UnifiedStoryboardStage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(productionSource, /UNIFIED_PRODUCTION_STAGES[\s\S]{0,240}grid/);
  assert.match(stageSource, /DynamicGridEditor/);
  assert.match(stageSource, /type StoryboardSubview = "shot_table" \| "grids" \| "motion" \| "prompts"/);
});
