/**
 * Phase 4 Task 4.1 — import session state machine service tests.
 *
 * Verifies server-side guard behavior on session objects (not just pure
 * transition tables): immutability after u1_ready, cancelled resurrection
 * attempts, degraded quality gates.
 *
 * Run: node --test tests/server-v2/universe-import/state-machine.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransition,
  assertTransition,
  checkModeFiles,
  nextTransition,
  requireReadyForUpload,
} from "../../../lib/server/v2/universe-import/state-machine.ts";
import { UniverseImportContractError } from "../../../lib/contracts/v2/universe-import.ts";

// ============================================================
// 1. u1_ready terminal: Source Version cannot be modified afterwards
// ============================================================

test("u1_ready forbids every write transition", () => {
  for (const to of ["upload_draft", "uploaded", "extracting", "review_required", "degraded", "ready_for_u1"]) {
    assert.equal(canTransition("u1_ready", to), false, `u1_ready → ${to} must be blocked`);
  }
  assert.throws(() => assertTransition("u1_ready", "extracting"), UniverseImportContractError);
});

// ============================================================
// 2. cancelled stays cancelled
// ============================================================

test("cancelled sessions never resume writes", () => {
  for (const to of ["uploaded", "extracting", "review_required", "ready_for_u1", "u1_ready"]) {
    assert.equal(canTransition("cancelled", to), false, `cancelled → ${to} must be blocked`);
  }
});

// ============================================================
// 3. degraded requires re-extraction, not a shortcut
// ============================================================

test("degraded can retry extraction but never jump to u1 states", () => {
  assert.equal(canTransition("degraded", "extracting"), true);
  assert.equal(canTransition("degraded", "ready_for_u1"), false);
  assert.equal(canTransition("degraded", "u1_ready"), false);
  assert.equal(canTransition("degraded", "review_required"), false);
});

// ============================================================
// 4. failed is terminal (a new session is required)
// ============================================================

test("failed is terminal", () => {
  assert.equal(canTransition("failed", "extracting"), false);
  assert.equal(canTransition("failed", "uploaded"), false);
});

// ============================================================
// 5. Gate guards on real session shapes
// ============================================================

test("requireReadyForUpload passes only with persisted files in active states", () => {
  requireReadyForUpload({ state: "review_required", files: [{ id: "f", role: "screenplay", persisted: true }] });
  // Non-extracting states don't need the guard
  requireReadyForUpload({ state: "upload_draft", files: [] });
  assert.throws(() => requireReadyForUpload({ state: "uploaded", files: [] }), UniverseImportContractError);
});

test("mode gates are re-evaluated on every nextTransition call", () => {
  const files = [{ id: "f1", role: "world_bible", persisted: true }];
  assert.equal(nextTransition("upload_draft", "bible_triplet", files), "upload_draft");
  files.push({ id: "f2", role: "character_bible", persisted: true });
  assert.equal(nextTransition("upload_draft", "bible_triplet", files), "upload_draft");
  files.push({ id: "f3", role: "plot_outline", persisted: true });
  assert.equal(nextTransition("upload_draft", "bible_triplet", files), "uploaded");
  // unpersisted member breaks the gate again
  files[2].persisted = false;
  assert.equal(nextTransition("upload_draft", "bible_triplet", files), "upload_draft");
});

test("duplicate screenplay primaries are rejected", () => {
  const result = checkModeFiles("complete_screenplay", [
    { id: "a", role: "screenplay", persisted: true },
    { id: "b", role: "screenplay", persisted: true },
  ]);
  assert.equal(result.ready, false);
  assert.match(result.reason, /exactly one/);
});
