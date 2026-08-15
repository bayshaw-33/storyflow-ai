/**
 * Phase 3 Task 3.1 — Screenplay Studio contract & document structure RED→GREEN.
 *
 * Verifies:
 *   - SCREENPLAY_UNIT_TYPES / UNIT_READINESS / DEPENDENCY_STATES enums
 *   - SCREENPLAY_DOCUMENT_V1_SCHEMA = "kiikis.screenplay/1"
 *   - assertScreenplayDocumentV1 rejects: duplicate unit ids, scene without
 *     episode parent, illegal order, cycle parents, cross-work units, wrong
 *     schemaVersion
 *   - allows creating the first scene while world/character/outline are empty
 *   - parseScreenplayDocument / orderUnits / findUnitAncestors /
 *     findDownstreamUnits structural helpers
 *   - canonical serialization of a fixed document is stable (same input →
 *     same hash, different content → different hash)
 *
 * Run: node --test tests/contracts-v22/screenplay-studio.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

import {
  SCREENPLAY_DOCUMENT_V1_SCHEMA,
  SCREENPLAY_UNIT_TYPES,
  UNIT_READINESS,
  DEPENDENCY_STATES,
  ScreenplayStudioContractError,
  assertScreenplayDocumentV1,
  isScreenplayDocumentV1,
  canonicalScreenplayDocumentJson,
} from "../../lib/contracts/v2/screenplay-studio.ts";

import {
  parseScreenplayDocument,
  orderUnits,
  findUnitAncestors,
  findDownstreamUnits,
} from "../../lib/server/v2/screenplays/document.ts";

const WORK = "work-001";
const WORK_OTHER = "work-002";

function unit(overrides = {}) {
  return {
    id: "unit-scene-001",
    type: "scene",
    parentId: "unit-ep-001",
    order: 1,
    title: "第一场",
    readiness: "draft",
    dependencyState: "current",
    currentVersionId: "uv-001",
    workId: WORK,
    ...overrides,
  };
}

function doc(units, overrides = {}) {
  return {
    schemaVersion: SCREENPLAY_DOCUMENT_V1_SCHEMA,
    workId: WORK,
    units,
    ...overrides,
  };
}

// ============================================================
// 1. Constants
// ============================================================

test("enums cover world/character/outline/episode/scene, readiness, dependency states", () => {
  assert.deepEqual([...SCREENPLAY_UNIT_TYPES], ["world", "character", "outline", "episode", "scene"]);
  assert.deepEqual([...UNIT_READINESS], ["empty", "draft", "checkpoint", "finalized"]);
  assert.deepEqual([...DEPENDENCY_STATES], ["current", "stale", "conflict"]);
  assert.equal(SCREENPLAY_DOCUMENT_V1_SCHEMA, "kiikis.screenplay/1");
});

// ============================================================
// 2. Parser rejections (RED)
// ============================================================

test("rejects duplicate unit ids", () => {
  const units = [unit(), unit({ id: "unit-scene-001", order: 2 })];
  assert.throws(() => assertScreenplayDocumentV1(doc(units)), ScreenplayStudioContractError);
});

test("rejects scene without episode parent", () => {
  const units = [unit({ parentId: null })];
  assert.throws(() => assertScreenplayDocumentV1(doc(units)), ScreenplayStudioContractError);
});

test("rejects unknown parent reference", () => {
  const units = [unit({ parentId: "unit-missing" })];
  assert.throws(() => assertScreenplayDocumentV1(doc(units)), ScreenplayStudioContractError);
});

test("rejects illegal order (negative / duplicate within same parent)", () => {
  assert.throws(
    () => assertScreenplayDocumentV1(doc([unit({ order: -1 })])),
    ScreenplayStudioContractError,
  );
  const units = [unit(), unit({ id: "unit-scene-002", order: 1, parentId: "unit-ep-001" })];
  assert.throws(() => assertScreenplayDocumentV1(doc(units)), ScreenplayStudioContractError);
});

test("rejects parent cycle", () => {
  const a = unit({ id: "a", type: "episode", parentId: "b", order: 1 });
  const b = unit({ id: "b", type: "episode", parentId: "a", order: 1 });
  const c = unit({ parentId: "a", order: 1 });
  assert.throws(() => assertScreenplayDocumentV1(doc([a, b, c])), ScreenplayStudioContractError);
});

test("rejects cross-work units", () => {
  const ep = unit({ id: "unit-ep-001", type: "episode", parentId: null, order: 1 });
  const scene = unit({ workId: WORK_OTHER });
  assert.throws(() => assertScreenplayDocumentV1(doc([ep, scene])), ScreenplayStudioContractError);
});

test("rejects wrong schemaVersion", () => {
  assert.throws(
    () => assertScreenplayDocumentV1(doc([], { schemaVersion: "kiikis.screenplay/2" })),
    ScreenplayStudioContractError,
  );
});

test("rejects illegal unit type / readiness / dependencyState", () => {
  assert.throws(
    () => assertScreenplayDocumentV1(doc([unit({ type: "novel" })])),
    ScreenplayStudioContractError,
  );
  assert.throws(
    () => assertScreenplayDocumentV1(doc([unit({ readiness: "published" })])),
    ScreenplayStudioContractError,
  );
  assert.throws(
    () => assertScreenplayDocumentV1(doc([unit({ dependencyState: "dirty" })])),
    ScreenplayStudioContractError,
  );
});

// ============================================================
// 3. Free-entry acceptance (the whole point of Phase 3)
// ============================================================

test("allows first scene while world/character/outline are empty", () => {
  const ep = unit({ id: "unit-ep-001", type: "episode", parentId: null, order: 1, title: "第1集" });
  const scene = unit();
  const document = doc([ep, scene]);
  assertScreenplayDocumentV1(document); // must not throw
  assert.equal(isScreenplayDocumentV1(document), true);
});

test("world/character/outline units may be created without parents", () => {
  const units = [
    unit({ id: "unit-world", type: "world", parentId: null, order: 1, title: "世界观" }),
    unit({ id: "unit-char", type: "character", parentId: null, order: 1, title: "主角" }),
    unit({ id: "unit-outline", type: "outline", parentId: null, order: 1, title: "总大纲" }),
    unit({ id: "unit-ep-001", type: "episode", parentId: "unit-outline", order: 1, title: "第1集" }),
    unit(),
  ];
  assertScreenplayDocumentV1(doc(units));
});

test("episode parent must be outline or null; scene parent must be episode", () => {
  // episode under scene → invalid
  const scene = unit({ id: "unit-scene-x", order: 1 });
  const epUnderScene = unit({ id: "unit-ep-x", type: "episode", parentId: "unit-scene-x", order: 1 });
  assert.throws(() => assertScreenplayDocumentV1(doc([scene, epUnderScene])), ScreenplayStudioContractError);
  // scene under outline → invalid
  const outline = unit({ id: "unit-outline", type: "outline", parentId: null, order: 1 });
  const sceneUnderOutline = unit({ id: "unit-scene-y", parentId: "unit-outline", order: 1 });
  assert.throws(() => assertScreenplayDocumentV1(doc([outline, sceneUnderOutline])), ScreenplayStudioContractError);
});

// ============================================================
// 4. Structural helpers
// ============================================================

test("orderUnits returns stable document order (type groups, then order, then id)", () => {
  const units = [
    unit({ id: "u-scene-2", type: "scene", parentId: "u-ep-1", order: 2 }),
    unit({ id: "u-world", type: "world", parentId: null, order: 1 }),
    unit({ id: "u-ep-1", type: "episode", parentId: null, order: 1 }),
    unit({ id: "u-char", type: "character", parentId: null, order: 1 }),
    unit({ id: "u-scene-1", type: "characters" === "x" ? "character" : "scene", parentId: "u-ep-1", order: 1 }),
  ];
  const ordered = orderUnits(units);
  assert.deepEqual(
    ordered.map((u) => u.id),
    ["u-world", "u-char", "u-ep-1", "u-scene-1", "u-scene-2"],
  );
});

test("findUnitAncestors walks parent chain to root", () => {
  const units = [
    unit({ id: "u-outline", type: "outline", parentId: null, order: 1 }),
    unit({ id: "u-ep-1", type: "episode", parentId: "u-outline", order: 1 }),
    unit({ id: "u-scene-1", type: "scene", parentId: "u-ep-1", order: 1 }),
  ];
  const ancestors = findUnitAncestors(units, "u-scene-1");
  assert.deepEqual(ancestors.map((u) => u.id), ["u-outline", "u-ep-1"]);
});

test("findDownstreamUnits returns direct children of a unit", () => {
  const units = [
    unit({ id: "u-ep-1", type: "episode", parentId: null, order: 1 }),
    unit({ id: "u-scene-1", type: "scene", parentId: "u-ep-1", order: 1 }),
    unit({ id: "u-scene-2", type: "scene", parentId: "u-ep-1", order: 2 }),
    unit({ id: "u-scene-other", type: "scene", parentId: "u-ep-2", order: 1 }),
    unit({ id: "u-ep-2", type: "episode", parentId: null, order: 2 }),
  ];
  const downstream = findDownstreamUnits(units, "u-ep-1");
  assert.deepEqual(
    downstream.map((u) => u.id),
    ["u-scene-1", "u-scene-2"],
  );
});

// ============================================================
// 5. Canonical JSON + content hash stability (GREEN target)
// ============================================================

test("parseScreenplayDocument returns normalized document and accepts valid input", () => {
  const ep = unit({ id: "unit-ep-001", type: "episode", parentId: null, order: 1, title: "第1集" });
  const parsed = parseScreenplayDocument(doc([ep, unit()]));
  assert.equal(parsed.workId, WORK);
  assert.equal(parsed.units.length, 2);
  // canonical json accepts the parsed doc without throwing
  const json = canonicalScreenplayDocumentJson(parsed);
  assert.equal(typeof json, "string");
  assert.ok(json.includes("unit-ep-001"));
});

test("fixed input → stable canonical json and stable content hash", () => {
  const makeUnits = () => [
    unit({ id: "u-world", type: "world", parentId: null, order: 1, title: "世界观", currentVersionId: "uv-w-1" }),
    unit({ id: "u-ep-1", type: "episode", parentId: null, order: 1, title: "第1集", currentVersionId: "uv-e-1" }),
    unit({ id: "u-scene-1", type: "scene", parentId: "u-ep-1", order: 1, title: "开场", currentVersionId: "uv-s-1" }),
  ];
  const a = parseScreenplayDocument(doc(makeUnits()));
  const b = parseScreenplayDocument(doc(makeUnits()));
  const jsonA = canonicalScreenplayDocumentJson(a);
  const jsonB = canonicalScreenplayDocumentJson(b);
  assert.equal(jsonA, jsonB);
  const hashA = createHash("sha256").update(jsonA).digest("hex");
  const hashB = createHash("sha256").update(jsonB).digest("hex");
  assert.equal(hashA, hashB);

  // different content → different hash
  const c = parseScreenplayDocument(
    doc(makeUnits().map((u) => (u.id === "u-scene-1" ? { ...u, title: "开场（改）" } : u))),
  );
  const jsonC = canonicalScreenplayDocumentJson(c);
  assert.notEqual(jsonC, jsonA);
  assert.notEqual(createHash("sha256").update(jsonC).digest("hex"), hashA);
});

test("isScreenplayDocumentV1 returns false for invalid input without throwing", () => {
  assert.equal(isScreenplayDocumentV1(null), false);
  assert.equal(isScreenplayDocumentV1({}), false);
  assert.equal(isScreenplayDocumentV1(doc([unit({ type: "novel" })])), false);
});
