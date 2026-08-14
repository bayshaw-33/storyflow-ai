/**
 * Phase 1 Task 1.4 — EvidenceManifestV2 builder determinism tests.
 *
 * Verifies (PRD Task 1.4 Step 1 RED):
 *   - Same facts → same manifestHash
 *   - Different messages/versions → different hash
 *   - File order does not affect the result
 *   - Manifest includes all versions/conversations/generations
 *   - Empty ownerId/workId/projectId rejected
 *
 * Run: node --test tests/server-v2/evidence/manifest-v2.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvidenceManifestV2,
  ManifestBuilderError,
} from "../../../lib/server/v2/evidence/manifest-v2.ts";

const NOW = new Date("2026-08-28T01:00:00.000Z");
const OWNER = "owner-001";
const PROJECT = "project-001";
const WORK = "work-001";

// ---------------------------------------------------------------------------
// Mock fetcher factory: returns predetermined rows for each table.
// ---------------------------------------------------------------------------

function makeFetcher(facts = {}) {
  const {
    versions = [],
    messages = [],
    requests = [],
    candidates = [],
    events = [],
  } = facts;
  return async (path) => {
    if (path.includes("storyflow_work_versions")) return versions;
    if (path.includes("storyflow_conversation_messages")) return messages;
    if (path.includes("storyflow_generation_request_snapshots")) return requests;
    if (path.includes("storyflow_generation_candidates")) return candidates;
    if (path.includes("storyflow_evidence_events")) return events;
    return [];
  };
}

const baseFacts = {
  versions: [
    {
      id: "v1",
      kind: "editing_draft",
      content_schema: "kiikis.script/1",
      content_hash: "a".repeat(64),
      created_at: "2026-08-28T00:00:00Z",
    },
    {
      id: "v2",
      kind: "checkpoint",
      content_schema: "kiikis.script/1",
      content_hash: "b".repeat(64),
      created_at: "2026-08-28T00:10:00Z",
    },
  ],
  messages: [
    {
      id: "m1",
      thread_id: "t1",
      role: "user",
      content: "hello",
      created_at: "2026-08-28T00:05:00Z",
    },
    {
      id: "m2",
      thread_id: "t1",
      role: "assistant",
      content: "world",
      created_at: "2026-08-28T00:06:00Z",
    },
  ],
  requests: [
    {
      id: "r1",
      base_version_id: "v1",
      message_ids: ["m1"],
      operation: "generate",
      created_at: "2026-08-28T00:07:00Z",
    },
  ],
  candidates: [
    {
      id: "c1",
      request_id: "r1",
      status: "applied",
      content_hash: "c".repeat(64),
      applied_version_id: "v2",
    },
  ],
  events: [
    { sequence_number: 1, event_hash: "e".repeat(64) },
    { sequence_number: 2, event_hash: "f".repeat(64) },
  ],
};

// ============================================================
// 1. Determinism: same facts → same manifestHash
// ============================================================

test("determinism: building twice from the same facts produces the same manifestHash", async () => {
  const fetcher = makeFetcher(baseFacts);
  const m1 = await buildEvidenceManifestV2(
    { ownerId: OWNER, projectId: PROJECT, workId: WORK, now: NOW },
    fetcher,
  );
  const m2 = await buildEvidenceManifestV2(
    { ownerId: OWNER, projectId: PROJECT, workId: WORK, now: NOW },
    fetcher,
  );
  assert.equal(m1.manifestHash, m2.manifestHash);
  assert.equal(m1.schemaVersion, "kiikis.evidence-manifest/2");
});

// ============================================================
// 2. Different messages → different hash
// ============================================================

test("different message content produces a different manifestHash", async () => {
  const factsA = makeFetcher(baseFacts);
  const factsB = makeFetcher({
    ...baseFacts,
    messages: baseFacts.messages.map((m, i) =>
      i === 0 ? { ...m, content: "changed" } : m,
    ),
  });
  const m1 = await buildEvidenceManifestV2(
    { ownerId: OWNER, projectId: PROJECT, workId: WORK, now: NOW },
    factsA,
  );
  const m2 = await buildEvidenceManifestV2(
    { ownerId: OWNER, projectId: PROJECT, workId: WORK, now: NOW },
    factsB,
  );
  assert.notEqual(m1.manifestHash, m2.manifestHash);
});

// ============================================================
// 3. Different versions → different hash
// ============================================================

test("adding a version produces a different manifestHash", async () => {
  const fetcherA = makeFetcher(baseFacts);
  const fetcherB = makeFetcher({
    ...baseFacts,
    versions: [
      ...baseFacts.versions,
      {
        id: "v3",
        kind: "finalized",
        content_schema: "kiikis.script/1",
        content_hash: "d".repeat(64),
        created_at: "2026-08-28T00:20:00Z",
      },
    ],
  });
  const m1 = await buildEvidenceManifestV2(
    { ownerId: OWNER, projectId: PROJECT, workId: WORK, now: NOW },
    fetcherA,
  );
  const m2 = await buildEvidenceManifestV2(
    { ownerId: OWNER, projectId: PROJECT, workId: WORK, now: NOW },
    fetcherB,
  );
  assert.notEqual(m1.manifestHash, m2.manifestHash);
  assert.equal(m2.versions.length, 3);
});

// ============================================================
// 4. File order does not affect the result
// ============================================================

test("file order does not affect manifestHash (versions returned in different order)", async () => {
  const reversedVersions = [...baseFacts.versions].reverse();
  const fetcherA = makeFetcher(baseFacts);
  const fetcherB = makeFetcher({ ...baseFacts, versions: reversedVersions });
  const m1 = await buildEvidenceManifestV2(
    { ownerId: OWNER, projectId: PROJECT, workId: WORK, now: NOW },
    fetcherA,
  );
  const m2 = await buildEvidenceManifestV2(
    { ownerId: OWNER, projectId: PROJECT, workId: WORK, now: NOW },
    fetcherB,
  );
  assert.equal(m1.manifestHash, m2.manifestHash);
  // Files are sorted by archivePath
  assert.deepEqual(
    m1.files.map((f) => f.archivePath),
    m2.files.map((f) => f.archivePath),
  );
});

// ============================================================
// 5. Manifest includes all entries
// ============================================================

test("manifest includes all versions, conversations, and generations", async () => {
  const fetcher = makeFetcher(baseFacts);
  const manifest = await buildEvidenceManifestV2(
    { ownerId: OWNER, projectId: PROJECT, workId: WORK, now: NOW },
    fetcher,
  );
  assert.equal(manifest.versions.length, 2);
  assert.equal(manifest.conversations.length, 2);
  assert.equal(manifest.generations.length, 1);
  assert.equal(manifest.generations[0].candidates.length, 1);
  assert.equal(manifest.files.length, 2);
  // Every file has sha256
  for (const file of manifest.files) {
    assert.ok(file.sha256.length > 0, "file.sha256 must be non-empty");
    assert.ok(file.byteSize >= 0, "file.byteSize must be non-negative");
  }
});

// ============================================================
// 6. Empty identifiers rejected
// ============================================================

test("empty ownerId is rejected", async () => {
  const fetcher = makeFetcher(baseFacts);
  await assert.rejects(
    () => buildEvidenceManifestV2({ ownerId: "", projectId: PROJECT, workId: WORK, now: NOW }, fetcher),
    (err) => err instanceof ManifestBuilderError && err.code === "validation_failed",
  );
});

test("empty workId is rejected", async () => {
  const fetcher = makeFetcher(baseFacts);
  await assert.rejects(
    () => buildEvidenceManifestV2({ ownerId: OWNER, projectId: PROJECT, workId: "", now: NOW }, fetcher),
    (err) => err instanceof ManifestBuilderError && err.code === "validation_failed",
  );
});

test("empty projectId is rejected", async () => {
  const fetcher = makeFetcher(baseFacts);
  await assert.rejects(
    () => buildEvidenceManifestV2({ ownerId: OWNER, projectId: "", workId: WORK, now: NOW }, fetcher),
    (err) => err instanceof ManifestBuilderError && err.code === "validation_failed",
  );
});

// ============================================================
// 7. Empty facts produce a valid (empty) manifest
// ============================================================

test("empty facts produce a valid manifest with zero entries", async () => {
  const fetcher = makeFetcher({});
  const manifest = await buildEvidenceManifestV2(
    { ownerId: OWNER, projectId: PROJECT, workId: WORK, now: NOW },
    fetcher,
  );
  assert.equal(manifest.versions.length, 0);
  assert.equal(manifest.conversations.length, 0);
  assert.equal(manifest.generations.length, 0);
  assert.equal(manifest.files.length, 0);
  assert.equal(manifest.highestEventSequence, 0);
  assert.equal(manifest.eventChainTip, null);
  assert.match(manifest.manifestHash, /^[0-9a-f]{64}$/);
});

// ============================================================
// 8. highestEventSequence and eventChainTip
// ============================================================

test("highestEventSequence and eventChainTip reflect the latest event", async () => {
  const fetcher = makeFetcher(baseFacts);
  const manifest = await buildEvidenceManifestV2(
    { ownerId: OWNER, projectId: PROJECT, workId: WORK, now: NOW },
    fetcher,
  );
  assert.equal(manifest.highestEventSequence, 2);
  assert.equal(manifest.eventChainTip, "f".repeat(64));
});

// ============================================================
// 9. No secret / API key / provider URL in manifest
// ============================================================

test("manifest does not contain secrets, api keys, or provider URLs", async () => {
  const fetcher = makeFetcher(baseFacts);
  const manifest = await buildEvidenceManifestV2(
    { ownerId: OWNER, projectId: PROJECT, workId: WORK, now: NOW },
    fetcher,
  );
  const serialized = JSON.stringify(manifest);
  assert.ok(!serialized.includes("api_key"), "manifest must not contain api_key");
  assert.ok(!serialized.includes("apiKey"), "manifest must not contain apiKey");
  assert.ok(!serialized.includes("secret"), "manifest must not contain secret");
  assert.ok(!serialized.includes("provider"), "manifest must not contain provider URL");
  assert.ok(!serialized.includes("bearer"), "manifest must not contain bearer token");
});
