/**
 * Phase 4 Task 4.1 — Universe import contracts & state machine.
 *
 * Verifies:
 *   - ImportMode / ImportState / SourceRole enums
 *   - SourceLocation shape (fileId + offsets + sourceHash required)
 *   - assertImportSessionV1 rejects: illegal transitions, missing files
 *     before extracting, degraded→u1_ready, mutation after u1_ready,
 *     cancelled session resurrection
 *   - Gate rules: complete_screenplay needs exactly one screenplay file;
 *     bible_triplet needs world_bible + character_bible + plot_outline
 *     (missing one → can only stay upload_draft)
 *   - Format rules: primary files PDF/DOCX/DOC/MD/TXT only; JSON/HTML/CSV/XLSX
 *     only as supplement
 *
 * Run: node --test tests/contracts-v22/universe-import.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  IMPORT_MODES,
  IMPORT_STATES,
  SOURCE_ROLES,
  PRIMARY_FILE_EXTENSIONS,
  SUPPLEMENT_EXTENSIONS,
  UNIVERSE_IMPORT_SESSION_V1_SCHEMA,
  UniverseImportContractError,
  assertSourceLocation,
  isPrimaryExtension,
  isSupplementExtension,
  roleForFilename,
} from "../../lib/contracts/v2/universe-import.ts";

import {
  canTransition,
  requireReadyForUpload,
  checkModeFiles,
  nextTransition,
} from "../../lib/server/v2/universe-import/state-machine.ts";

function loc(overrides = {}) {
  return {
    fileId: "file-001",
    startOffset: 0,
    endOffset: 120,
    sourceHash: "a".repeat(64),
    ...overrides,
  };
}

// ============================================================
// 1. Enums & constants
// ============================================================

test("import enums match the PRD", () => {
  assert.deepEqual([...IMPORT_MODES], ["complete_screenplay", "bible_triplet"]);
  assert.deepEqual([...IMPORT_STATES], [
    "upload_draft", "uploaded", "extracting", "review_required",
    "degraded", "ready_for_u1", "u1_ready", "failed", "cancelled",
  ]);
  assert.deepEqual([...SOURCE_ROLES], ["screenplay", "world_bible", "character_bible", "plot_outline", "supplement"]);
  assert.equal(UNIVERSE_IMPORT_SESSION_V1_SCHEMA, "kiikis.universe-import/1");
});

// ============================================================
// 2. SourceLocation validation
// ============================================================

test("source location requires fileId, offsets, sourceHash", () => {
  assertSourceLocation(loc()); // ok
  assert.throws(() => assertSourceLocation(loc({ fileId: "" })), UniverseImportContractError);
  assert.throws(() => assertSourceLocation(loc({ sourceHash: "short" })), UniverseImportContractError);
  assert.throws(() => assertSourceLocation({ startOffset: 10, endOffset: 5, fileId: "f", sourceHash: "a".repeat(64) }), UniverseImportContractError);
});

// ============================================================
// 3. Format rules
// ============================================================

test("primary formats are PDF/DOCX/DOC/MD/TXT; others are supplement-only", () => {
  for (const ext of [".pdf", ".docx", ".doc", ".md", ".txt"]) {
    assert.equal(isPrimaryExtension(ext), true, `${ext} should be primary`);
  }
  for (const ext of [".json", ".html", ".csv", ".xlsx"]) {
    assert.equal(isPrimaryExtension(ext), false, `${ext} must not be primary`);
    assert.equal(isSupplementExtension(ext), true, `${ext} is supplement`);
  }
  assert.equal(isPrimaryExtension(".exe"), false);
  assert.equal(isSupplementExtension(".exe"), false);
});

test("roleForFilename maps declarations to roles with extension checks", () => {
  assert.equal(roleForFilename("剧本.pdf", "screenplay"), "screenplay");
  assert.equal(roleForFilename("设定.json", "supplement"), "supplement");
  // JSON can never be a primary role
  assert.throws(() => roleForFilename("剧本.json", "screenplay"), UniverseImportContractError);
});

// ============================================================
// 4. State machine transitions
// ============================================================

test("legal transition chain upload_draft→…→u1_ready", () => {
  assert.equal(canTransition("upload_draft", "uploaded"), true);
  assert.equal(canTransition("uploaded", "extracting"), true);
  assert.equal(canTransition("extracting", "review_required"), true);
  assert.equal(canTransition("review_required", "ready_for_u1"), true);
  assert.equal(canTransition("ready_for_u1", "u1_ready"), true);
});

test("illegal transitions are rejected", () => {
  // no files → cannot extract
  assert.equal(canTransition("upload_draft", "extracting"), false);
  // degraded cannot jump to u1_ready
  assert.equal(canTransition("degraded", "u1_ready"), false);
  // cancelled is terminal for writes
  assert.equal(canTransition("cancelled", "extracting"), false);
  assert.equal(canTransition("cancelled", "uploaded"), false);
  // u1_ready is terminal (Source Version immutable)
  assert.equal(canTransition("u1_ready", "extracting"), false);
  assert.equal(canTransition("u1_ready", "uploaded"), false);
});

test("requireReadyForUpload blocks extracting without persisted files", () => {
  assert.throws(
    () => requireReadyForUpload({ state: "extracting", files: [] }),
    UniverseImportContractError,
  );
  const withFile = { state: "extracting", files: [{ id: "f1", persisted: true }] };
  requireReadyForUpload(withFile); // ok
  assert.throws(
    () => requireReadyForUpload({ state: "extracting", files: [{ id: "f1", persisted: false }] }),
    UniverseImportContractError,
  );
});

// ============================================================
// 5. Mode file gates
// ============================================================

test("complete_screenplay requires exactly one screenplay primary file", () => {
  const ok = checkModeFiles("complete_screenplay", [{ role: "screenplay", persisted: true }]);
  assert.equal(ok.ready, true);
  const none = checkModeFiles("complete_screenplay", [{ role: "world_bible", persisted: true }]);
  assert.equal(none.ready, false);
  assert.match(none.reason, /screenplay/);
  const dup = checkModeFiles("complete_screenplay", [
    { role: "screenplay", persisted: true },
    { role: "screenplay", persisted: true },
  ]);
  assert.equal(dup.ready, false);
});

test("bible_triplet requires all three roles; missing one keeps upload_draft", () => {
  const full = checkModeFiles("bible_triplet", [
    { role: "world_bible", persisted: true },
    { role: "character_bible", persisted: true },
    { role: "plot_outline", persisted: true },
  ]);
  assert.equal(full.ready, true);
  const missing = checkModeFiles("bible_triplet", [
    { role: "world_bible", persisted: true },
    { role: "character_bible", persisted: true },
    // plot_outline missing
  ]);
  assert.equal(missing.ready, false);
  assert.match(missing.reason, /plot_outline/);
  // partial triplet can only be saved as upload_draft
  const partialFiles = [
    { role: "world_bible", persisted: true },
    { role: "character_bible", persisted: true },
  ];
  const next = nextTransition("upload_draft", "bible_triplet", partialFiles);
  assert.equal(next, "upload_draft");
});

test("supplements never satisfy mode requirements", () => {
  const result = checkModeFiles("bible_triplet", [
    { role: "world_bible", persisted: true },
    { role: "character_bible", persisted: true },
    { role: "supplement", persisted: true },
  ]);
  assert.equal(result.ready, false);
});
