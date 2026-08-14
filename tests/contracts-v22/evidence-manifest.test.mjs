/**
 * Phase 1 Task 1.1 — EvidenceManifestV2 contracts RED→GREEN.
 *
 * Verifies:
 *   - schemaVersion = "kiikis.evidence-manifest/2"
 *   - Manifest file missing sha256 is rejected
 *   - Missing manifestHash rejected
 *   - Invalid schemaVersion rejected
 *   - Empty ownerId/projectId/workId rejected
 *   - isEvidenceManifestV2 returns false for invalid without throwing
 *
 * Run: node --test tests/contracts-v22/evidence-manifest.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  EVIDENCE_MANIFEST_V2_SCHEMA,
  EvidenceManifestV2Error,
  assertEvidenceManifestV2,
  isEvidenceManifestV2,
} from "../../lib/contracts/v2/evidence-manifest-v2.ts";

// ============================================================
// 1. Schema constant
// ============================================================

test("EVIDENCE_MANIFEST_V2_SCHEMA = kiikis.evidence-manifest/2", () => {
  assert.equal(EVIDENCE_MANIFEST_V2_SCHEMA, "kiikis.evidence-manifest/2");
});

// ============================================================
// 2. Valid manifest
// ============================================================

function makeValidManifest(overrides = {}) {
  return {
    schemaVersion: EVIDENCE_MANIFEST_V2_SCHEMA,
    contractVersion: "2.2.0-alpha.1",
    ownerId: "user-001",
    projectId: "proj-001",
    workId: "work-001",
    highestEventSequence: 5,
    eventChainTip: "c".repeat(64),
    versions: [
      {
        workVersionId: "ver-001",
        kind: "checkpoint",
        contentSchema: "kiikis.script/1",
        contentHash: "a".repeat(64),
        createdAt: "2026-08-14T10:00:00+08:00",
      },
    ],
    conversations: [
      {
        messageId: "msg-001",
        threadId: "thread-001",
        role: "user",
        contentHash: "d".repeat(64),
        createdAt: "2026-08-14T09:00:00+08:00",
      },
    ],
    generations: [],
    files: [
      {
        archivePath: "versions/v1/content.json",
        fileName: "content.json",
        sha256: "e".repeat(64),
        byteSize: 1024,
        contentType: "application/json",
      },
    ],
    manifestHash: "f".repeat(64),
    createdAt: "2026-08-14T12:00:00+08:00",
    ...overrides,
  };
}

test("assertEvidenceManifestV2: valid manifest accepted", () => {
  assert.doesNotThrow(() => assertEvidenceManifestV2(makeValidManifest()));
});

test("assertEvidenceManifestV2: empty manifest (no files) accepted", () => {
  assert.doesNotThrow(() =>
    assertEvidenceManifestV2(makeValidManifest({ files: [] })),
  );
});

// ============================================================
// 3. Schema version rejection
// ============================================================

test("assertEvidenceManifestV2: rejects wrong schemaVersion (V1)", () => {
  assert.throws(
    () => assertEvidenceManifestV2(makeValidManifest({ schemaVersion: "kiikis.evidence-package/1" })),
    /schemaVersion must be kiikis.evidence-manifest\/2/,
  );
});

test("assertEvidenceManifestV2: rejects arbitrary schemaVersion", () => {
  assert.throws(
    () => assertEvidenceManifestV2(makeValidManifest({ schemaVersion: "kiikis.evidence-manifest/3" })),
    /schemaVersion must be/,
  );
});

// ============================================================
// 4. File sha256 requirement (PRD RED)
// ============================================================

test("assertEvidenceManifestV2: rejects file missing sha256", () => {
  const m = makeValidManifest({
    files: [
      {
        archivePath: "v1.json",
        fileName: "v1.json",
        sha256: "",
        byteSize: 100,
        contentType: "application/json",
      },
    ],
  });
  assert.throws(
    () => assertEvidenceManifestV2(m),
    /file.sha256 is required/,
  );
});

test("assertEvidenceManifestV2: rejects file missing archivePath", () => {
  const m = makeValidManifest({
    files: [
      {
        archivePath: "",
        fileName: "v1.json",
        sha256: "e".repeat(64),
        byteSize: 100,
        contentType: "application/json",
      },
    ],
  });
  assert.throws(
    () => assertEvidenceManifestV2(m),
    /file.archivePath is required/,
  );
});

test("assertEvidenceManifestV2: rejects file with negative byteSize", () => {
  const m = makeValidManifest({
    files: [
      {
        archivePath: "v1.json",
        fileName: "v1.json",
        sha256: "e".repeat(64),
        byteSize: -1,
        contentType: "application/json",
      },
    ],
  });
  assert.throws(
    () => assertEvidenceManifestV2(m),
    /file.byteSize must be non-negative/,
  );
});

// ============================================================
// 5. Required field rejections
// ============================================================

test("assertEvidenceManifestV2: rejects empty ownerId", () => {
  assert.throws(
    () => assertEvidenceManifestV2(makeValidManifest({ ownerId: "" })),
    /ownerId must be non-empty/,
  );
});

test("assertEvidenceManifestV2: rejects empty projectId", () => {
  assert.throws(
    () => assertEvidenceManifestV2(makeValidManifest({ projectId: "" })),
    /projectId must be non-empty/,
  );
});

test("assertEvidenceManifestV2: rejects empty workId", () => {
  assert.throws(
    () => assertEvidenceManifestV2(makeValidManifest({ workId: "" })),
    /workId must be non-empty/,
  );
});

test("assertEvidenceManifestV2: rejects missing manifestHash", () => {
  assert.throws(
    () => assertEvidenceManifestV2(makeValidManifest({ manifestHash: "" })),
    /manifestHash must be non-empty/,
  );
});

test("assertEvidenceManifestV2: rejects invalid createdAt", () => {
  assert.throws(
    () => assertEvidenceManifestV2(makeValidManifest({ createdAt: "not-a-date" })),
    /createdAt must be a valid ISO string/,
  );
});

test("assertEvidenceManifestV2: rejects negative highestEventSequence", () => {
  assert.throws(
    () => assertEvidenceManifestV2(makeValidManifest({ highestEventSequence: -1 })),
    /highestEventSequence must be a non-negative number/,
  );
});

// ============================================================
// 6. isEvidenceManifestV2 type guard
// ============================================================

test("isEvidenceManifestV2: returns false for invalid without throwing", () => {
  assert.equal(isEvidenceManifestV2(null), false);
  assert.equal(isEvidenceManifestV2({}), false);
  assert.equal(isEvidenceManifestV2(makeValidManifest({ schemaVersion: "wrong" })), false);
  assert.equal(
    isEvidenceManifestV2(makeValidManifest({ files: [{ sha256: "" }] })),
    false,
  );
});

test("isEvidenceManifestV2: returns true for valid manifest", () => {
  assert.equal(isEvidenceManifestV2(makeValidManifest()), true);
});

// ============================================================
// 7. Error class
// ============================================================

test("EvidenceManifestV2Error: code and field preserved", () => {
  const err = new EvidenceManifestV2Error("validation_failed", "bad", "files.sha256");
  assert.equal(err.name, "EvidenceManifestV2Error");
  assert.equal(err.code, "validation_failed");
  assert.equal(err.field, "files.sha256");
});

test("EvidenceManifestV2Error: determinism_violation code supported", () => {
  const err = new EvidenceManifestV2Error("determinism_violation", "hash mismatch");
  assert.equal(err.code, "determinism_violation");
});
