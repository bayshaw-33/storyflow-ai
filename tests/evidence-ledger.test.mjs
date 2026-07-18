import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import JSZip from "jszip";

const migrationPath = new URL("../supabase/migrations/20260719000000_evidence_ledger.sql", import.meta.url);
const hardeningMigrationPath = new URL("../supabase/migrations/20260719010000_harden_evidence_ledger.sql", import.meta.url);

test("evidence ledger migration enforces append-only, scoped server writes", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.storyflow_evidence_cases/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.storyflow_evidence_events/i);
  assert.match(sql, /UNIQUE \(case_id, sequence_number\)/i);
  assert.match(sql, /UNIQUE \(case_id, idempotency_key\)/i);
  assert.match(sql, /ALTER TABLE public\.storyflow_evidence_events ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.storyflow_evidence_events FROM authenticated/i);
  assert.match(sql, /evidence_events_immutable/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.append_evidence_event/i);
  assert.match(sql, /FOR UPDATE/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.append_evidence_event[\s\S]*TO service_role/i);
  const hardeningSql = await readFile(hardeningMigrationPath, "utf8");
  assert.match(hardeningSql, /evidence_events_immutable[\s\S]*SET search_path = pg_catalog/i);
});

test("ledger accepts only allowlisted, scoped facts and detects tampering", async () => {
  const { createEvidenceLedger, computeEvidenceEventHash, verifyEvidenceChain } = await import("../lib/evidence/ledger.ts");
  const received = [];
  const ledger = createEvidenceLedger({
    async append(input) {
      received.push(input);
      const occurredAt = "2026-07-18T00:00:00.000Z";
      return {
        id: "event-1",
        case_id: "case-1",
        owner_id: input.ownerId,
        project_id: input.projectId,
        source_unit_id: input.sourceUnitId,
        sequence_number: 1,
        event_type: input.eventType,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        subject_version_id: input.subjectVersionId ?? null,
        payload: input.payload,
        object_sha256: input.objectSha256 ?? null,
        previous_event_hash: null,
        occurred_at: occurredAt,
        idempotency_key: input.idempotencyKey,
        event_hash: computeEvidenceEventHash({ ...input, sequenceNumber: 1, previousEventHash: null, occurredAt }),
      };
    },
    async list() {
      return [];
    },
  });

  const event = await ledger.record({
    ownerId: "owner-1",
    projectId: "project-1",
    sourceUnitId: "episode-1",
    eventType: "storyboard_snapshot_saved",
    subjectType: "storyboard_snapshot",
    subjectId: "snapshot-1",
    subjectVersionId: "3",
    payload: { revision: 3, sceneCount: 4 },
    idempotencyKey: "snapshot-1",
  });

  assert.equal(received.length, 1);
  assert.equal(received[0].projectId, "project-1");
  assert.equal(received[0].sourceUnitId, "episode-1");
  assert.deepEqual(verifyEvidenceChain([event]), { valid: true });
  assert.deepEqual(verifyEvidenceChain([{ ...event, payload: { revision: 4, sceneCount: 4 } }]), {
    valid: false,
    reason: "event_hash_mismatch",
    sequenceNumber: 1,
  });

  await assert.rejects(
    () => ledger.record({ ...received[0], eventType: "draft_changed" }),
    /EVIDENCE_INVALID_EVENT_TYPE/,
  );
  await assert.rejects(
    () => ledger.record({ ...received[0], payload: { providerResponse: "private" } }),
    /EVIDENCE_SENSITIVE_PAYLOAD_KEY/,
  );
});

