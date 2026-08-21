/**
 * Phase 3 Task 3.3 — Screenplay Studio layout contract tests.
 *
 * Since React components can't render in pure node --test, these validate the
 * layout contract that ScreenplayStudio renders: two-panel structure,
 * staged workflow navigation, contextual tools, and URL state shape.
 *
 * Run: node --test tests/ui-v2/screenplay-studio/layout.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SCREENPLAY_STUDIO_NAV_GROUPS,
  SCREENPLAY_STUDIO_RIGHT_PANEL_TABS,
  SCREENPLAY_STUDIO_WORKFLOW_STAGES,
  STUDIO_LAYOUT,
  buildStudioUrl,
  parseStudioUrl,
  NAV_GROUP_OF_TYPE,
} from "../../../lib/client/v2/screenplay-studio/types.ts";

// ============================================================
// 1. Left nav tree groups (world/character/outline/episode/scene)
// ============================================================

test("nav groups cover all five unit types in order", () => {
  assert.deepEqual(SCREENPLAY_STUDIO_NAV_GROUPS.map((g) => g.id), [
    "world",
    "character",
    "outline",
    "episode",
    "scene",
  ]);
  const covered = new Set(SCREENPLAY_STUDIO_NAV_GROUPS.flatMap((g) => g.types));
  for (const t of ["world", "character", "outline", "episode", "scene"]) {
    assert.ok(covered.has(t), `nav group missing type ${t}`);
  }
});

test("workflow stages keep the trilogy, nest similarity under outline, and omit screenplay translation", () => {
  assert.deepEqual(SCREENPLAY_STUDIO_WORKFLOW_STAGES.map((stage) => stage.id), [
    "world",
    "character",
    "outline",
    "similarity",
    "episode",
    "screenplay",
    "localization",
    "delivery",
  ]);
  assert.equal(SCREENPLAY_STUDIO_WORKFLOW_STAGES.find((stage) => stage.id === "similarity")?.parent, "outline");
  assert.equal(SCREENPLAY_STUDIO_WORKFLOW_STAGES.some((stage) => stage.id === "translation"), false);
});

test("NAV_GROUP_OF_TYPE maps every unit type to its group", () => {
  assert.equal(NAV_GROUP_OF_TYPE.world, "world");
  assert.equal(NAV_GROUP_OF_TYPE.character, "character");
  assert.equal(NAV_GROUP_OF_TYPE.outline, "outline");
  assert.equal(NAV_GROUP_OF_TYPE.episode, "episode");
  assert.equal(NAV_GROUP_OF_TYPE.scene, "scene");
});

// ============================================================
// 2. Right panel tabs (KK / references / versions / continuity)
// ============================================================

test("right panel exposes kk/references/versions/continuity tabs", () => {
  assert.deepEqual([...SCREENPLAY_STUDIO_RIGHT_PANEL_TABS], [
    "kk",
    "references",
    "versions",
    "continuity",
  ]);
});

// ============================================================
// 3. Layout contract
// ============================================================

test("STUDIO_LAYOUT declares desktop two columns and contextual drawers", () => {
  assert.equal(STUDIO_LAYOUT.desktopColumns, 2);
  assert.equal(STUDIO_LAYOUT.narrowBehavior, "drawers");
  assert.ok(Array.isArray(STUDIO_LAYOUT.breakpoints));
});

test("embedded studio owns canonical identity and one main view at a time", () => {
  const source = readFileSync(new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.tsx", import.meta.url), "utf8");
  assert.match(source, /embedded\?: boolean/);
  assert.match(source, /projectId\?: string/);
  assert.match(source, /parseUnifiedWorkbenchQuery/);
  assert.match(source, /type ScreenplayMainView = "conversation" \| "document" \| "diff"/);
  assert.match(source, /data-testid="main-view-conversation"/);
  assert.match(source, /data-testid="main-view-document"/);
  assert.match(source, /data-testid="main-view-diff"/);
  assert.doesNotMatch(source, /router\.replace\(`\?workId=/);
});

test("embedded screenplay keeps global navigation and uses parent-bounded height", () => {
  const source = readFileSync(new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.module.css", import.meta.url), "utf8");
  assert.match(source, /if \(embedded \|\| !workId\) return/);
  assert.match(source, /embedded \? styles\.embedded : ""/);
  assert.match(source, /styles\.structureToggle/);
  assert.match(css, /\.studio\.embedded\s*\{[\s\S]*height:\s*auto/);
  assert.match(css, /\.studio\.embedded\s*\{[\s\S]*min-height:\s*calc\(100dvh/);
  assert.match(css, /\.studio\.embedded\.narrow\s*\{[\s\S]*min-height:\s*calc\(100dvh/);
  assert.match(css, /\.narrow \.structureToggle\s*\{[\s\S]*position:\s*absolute/);
});

test("embedded screenplay relies on the left workflow tree without a duplicate strip", () => {
  const source = readFileSync(new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.tsx", import.meta.url), "utf8");
  assert.match(source, /!embedded \? \([\s\S]*styles\.workflowStrip/);
});

test("similarity review is muted until explicitly opened and respects its gate", () => {
  const studio = readFileSync(new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.tsx", import.meta.url), "utf8");
  const navigator = readFileSync(new URL("../../../components/v2/screenplay-studio/UnitNavigator.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.module.css", import.meta.url), "utf8");
  assert.match(studio, /similarityActive=\{activeTool === "similarity"\}/);
  assert.match(studio, /similarityReady=\{similarityGate\.ready\}/);
  assert.match(navigator, /similarityActive\?: boolean/);
  assert.match(navigator, /similarityReady\?: boolean/);
  assert.match(navigator, /styles\.subStageActive/);
  assert.match(navigator, /disabled=\{!similarityReady\}/);
  assert.match(css, /\.subStageActive/);
});

test("screenplay chat uses the Work UUID directly instead of a database-invalid prefixed id", () => {
  const source = readFileSync(new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.tsx", import.meta.url), "utf8");
  assert.match(source, /const conversationId = useMemo\(\(\) => workId \?\? "", \[workId\]\)/);
  assert.doesNotMatch(source, /`kk-\$\{workId/);
});

test("quiet screenplay workspace keeps conversation essentials and removes repeated promotional copy", () => {
  const studio = readFileSync(new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.tsx", import.meta.url), "utf8");
  const room = readFileSync(new URL("../../../components/v2/screenplay-studio/KkScreenplayRoom.tsx", import.meta.url), "utf8");
  const navigator = readFileSync(new URL("../../../components/v2/screenplay-studio/UnitNavigator.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.module.css", import.meta.url), "utf8");

  assert.match(studio, /styles\.workspaceBar/);
  assert.match(studio, /styles\.workspaceTools/);
  assert.match(room, /styles\.kkStarter/);
  assert.match(room, /styles\.kkErrorInline/);
  assert.match(css, /\.kkTranscript[\s\S]*flex:\s*1/);

  for (const source of [studio, room, navigator]) {
    assert.doesNotMatch(source, /KK · AI 剧本伙伴/);
    assert.doesNotMatch(source, /从你的意图开始/);
    assert.doesNotMatch(source, /对话优先/);
    assert.doesNotMatch(source, /工具在当前主区域打开/);
    assert.doesNotMatch(source, /完成上一阶段并确认可用后继续/);
  }
});

test("screenplay main views complete the AI panel height chain", () => {
  const studio = readFileSync(new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.module.css", import.meta.url), "utf8");

  assert.match(studio, /className=\{styles\.mainView\} data-testid="main-view-document"/);
  assert.match(studio, /className=\{styles\.mainView\} data-testid="main-view-diff"/);
  assert.match(studio, /className=\{styles\.mainView\} data-testid="main-view-conversation"/);
  assert.match(css, /\.mainView\s*\{[\s\S]*display:\s*flex[\s\S]*min-height:\s*0[\s\S]*flex:\s*1[\s\S]*flex-direction:\s*column/);
});

test("screenplay composer stays visible while the transcript owns remaining height", () => {
  const css = readFileSync(new URL("../../../components/v2/screenplay-studio/ScreenplayStudio.module.css", import.meta.url), "utf8");

  assert.match(css, /\.kkTranscript\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.kkTranscript::before\s*\{[\s\S]*content:\s*""[\s\S]*margin-top:\s*auto/);
  assert.match(css, /\.kkComposer\s*\{[\s\S]*flex:\s*0 0 auto/);
  assert.match(css, /\.kkComposer \.editorTextarea\s*\{[\s\S]*height:\s*auto[\s\S]*max-height:\s*180px[\s\S]*overflow-y:\s*auto/);
});

// ============================================================
// 4. URL state: ?workId=&unitId= restores the writing location
// ============================================================

test("buildStudioUrl uses the unified production route when project identity is present", () => {
  const url = buildStudioUrl({ projectId: "p1", workId: "w1", unitId: "u1" });
  assert.equal(url, "/production?projectId=p1&workId=w1&tab=script&unitId=u1");
  assert.ok(url.includes("workId=w1"));
  assert.ok(url.includes("unitId=u1"));
  const parsed = parseStudioUrl("?workId=w1&unitId=u1");
  assert.equal(parsed.workId, "w1");
  assert.equal(parsed.unitId, "u1");
});

test("parseStudioUrl tolerates missing params and garbage input", () => {
  assert.deepEqual(parseStudioUrl(""), { workId: null, unitId: null });
  assert.deepEqual(parseStudioUrl("?foo=bar"), { workId: null, unitId: null });
  assert.deepEqual(parseStudioUrl(null), { workId: null, unitId: null });
  // repeated params → first wins (stable restore)
  assert.equal(parseStudioUrl("?workId=a&workId=b").workId, "a");
});
