/**
 * Phase 2 Task 2.1 — Universe read service + version hash integration tests.
 *
 * Verifies that the existing V2 universe read service remains backward
 * compatible, and that Canon objects can be derived from DB rows to compute
 * a deterministic Universe Version content hash.
 *
 * Run: node --test tests/server-v2/universe-read/universe-read.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  toUniverseDto,
  V2UniverseError,
} from "../../../lib/server/v2/universe/index.ts";
import {
  computeUniverseVersionContentHash,
} from "../../../lib/contracts/v2/universe-inheritance-v22-hash.ts";

// ---------------------------------------------------------------------------
// Fixtures: DB rows
// ---------------------------------------------------------------------------

const UNIVERSE_ROW = {
  id: "uni-001",
  name: "Test Universe",
  description: "A test universe",
  card_summary: "Test summary",
  status: "active",
  updated_at: "2026-08-14T00:00:00Z",
  user_id: "user-001",
  team_id: null,
  metadata: { tags: ["test"] },
  genre: "drama",
};

const ENTITY_ROWS = [
  { id: "ent-001", universe_id: "uni-001", type: "character", name: "Alice", summary: "Protagonist", status: "canon", updated_at: "2026-08-01T00:00:00Z" },
  { id: "ent-002", universe_id: "uni-001", type: "character", name: "Bob", summary: "Antagonist", status: "canon", updated_at: "2026-08-02T00:00:00Z" },
  { id: "ent-003", universe_id: "uni-001", type: "location", name: "Castle", summary: "Main location", status: "draft", updated_at: "2026-08-03T00:00:00Z" },
];

// ---------------------------------------------------------------------------
// Helper: convert DB entity rows to CanonObjectInput (strips updatedAt)
// ---------------------------------------------------------------------------

function entityRowsToCanonObjects(rows) {
  return rows.map((r) => ({
    type: "entity",
    id: r.id,
    versionId: `${r.id}-v1`,
    content: {
      name: r.name,
      kind: r.type,
      summary: r.summary,
      status: r.status,
      // updatedAt is intentionally excluded — content hash must be stable
    },
  }));
}

// ============================================================
// 1. Backward compat: toUniverseDto still works
// ============================================================

test("toUniverseDto: maps DB row to DTO (backward compat)", () => {
  const dto = toUniverseDto(UNIVERSE_ROW);
  assert.equal(dto.id, "uni-001");
  assert.equal(dto.name, "Test Universe");
  assert.equal(dto.status, "draft"); // non-archived → draft
  assert.equal(dto.visibility, "private"); // no team_id
  assert.equal(dto.currentVersion, "legacy");
});

test("toUniverseDto: archived status maps to deprecated", () => {
  const dto = toUniverseDto({ ...UNIVERSE_ROW, status: "archived" });
  assert.equal(dto.status, "deprecated");
});

test("toUniverseDto: team_id maps to team visibility", () => {
  const dto = toUniverseDto({ ...UNIVERSE_ROW, team_id: "team-001" });
  assert.equal(dto.visibility, "team");
});

test("V2UniverseError: has correct code and message", () => {
  const err = new V2UniverseError("not_found", "Universe not found.");
  assert.equal(err.code, "not_found");
  assert.match(err.message, /not_found/);
  assert.match(err.message, /Universe not found/);
});

// ============================================================
// 2. Entity rows → Canon objects → content hash
// ============================================================

test("entityRowsToCanonObjects: produces valid CanonObjectInput", () => {
  const objects = entityRowsToCanonObjects(ENTITY_ROWS);
  assert.equal(objects.length, 3);
  for (const obj of objects) {
    assert.equal(obj.type, "entity");
    assert.ok(obj.id);
    assert.ok(obj.versionId);
    assert.ok(obj.content);
    assert.equal("updatedAt" in obj.content, false);
  }
});

test("content hash: deterministic from same entity rows", () => {
  const objects1 = entityRowsToCanonObjects(ENTITY_ROWS);
  const objects2 = entityRowsToCanonObjects(ENTITY_ROWS);
  const hash1 = computeUniverseVersionContentHash(objects1);
  const hash2 = computeUniverseVersionContentHash(objects2);
  assert.equal(hash1, hash2);
  assert.match(hash1, /^[0-9a-f]{64}$/);
});

test("content hash: changes when entity content changes", () => {
  const objects1 = entityRowsToCanonObjects(ENTITY_ROWS);
  const hash1 = computeUniverseVersionContentHash(objects1);

  // Modify an entity's content (not updatedAt, which is already stripped)
  const modifiedRows = ENTITY_ROWS.map((r) =>
    r.id === "ent-001" ? { ...r, name: "Alice Updated" } : r
  );
  const objects2 = entityRowsToCanonObjects(modifiedRows);
  const hash2 = computeUniverseVersionContentHash(objects2);

  assert.notEqual(hash1, hash2);
});

test("content hash: stable when only updatedAt changes", () => {
  const objects1 = entityRowsToCanonObjects(ENTITY_ROWS);
  const hash1 = computeUniverseVersionContentHash(objects1);

  // Change only updatedAt — should not affect hash since it's stripped
  const laterRows = ENTITY_ROWS.map((r) => ({
    ...r,
    updated_at: "2026-12-31T23:59:59Z",
  }));
  const objects2 = entityRowsToCanonObjects(laterRows);
  const hash2 = computeUniverseVersionContentHash(objects2);

  assert.equal(hash1, hash2);
});

test("content hash: changes when entity is added", () => {
  const objects1 = entityRowsToCanonObjects(ENTITY_ROWS);
  const hash1 = computeUniverseVersionContentHash(objects1);

  const newEntity = {
    id: "ent-004",
    universe_id: "uni-001",
    type: "character",
    name: "Charlie",
    summary: "New character",
    status: "draft",
    updated_at: "2026-08-04T00:00:00Z",
  };
  const objects2 = entityRowsToCanonObjects([...ENTITY_ROWS, newEntity]);
  const hash2 = computeUniverseVersionContentHash(objects2);

  assert.notEqual(hash1, hash2);
});

test("content hash: empty entity set produces valid hash", () => {
  const hash = computeUniverseVersionContentHash([]);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

// ============================================================
// 3. Cross-universe object rejection (via contract parser)
// ============================================================

test("CanonObjectInput with unknown type is rejected", () => {
  assert.throws(
    () =>
      computeUniverseVersionContentHash([
        { type: "unknown_type", id: "x", versionId: "v1", content: {} },
      ]),
    (err) => err instanceof Error && /Unsupported object type/.test(err.message),
  );
});
