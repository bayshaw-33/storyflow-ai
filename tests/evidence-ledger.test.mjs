import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/20260719000000_evidence_ledger.sql", import.meta.url);

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
