/**
 * Phase 4 Task 4.3 — extraction & candidate merge.
 *
 * Verifies:
 *   - extraction produces entity/fact/relationship/timeline_event/conflict
 *     candidates, each with ≥1 SourceLocation
 *   - duplicate candidates merge (keep one, union locations & merged_from)
 *   - retry by chunk idempotency key does not duplicate candidates
 *   - quality gates: coverage < threshold, empty required kinds, or
 *     unparseable model output → degraded with reason (never silent)
 *
 * Run: node --test tests/server-v2/universe-import/extraction.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  extractCandidatesFromChunk,
  mergeCandidates,
  assessQuality,
} from "../../../lib/server/v2/universe-import/extraction.ts";

const HASH = "a".repeat(64);

function chunk(index, content, startOffset) {
  return {
    id: `chunk-${index}`,
    fileId: "file-001",
    chunkIndex: index,
    content,
    startOffset,
    endOffset: startOffset + content.length,
    page: index + 1,
  };
}

function fakeModelOutput(chunk) {
  // deterministic pseudo-extraction for tests
  const names = [...chunk.content.matchAll(/阿仁|苏九|陆远/g)].map((m) => m[0]);
  const unique = [...new Set(names)];
  return {
    entities: unique.map((name) => ({ name, type: "character" })),
    facts: [{ statement: `${chunk.id} 的关键事实` }],
    relationships: unique.length >= 2 ? [{ from: unique[0], to: unique[1], relation: "同伴" }] : [],
    timeline_events: [{ episode: 1, event: `${chunk.id} 时间点` }],
    conflicts: [],
  };
}

// ============================================================
// 1. Candidate shape with source locations
// ============================================================

test("extraction yields candidates each carrying ≥1 source location", () => {
  const c = chunk(0, "阿仁与苏九在废墟中相遇。", 0);
  const candidates = extractCandidatesFromChunk(c, fakeModelOutput(c), HASH);
  assert.ok(candidates.length > 0);
  for (const cand of candidates) {
    assert.ok(["entity", "fact", "relationship", "timeline_event", "conflict"].includes(cand.kind));
    assert.ok(cand.locations.length >= 1);
    const loc = cand.locations[0];
    assert.equal(loc.fileId, "file-001");
    assert.equal(loc.sourceHash, HASH);
    assert.ok(typeof loc.startOffset === "number" && typeof loc.endOffset === "number");
  }
});

// ============================================================
// 2. Merge duplicates, keep all sources
// ============================================================

test("duplicate entities merge into one candidate with unioned locations", () => {
  const c1 = chunk(0, "阿仁出场。", 0);
  const c2 = chunk(1, "阿仁再次出场。", 100);
  const a = extractCandidatesFromChunk(c1, fakeModelOutput(c1), HASH);
  const b = extractCandidatesFromChunk(c2, fakeModelOutput(c2), HASH);
  const merged = mergeCandidates([...a, ...b]);
  const aren = merged.find((c) => c.kind === "entity" && c.payload.name === "阿仁");
  assert.ok(aren, "merged 阿仁 exists");
  assert.equal(aren.locations.length, 2, "both source locations kept");
  assert.ok(aren.mergedFrom.length >= 1, "merge provenance recorded");
  // no duplicate entity candidates remain
  const dupEntities = merged.filter((c) => c.kind === "entity" && c.payload.name === "阿仁");
  assert.equal(dupEntities.length, 1);
});

// ============================================================
// 3. Retry idempotency
// ============================================================

test("re-extracting the same chunk produces the same idempotency keys", () => {
  const c = chunk(0, "阿仁出场。苏九跟随。", 0);
  const first = extractCandidatesFromChunk(c, fakeModelOutput(c), HASH);
  const second = extractCandidatesFromChunk(c, fakeModelOutput(c), HASH);
  assert.deepEqual(first.map((x) => x.idempotencyKey).sort(), second.map((x) => x.idempotencyKey).sort());
});

// ============================================================
// 4. Quality gates
// ============================================================

test("quality gate flags: missing tail coverage, empty kinds, unparseable output", () => {
  // good case
  const ok = assessQuality({
    totalChunks: 10,
    coveredChunks: 10,
    candidatesByKind: { entity: 5, fact: 3, relationship: 2, timeline_event: 2, conflict: 0 },
  });
  assert.equal(ok.passed, true);

  // tail missing
  const tail = assessQuality({
    totalChunks: 10,
    coveredChunks: 7, // last 3 chunks uncovered
    candidatesByKind: { entity: 5, fact: 3, relationship: 2, timeline_event: 2, conflict: 0 },
  });
  assert.equal(tail.passed, false);
  assert.match(tail.reason, /覆盖|coverage/i);

  // empty required kinds
  const emptyKinds = assessQuality({
    totalChunks: 10,
    coveredChunks: 10,
    candidatesByKind: { entity: 0, fact: 3, relationship: 0, timeline_event: 2, conflict: 0 },
  });
  assert.equal(emptyKinds.passed, false);
  assert.match(emptyKinds.reason, /entity|relationship/);
});

test("unparseable model output raises a typed error, not silent success", async () => {
  const c = chunk(0, "文本", 0);
  assert.throws(
    () => extractCandidatesFromChunk(c, "not-an-object", HASH),
    /无法解析|unparseable/i,
  );
});
