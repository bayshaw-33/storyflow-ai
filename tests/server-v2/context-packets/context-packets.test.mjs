/**
 * Phase 2 Task 2.3 — Context Packet service tests.
 *
 * Verifies (PRD Task 2.3 Step 1-3):
 *   - Budget ranking: current scene characters prioritized over unrelated entities
 *   - Irrelevant long-text excluded when over budget
 *   - Fixed input → fixed reference order (determinism)
 *   - Each reference has reason + versionId
 *   - Empty manifest → empty references, still returns valid packet
 *   - Selection boost: selected entity gets highest relevance
 *   - Rejects empty ownerId (unauthenticated)
 *   - Rejects empty workId (validation_failed)
 *   - Rejects empty workVersionId (validation_failed)
 *   - Token budget respected: total bytes <= budget
 *   - ranking.ts unit tests: rankByRelevance, selectWithinBudget, estimateObjectByteSize
 *
 * Run: node --test tests/server-v2/context-packets/context-packets.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContextPacket,
  ContextPacketError,
} from "../../../lib/server/v2/context-packets/index.ts";
import {
  rankByRelevance,
  selectWithinBudget,
  estimateObjectByteSize,
} from "../../../lib/server/v2/context-packets/ranking.ts";

const OWNER = "owner-001";
const OTHER_USER = "owner-002";
const WORK = "work-001";
const WORK_VERSION = "wv-001";
const UNIVERSE = "universe-001";
const MANIFEST_ID = "manifest-001";

// ---------------------------------------------------------------------------
// DB row fixtures (snake_case, as returned by PostgREST)
// ---------------------------------------------------------------------------

const workVersionRow = {
  id: WORK_VERSION,
  work_id: WORK,
  content_json: {
    scenes: [
      { title: "Scene 1", characters: ["Alice"], location: "Warehouse" },
    ],
  },
  content_hash: "a".repeat(64),
};

const workRow = { id: WORK, owner_id: OWNER };
const otherWorkRow = { id: WORK, owner_id: OTHER_USER };

const manifestRow = {
  id: MANIFEST_ID,
  work_id: WORK,
  universe_id: UNIVERSE,
  universe_version_id: "version-001",
  relation: "sequel",
  timeline_anchor_id: null,
  canon_policy: "strict",
  included_entity_version_ids: ["entity-alice", "entity-bob", "entity-warehouse"],
  included_fact_version_ids: ["fact-001"],
  included_relationship_version_ids: ["rel-001"],
  included_timeline_event_version_ids: ["tl-001"],
  included_asset_version_ids: [],
  is_active: true,
  superseded_by: null,
  created_by: OWNER,
  created_at: "2026-08-14T00:00:00.000Z",
};

const entityRows = [
  { id: "entity-alice", universe_id: UNIVERSE, type: "character", name: "Alice", summary: "Protagonist", status: "canon" },
  { id: "entity-bob", universe_id: UNIVERSE, type: "character", name: "Bob", summary: "Antagonist", status: "draft" },
  { id: "entity-warehouse", universe_id: UNIVERSE, type: "location", name: "Warehouse", summary: "Dark warehouse", status: "draft" },
];

const factRows = [
  { id: "fact-001", universe_id: UNIVERSE, fact_text: "Alice wields a sword", category: "character", importance: "high", status: "canon", is_locked: true },
];

const relationshipRows = [
  { id: "rel-001", source_entity_id: "entity-alice", target_entity_id: "entity-bob", relationship_type: "rivalry", summary: "Alice vs Bob", status: "canon" },
];

const timelineRows = [
  { id: "tl-001", title: "The Duel", description: "Alice and Bob fight", date_label: "Chapter 3", related_entity_ids: ["entity-alice", "entity-bob"], status: "canon" },
];

// ---------------------------------------------------------------------------
// Mock fetcher factory: returns predetermined rows based on path needles.
// Overrides are checked in insertion order; the first match wins.
// ---------------------------------------------------------------------------

function createFetcher(overrides = {}) {
  const calls = [];
  const entries = Object.entries(overrides);
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init });
    for (const [needle, value] of entries) {
      if (path.includes(needle)) {
        return typeof value === "function" ? value(path, init) : value;
      }
    }
    return [];
  };
  fetcher.calls = calls;
  return fetcher;
}

const baseOverrides = {
  "storyflow_work_versions": [workVersionRow],
  "storyflow_works?": [workRow],
  "storyflow_work_inheritance_manifests": [manifestRow],
  "storyflow_universe_entities": entityRows,
  "storyflow_canon_facts": factRows,
  "storyflow_universe_relationships": relationshipRows,
  "storyflow_universe_timeline_events": timelineRows,
  "storyflow_v2_assets": [],
  "storyflow_work_local_states": [],
};

function makeBaseFetcher(extra = {}) {
  return createFetcher({ ...baseOverrides, ...extra });
}

const BASE_INPUT = {
  ownerId: OWNER,
  workId: WORK,
  workVersionId: WORK_VERSION,
  view: "default",
  selection: null,
  tokenBudget: 8192,
};

// ============================================================
// 1. Budget ranking: current scene characters prioritized
// ============================================================

test("current scene characters are prioritized over unrelated entities", async () => {
  const fetcher = makeBaseFetcher();
  const packet = await buildContextPacket({ ...BASE_INPUT }, fetcher);

  assert.ok(packet.references.length > 0, "should include references");

  const ids = packet.references.map((r) => r.id);
  // Alice (character, canon, in scene) should be ranked highest.
  assert.equal(ids[0], "entity-alice");
  // Warehouse (location, in scene) should come before Bob (not in scene).
  const warehouseIdx = ids.indexOf("entity-warehouse");
  const bobIdx = ids.indexOf("entity-bob");
  assert.ok(warehouseIdx < bobIdx, "Warehouse (in scene) should rank higher than Bob (not in scene)");
});

// ============================================================
// 2. Irrelevant long-text excluded when over budget
// ============================================================

test("irrelevant long-text entity is excluded when over budget", async () => {
  const largeEntity = {
    id: "entity-huge",
    universe_id: UNIVERSE,
    type: "concept",
    name: "HugeLore",
    summary: "X".repeat(5000),
    status: "draft",
  };
  const fetcher = makeBaseFetcher({
    "storyflow_universe_entities": [...entityRows, largeEntity],
    "storyflow_work_inheritance_manifests": [{
      ...manifestRow,
      included_entity_version_ids: [...manifestRow.included_entity_version_ids, "entity-huge"],
    }],
  });

  const packet = await buildContextPacket(
    { ...BASE_INPUT, tokenBudget: 500 },
    fetcher,
  );

  const ids = packet.references.map((r) => r.id);
  assert.ok(!ids.includes("entity-huge"), "large irrelevant entity must be excluded");
  // Smaller relevant objects should still be present.
  assert.ok(ids.includes("entity-alice"), "relevant entity should be included");
  // Total bytes must not exceed budget.
  assert.ok(packet.content.totalBytes <= 500, "total bytes must respect budget");
});

// ============================================================
// 3. Fixed input → fixed reference order (determinism)
// ============================================================

test("building twice from the same facts produces identical references and contentHash", async () => {
  const fetcher = makeBaseFetcher();
  const p1 = await buildContextPacket({ ...BASE_INPUT }, fetcher);
  const p2 = await buildContextPacket({ ...BASE_INPUT }, fetcher);

  assert.deepEqual(p1.references, p2.references);
  assert.equal(p1.contentHash, p2.contentHash);
  assert.equal(p1.id, p2.id);
});

test("determinism: entity fetch order does not affect reference order", async () => {
  const fetcherA = makeBaseFetcher({
    "storyflow_universe_entities": [...entityRows],
  });
  const fetcherB = makeBaseFetcher({
    "storyflow_universe_entities": [...entityRows].reverse(),
  });

  const p1 = await buildContextPacket({ ...BASE_INPUT }, fetcherA);
  const p2 = await buildContextPacket({ ...BASE_INPUT }, fetcherB);

  assert.deepEqual(p1.references, p2.references);
  assert.equal(p1.contentHash, p2.contentHash);
});

// ============================================================
// 4. Each reference has reason + versionId
// ============================================================

test("every reference has a non-empty reason and versionId", async () => {
  const fetcher = makeBaseFetcher();
  const packet = await buildContextPacket({ ...BASE_INPUT }, fetcher);

  assert.ok(packet.references.length > 0);
  for (const ref of packet.references) {
    assert.ok(typeof ref.reason === "string" && ref.reason.length > 0, "reason must be non-empty");
    assert.ok(typeof ref.versionId === "string" && ref.versionId.length > 0, "versionId must be non-empty");
    assert.ok(typeof ref.type === "string" && ref.type.length > 0, "type must be non-empty");
    assert.ok(typeof ref.id === "string" && ref.id.length > 0, "id must be non-empty");
  }
});

// ============================================================
// 5. Empty manifest → empty references, still returns valid packet
// ============================================================

test("empty manifest produces empty references but a valid packet", async () => {
  const fetcher = makeBaseFetcher({
    "storyflow_work_inheritance_manifests": [],
  });

  const packet = await buildContextPacket({ ...BASE_INPUT }, fetcher);

  assert.equal(packet.references.length, 0);
  assert.equal(packet.manifestId, null);
  assert.match(packet.contentHash, /^[0-9a-f]{64}$/);
  assert.ok(packet.id.startsWith("ctx_"));
  assert.equal(packet.content.manifestId, null);
});

// ============================================================
// 6. Selection boost: selected entity gets highest relevance
// ============================================================

test("selected entity gets the highest relevance and appears first", async () => {
  const fetcher = makeBaseFetcher();
  const packet = await buildContextPacket(
    {
      ...BASE_INPUT,
      selection: { entityType: "entity", entityId: "entity-bob" },
    },
    fetcher,
  );

  assert.ok(packet.references.length > 0);
  // Bob should be first because of the selection boost.
  assert.equal(packet.references[0].id, "entity-bob");
  assert.ok(packet.references[0].reason.includes("user-selected"));
});

test("selection boost: relationships directly related to selection are boosted", async () => {
  const fetcher = makeBaseFetcher();
  const packet = await buildContextPacket(
    {
      ...BASE_INPUT,
      selection: { entityType: "entity", entityId: "entity-alice" },
    },
    fetcher,
  );

  // Alice is selected → highest score.
  assert.equal(packet.references[0].id, "entity-alice");
  // Relationship rel-001 involves Alice → should be boosted.
  const relRef = packet.references.find((r) => r.id === "rel-001");
  assert.ok(relRef, "relationship should be included");
  assert.ok(relRef.reason.includes("directly related to selection"));
});

// ============================================================
// 7. Rejects empty ownerId (unauthenticated)
// ============================================================

test("empty ownerId is rejected with unauthenticated", async () => {
  const fetcher = makeBaseFetcher();
  await assert.rejects(
    () => buildContextPacket({ ...BASE_INPUT, ownerId: "" }, fetcher),
    (err) => err instanceof ContextPacketError && err.code === "unauthenticated",
  );
});

// ============================================================
// 8. Rejects empty workId (validation_failed)
// ============================================================

test("empty workId is rejected with validation_failed", async () => {
  const fetcher = makeBaseFetcher();
  await assert.rejects(
    () => buildContextPacket({ ...BASE_INPUT, workId: "" }, fetcher),
    (err) => err instanceof ContextPacketError && err.code === "validation_failed",
  );
});

// ============================================================
// 9. Rejects empty workVersionId (validation_failed)
// ============================================================

test("empty workVersionId is rejected with validation_failed", async () => {
  const fetcher = makeBaseFetcher();
  await assert.rejects(
    () => buildContextPacket({ ...BASE_INPUT, workVersionId: "" }, fetcher),
    (err) => err instanceof ContextPacketError && err.code === "validation_failed",
  );
});

// ============================================================
// 9b. Cross-user (forbidden)
// ============================================================

test("work owned by another user is rejected with forbidden", async () => {
  const fetcher = makeBaseFetcher({
    "storyflow_works?": [otherWorkRow],
  });
  await assert.rejects(
    () => buildContextPacket({ ...BASE_INPUT }, fetcher),
    (err) => err instanceof ContextPacketError && err.code === "forbidden",
  );
});

// ============================================================
// 9c. Work version not found
// ============================================================

test("missing work version is rejected with not_found", async () => {
  const fetcher = makeBaseFetcher({
    "storyflow_work_versions": [],
  });
  await assert.rejects(
    () => buildContextPacket({ ...BASE_INPUT }, fetcher),
    (err) => err instanceof ContextPacketError && err.code === "not_found",
  );
});

// ============================================================
// 9d. Work version belongs to a different work
// ============================================================

test("work version belonging to a different work is rejected with validation_failed", async () => {
  const fetcher = makeBaseFetcher({
    "storyflow_work_versions": [{ ...workVersionRow, work_id: "other-work" }],
  });
  await assert.rejects(
    () => buildContextPacket({ ...BASE_INPUT }, fetcher),
    (err) => err instanceof ContextPacketError && err.code === "validation_failed",
  );
});

// ============================================================
// 10. Token budget respected: total bytes <= budget
// ============================================================

test("total bytes of selected objects does not exceed the token budget", async () => {
  const fetcher = makeBaseFetcher();
  const budget = 300;
  const packet = await buildContextPacket(
    { ...BASE_INPUT, tokenBudget: budget },
    fetcher,
  );

  assert.ok(packet.content.totalBytes <= budget, `totalBytes (${packet.content.totalBytes}) must be <= budget (${budget})`);
  for (const obj of packet.content.objects) {
    assert.ok(typeof obj.payload === "object" && obj.payload !== null);
  }
});

test("zero budget selects no objects but still returns a valid packet", async () => {
  const fetcher = makeBaseFetcher();
  const packet = await buildContextPacket(
    { ...BASE_INPUT, tokenBudget: 0 },
    fetcher,
  );

  assert.equal(packet.references.length, 0);
  assert.equal(packet.content.totalBytes, 0);
  assert.match(packet.contentHash, /^[0-9a-f]{64}$/);
});

// ============================================================
// 11. ranking.ts unit tests
// ============================================================

test("rankByRelevance sorts by score descending then by id ascending", () => {
  const objs = [
    { type: "entity", id: "b", versionId: "b", relevanceScore: 50, reason: "r", content: {}, byteSize: 2 },
    { type: "entity", id: "a", versionId: "a", relevanceScore: 100, reason: "r", content: {}, byteSize: 2 },
    { type: "entity", id: "c", versionId: "c", relevanceScore: 50, reason: "r", content: {}, byteSize: 2 },
    { type: "fact", id: "d", versionId: "d", relevanceScore: 100, reason: "r", content: {}, byteSize: 2 },
  ];
  const ranked = rankByRelevance(objs);

  // Score 100: "a" and "d" — tie broken by id: "a" < "d"
  assert.equal(ranked[0].id, "a");
  assert.equal(ranked[1].id, "d");
  // Score 50: "b" and "c" — tie broken by id: "b" < "c"
  assert.equal(ranked[2].id, "b");
  assert.equal(ranked[3].id, "c");
});

test("rankByRelevance does not mutate the input array", () => {
  const objs = [
    { type: "entity", id: "b", versionId: "b", relevanceScore: 50, reason: "r", content: {}, byteSize: 2 },
    { type: "entity", id: "a", versionId: "a", relevanceScore: 100, reason: "r", content: {}, byteSize: 2 },
  ];
  const original = [...objs];
  rankByRelevance(objs);
  assert.deepEqual(objs.map((o) => o.id), original.map((o) => o.id));
});

test("rankByRelevance handles empty input", () => {
  assert.deepEqual(rankByRelevance([]), []);
});

test("selectWithinBudget stops at budget and skips objects that do not fit", () => {
  const ranked = [
    { type: "entity", id: "a", versionId: "a", relevanceScore: 100, reason: "r", content: {}, byteSize: 60 },
    { type: "entity", id: "b", versionId: "b", relevanceScore: 50, reason: "r", content: {}, byteSize: 50 },
    { type: "entity", id: "c", versionId: "c", relevanceScore: 30, reason: "r", content: {}, byteSize: 30 },
  ];
  const { selected, totalBytes } = selectWithinBudget(ranked, 100);

  // a (60) fits; b (60+50=110 > 100) skipped; c (60+30=90 <= 100) fits
  assert.equal(selected.length, 2);
  assert.equal(selected[0].id, "a");
  assert.equal(selected[1].id, "c");
  assert.equal(totalBytes, 90);
  assert.ok(totalBytes <= 100);
});

test("selectWithinBudget with zero budget selects nothing", () => {
  const ranked = [
    { type: "entity", id: "a", versionId: "a", relevanceScore: 100, reason: "r", content: {}, byteSize: 10 },
  ];
  const { selected, totalBytes } = selectWithinBudget(ranked, 0);
  assert.equal(selected.length, 0);
  assert.equal(totalBytes, 0);
});

test("selectWithinBudget with empty input returns empty selection", () => {
  const { selected, totalBytes } = selectWithinBudget([], 1000);
  assert.equal(selected.length, 0);
  assert.equal(totalBytes, 0);
});

test("estimateObjectByteSize returns a positive number", () => {
  const size = estimateObjectByteSize({ name: "Alice", type: "character" });
  assert.ok(typeof size === "number");
  assert.ok(size > 0);
});

test("estimateObjectByteSize of empty object returns at least 2", () => {
  const size = estimateObjectByteSize({});
  assert.ok(size >= 2);
});

test("estimateObjectByteSize increases with content size", () => {
  const small = estimateObjectByteSize({ name: "A" });
  const large = estimateObjectByteSize({ name: "A", summary: "X".repeat(1000) });
  assert.ok(large > small);
});
