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

// ============================================================
// 4. URL state: ?workId=&unitId= restores the writing location
// ============================================================

test("buildStudioUrl/parseStudioUrl round-trip workId + unitId", () => {
  const url = buildStudioUrl({ workId: "w1", unitId: "u1" });
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