test("evidence package is private, scoped and excludes sensitive data", async () => {
  const { materializeEvidencePackage, signEvidencePackage } = await import("../lib/evidence/package.ts");
  const { computeEvidenceEventHash } = await import("../lib/evidence/ledger.ts");
  const objects = new Map();
  const rows = [];
  const eventInput = {
    ownerId: "owner-1",
    projectId: "project-1",
    sourceUnitId: "episode-1",
    eventType: "storyboard_snapshot_saved",
    subjectType: "storyboard_snapshot",
    subjectId: "snapshot-1",
    subjectVersionId: "4",
    payload: { revision: 4, sceneCount: 2 },
    idempotencyKey: "snapshot-1",
  };
  const occurredAt = "2026-07-18T00:00:00.000Z";
  const event = {
    id: "event-1", case_id: "case-1", owner_id: "owner-1", project_id: "project-1", source_unit_id: "episode-1",
    sequence_number: 1, event_type: eventInput.eventType, subject_type: eventInput.subjectType, subject_id: eventInput.subjectId,
    subject_version_id: eventInput.subjectVersionId, payload: eventInput.payload, object_sha256: null, previous_event_hash: null,
    occurred_at: occurredAt, idempotency_key: eventInput.idempotencyKey,
    event_hash: computeEvidenceEventHash({ ...eventInput, sequenceNumber: 1, previousEventHash: null, occurredAt }),
  };
  const store = {
    async getCase() { return { id: "case-1", last_event_hash: event.event_hash }; },
    async listDocuments() { return []; },
    async getPackage(sha) { return rows.find((row) => row.package_sha256 === sha) ?? null; },
    async getPackageById(ownerId, packageId) { return rows.find((row) => row.owner_id === ownerId && row.id === packageId) ?? null; },
    async insertPackage(row) { rows.push({ id: "package-1", ...row }); return rows.at(-1); },
    async upload(path, bytes) { if (objects.has(path)) throw new Error("exists"); objects.set(path, bytes); },
    async download() { throw new Error("not used"); },
    async sign(path, ttl) { return { url: `https://example.test/${path}`, expiresIn: ttl }; },
  };

  const created = await materializeEvidencePackage({ ownerId: "owner-1", projectId: "project-1", sourceUnitId: "episode-1", events: [event] }, store);
  assert.equal(created.highest_sequence_number, 1);
  assert.match(created.storage_path, /^owner-1\/packages\/[0-9a-f]{64}\.zip$/);
  const zip = await JSZip.loadAsync(objects.get(created.storage_path));
  assert.deepEqual(Object.keys(zip.files).sort(), ["manifest.json", "timeline.json"]);
  const timeline = await zip.file("timeline.json").async("string");
  assert.doesNotMatch(timeline, /providerResponse|email|token|internal/i);
  const signed = await signEvidencePackage({ packageId: created.id, requesterId: "owner-1", store });
  assert.equal(signed.expiresIn, 300);
  await assert.rejects(() => signEvidencePackage({ packageId: created.id, requesterId: "owner-2", store }), /EVIDENCE_PACKAGE_NOT_FOUND/);
});

test("authoritative hooks only form scoped, server-derived evidence facts", async () => {
  const { completedGenerationEvidenceEvent, exportEvidenceEvent, snapshotEvidenceEvent, storyboardSaveEvidenceEvent } = await import("../lib/evidence/hooks.ts");
  const snapshot = snapshotEvidenceEvent({
    ownerId: "owner-1", projectId: "project-1", sourceUnitId: "episode-1", snapshotId: "snapshot-1",
    revision: 5, reason: "manual", sceneCount: 3,
  });
  assert.deepEqual(snapshot.payload, { revision: 5, reason: "manual", sceneCount: 3 });
  assert.equal(snapshot.idempotencyKey, "snapshot:snapshot-1");
  const generation = completedGenerationEvidenceEvent({
    ownerId: "owner-1", projectId: "project-1", sourceUnitId: "episode-1", jobId: "job-1", jobType: "video",
    targetId: "shot-1", provider: "atlas", durationSeconds: 5,
  });
  assert.equal(generation.payload.prompt, undefined);
  assert.equal(generation.idempotencyKey, "generation:job-1");
  const exported = exportEvidenceEvent({
    ownerId: "owner-1", projectId: "project-1", sourceUnitId: "episode-1", exportId: "export-1",
    exportType: "json", contentId: "cid_1", metadataHash: "a".repeat(64),
  });
  assert.equal(exported.objectSha256, "a".repeat(64));
  assert.equal(exported.payload.storagePath, undefined);

  const saved = storyboardSaveEvidenceEvent({
    ownerId: "owner-1", projectId: "project-1", sourceUnitId: "episode-1", revision: 6, sceneCount: 4,
  });
  assert.equal(saved.subjectType, "storyboard_state");
  assert.equal(saved.subjectVersionId, "6");
  assert.equal(saved.idempotencyKey, "storyboard-state:project-1:episode-1:6");
  assert.deepEqual(saved.payload, { revision: 6, sceneCount: 4 });
});

test("normal storyboard save route records the authoritative saved revision", async () => {
  const route = await readFile(new URL("../app/api/storyboard/state/route.ts", import.meta.url), "utf8");
  assert.match(route, /const state = await saveStoryboardState[\s\S]*storyboardSaveEvidenceEvent\(\{[\s\S]*revision: state\.revision/);
  assert.doesNotMatch(route, /revision:\s*body\.expectedRevision/);
});

test("evidence ledger defaults on after rollout and supports an explicit kill switch", async () => {
  const { isEvidenceLedgerEnabled } = await import("../lib/evidence/feature-flags.ts");
  assert.equal(isEvidenceLedgerEnabled({}), true);
  assert.equal(isEvidenceLedgerEnabled({ EVIDENCE_LEDGER_ENABLED: "false" }), false);
  assert.equal(isEvidenceLedgerEnabled({ EVIDENCE_LEDGER_ENABLED: "1" }), true);
  assert.equal(isEvidenceLedgerEnabled({ EVIDENCE_LEDGER_ENABLED: "TRUE" }), true);
});
