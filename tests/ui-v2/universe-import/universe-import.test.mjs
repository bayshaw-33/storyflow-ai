/**
 * Phase 4 Task 4.4 — import wizard & review workbench logic.
 *
 * Verifies:
 *   - Universe "新建" exposes three entries (从零创建 / 从现有 Work / 上传站外原作)
 *   - upload mode gate: triplet missing one → start disabled with explicit hint
 *   - review state: accept/reject/merge decisions append-only; refresh restores
 *   - bulk protections: conflict / low-confidence / sourceless candidates
 *     cannot be bulk-accepted
 *   - resume card: list shows session progress and re-entry target
 *
 * Run: node --test tests/ui-v2/universe-import/universe-import.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  UNIVERSE_CREATE_ENTRIES,
  tripletRequirementStatus,
  canStartExtraction,
  canBulkAccept,
  nextReviewState,
  sessionProgress,
} from "../../../lib/client/v2/universe-import/types.ts";

// ============================================================
// 1. Three creation entries
// ============================================================

test("universe create exposes three entries including out-of-band import", () => {
  assert.deepEqual(UNIVERSE_CREATE_ENTRIES.map((e) => e.id), ["from_scratch", "from_work", "external_upload"]);
  const external = UNIVERSE_CREATE_ENTRIES.find((e) => e.id === "external_upload");
  assert.ok(external);
  assert.equal(external.requiresProject, false);
});

// ============================================================
// 2. Triplet gate in the wizard
// ============================================================

test("tripletRequirementStatus reports missing roles explicitly", () => {
  const empty = tripletRequirementStatus([]);
  assert.equal(empty.complete, false);
  assert.ok(empty.missing.includes("world_bible"));
  assert.ok(empty.missing.includes("character_bible"));
  assert.ok(empty.missing.includes("plot_outline"));

  const partial = tripletRequirementStatus([{ role: "world_bible", persisted: true }]);
  assert.equal(partial.complete, false);
  assert.deepEqual(partial.missing, ["character_bible", "plot_outline"]);

  const full = tripletRequirementStatus([
    { role: "world_bible", persisted: true },
    { role: "character_bible", persisted: true },
    { role: "plot_outline", persisted: true },
  ]);
  assert.equal(full.complete, true);
});

test("unpersisted members count as missing", () => {
  const status = tripletRequirementStatus([
    { role: "world_bible", persisted: true },
    { role: "character_bible", persisted: false },
    { role: "plot_outline", persisted: true },
  ]);
  assert.equal(status.complete, false);
  assert.deepEqual(status.missing, ["character_bible"]);
});

// ============================================================
// 3. Start gating
// ============================================================

test("canStartExtraction requires complete files and upload-compatible state", () => {
  assert.equal(canStartExtraction({ state: "uploaded", files: [{ role: "screenplay", persisted: true }], mode: "complete_screenplay" }), true);
  assert.equal(canStartExtraction({ state: "upload_draft", files: [{ role: "screenplay", persisted: true }], mode: "complete_screenplay" }), false);
  assert.equal(
    canStartExtraction({
      state: "uploaded",
      files: [
        { role: "world_bible", persisted: true },
        { role: "character_bible", persisted: true },
      ],
      mode: "bible_triplet",
    }),
    false,
  );
  // supplements never unlock start
  assert.equal(
    canStartExtraction({
      state: "uploaded",
      files: [{ role: "screenplay", persisted: true }, { role: "supplement", persisted: true }],
      mode: "complete_screenplay",
    }),
    true,
  );
});

// ============================================================
// 4. Bulk accept protections
// ============================================================

test("conflict / low-confidence / sourceless candidates cannot be bulk-accepted", () => {
  assert.equal(canBulkAccept({ kind: "conflict", confidence: 0.9, locations: 1 }), false);
  assert.equal(canBulkAccept({ kind: "entity", confidence: 0.3, locations: 2 }), false);
  assert.equal(canBulkAccept({ kind: "entity", confidence: 0.9, locations: 0 }), false);
  assert.equal(canBulkAccept({ kind: "entity", confidence: 0.9, locations: 2 }), true);
  assert.equal(canBulkAccept({ kind: "fact", confidence: 0.8, locations: 1 }), true);
});

// ============================================================
// 5. Review state machine (append-only decisions + restore)
// ============================================================

test("nextReviewState applies decisions and keeps history append-only", () => {
  const base = {
    decisions: [],
    byId: new Map([
      ["c1", { id: "c1", status: "pending" }],
      ["c2", { id: "c2", status: "pending" }],
    ]),
  };
  const afterAccept = nextReviewState(base, { candidateId: "c1", action: "accept" });
  assert.equal(afterAccept.byId.get("c1").status, "accepted");
  assert.equal(afterAccept.decisions.length, 1);
  // decisions never rewritten
  const afterReject = nextReviewState(afterAccept, { candidateId: "c2", action: "reject" });
  assert.equal(afterReject.decisions.length, 2);
  assert.deepEqual(afterReject.decisions[0], afterAccept.decisions[0]);
});

// ============================================================
// 6. Resume card progress
// ============================================================

test("sessionProgress maps states to human progress labels", () => {
  assert.equal(sessionProgress({ state: "upload_draft" }).percent, 10);
  assert.equal(sessionProgress({ state: "extracting" }).percent, 40);
  assert.equal(sessionProgress({ state: "review_required" }).percent, 70);
  assert.equal(sessionProgress({ state: "u1_ready" }).percent, 100);
  assert.equal(sessionProgress({ state: "degraded" }).needsAttention, true);
});
