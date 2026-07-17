import { createHash } from "node:crypto";

import { canonicalJson } from "../compliance/manifest.ts";
import type { EvidenceEventInput, EvidenceEventRow, EvidenceEventType, EvidenceScope } from "./types.ts";
import { EVIDENCE_EVENT_TYPES } from "./types.ts";

export interface EvidenceLedgerClient {
  append(input: EvidenceEventInput): Promise<EvidenceEventRow>;
  list(scope: EvidenceScope): Promise<EvidenceEventRow[]>;
}

export type EvidenceHashInput = EvidenceEventInput & {
  sequenceNumber: number;
  previousEventHash: string | null;
  occurredAt: string;
};

const SHA256_HEX = /^[0-9a-f]{64}$/;
const SENSITIVE_KEY = /(email|path|url|secret|token|prompt|embedding|biometric|providerresponse)/i;

function assertNonEmpty(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
}

function assertSafePayload(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertSafePayload(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) throw new Error("EVIDENCE_SENSITIVE_PAYLOAD_KEY");
    assertSafePayload(item);
  }
}

export function assertEvidenceEventInput(input: EvidenceEventInput): void {
  assertNonEmpty(input.ownerId, "EVIDENCE_INVALID_OWNER");
  assertNonEmpty(input.projectId, "EVIDENCE_INVALID_PROJECT");
  assertNonEmpty(input.sourceUnitId, "EVIDENCE_INVALID_SOURCE_UNIT");
  assertNonEmpty(input.subjectType, "EVIDENCE_INVALID_SUBJECT_TYPE");
  assertNonEmpty(input.subjectId, "EVIDENCE_INVALID_SUBJECT_ID");
  assertNonEmpty(input.idempotencyKey, "EVIDENCE_INVALID_IDEMPOTENCY_KEY");
  if (!(EVIDENCE_EVENT_TYPES as readonly string[]).includes(input.eventType)) throw new Error("EVIDENCE_INVALID_EVENT_TYPE");
  if (!input.payload || typeof input.payload !== "object" || Array.isArray(input.payload)) throw new Error("EVIDENCE_INVALID_PAYLOAD");
  assertSafePayload(input.payload);
  if (input.objectSha256 && !SHA256_HEX.test(input.objectSha256)) throw new Error("EVIDENCE_INVALID_OBJECT_HASH");
}

function postgresJsonbText(value: unknown): string {
  const source = canonicalJson(value);
  let quoted = false;
  let escaped = false;
  let output = "";
  for (const character of source) {
    if (quoted) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      output += character;
    } else if (character === ":" || character === ",") {
      output += `${character} `;
    } else {
      output += character;
    }
  }
  return output;
}

export function computeEvidenceEventHash(input: EvidenceHashInput): string {
  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) throw new Error("EVIDENCE_INVALID_OCCURRED_AT");
  const material = [
    input.previousEventHash ?? "",
    String(input.sequenceNumber),
    input.eventType,
    input.subjectType,
    input.subjectId,
    input.subjectVersionId ?? "",
    postgresJsonbText(input.payload),
    input.objectSha256 ?? "",
    occurredAt.toISOString(),
  ].join("|");
  return createHash("sha256").update(material, "utf8").digest("hex");
}

export function verifyEvidenceChain(events: EvidenceEventRow[]):
  | { valid: true }
  | { valid: false; reason: "sequence_gap" | "previous_hash_mismatch" | "event_hash_mismatch"; sequenceNumber: number } {
  let previousHash: string | null = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.sequence_number !== index + 1) return { valid: false, reason: "sequence_gap", sequenceNumber: event.sequence_number };
    if (event.previous_event_hash !== previousHash) {
      return { valid: false, reason: "previous_hash_mismatch", sequenceNumber: event.sequence_number };
    }
    const expected = computeEvidenceEventHash({
      ownerId: event.owner_id,
      projectId: event.project_id,
      sourceUnitId: event.source_unit_id,
      eventType: event.event_type,
      subjectType: event.subject_type,
      subjectId: event.subject_id,
      subjectVersionId: event.subject_version_id,
      payload: event.payload,
      objectSha256: event.object_sha256,
      idempotencyKey: event.idempotency_key,
      sequenceNumber: event.sequence_number,
      previousEventHash: event.previous_event_hash,
      occurredAt: event.occurred_at,
    });
    if (expected !== event.event_hash) return { valid: false, reason: "event_hash_mismatch", sequenceNumber: event.sequence_number };
    previousHash = event.event_hash;
  }
  return { valid: true };
}

export function createEvidenceLedger(client: EvidenceLedgerClient) {
  return {
    async record(input: EvidenceEventInput): Promise<EvidenceEventRow> {
      assertEvidenceEventInput(input);
      return client.append(input);
    },
    async list(scope: EvidenceScope): Promise<EvidenceEventRow[]> {
      assertNonEmpty(scope.ownerId, "EVIDENCE_INVALID_OWNER");
      assertNonEmpty(scope.projectId, "EVIDENCE_INVALID_PROJECT");
      assertNonEmpty(scope.sourceUnitId, "EVIDENCE_INVALID_SOURCE_UNIT");
      return client.list(scope);
    },
  };
}

export async function recordEvidenceEvent(input: EvidenceEventInput): Promise<EvidenceEventRow> {
  assertEvidenceEventInput(input);
  const { serviceFetch } = await import("../supabase/server");
  const result = await serviceFetch<EvidenceEventRow | EvidenceEventRow[]>("/rest/v1/rpc/append_evidence_event", {
    method: "POST",
    body: JSON.stringify({
      p_owner_id: input.ownerId,
      p_project_id: input.projectId,
      p_source_unit_id: input.sourceUnitId,
      p_event_type: input.eventType,
      p_subject_type: input.subjectType,
      p_subject_id: input.subjectId,
      p_subject_version_id: input.subjectVersionId ?? "",
      p_payload: input.payload,
      p_object_sha256: input.objectSha256 ?? null,
      p_idempotency_key: input.idempotencyKey,
    }),
  });
  const row = Array.isArray(result) ? result[0] : result;
  if (!row?.id) throw new Error("EVIDENCE_APPEND_EMPTY");
  return row;
}

export async function listEvidenceEvents(scope: EvidenceScope): Promise<EvidenceEventRow[]> {
  const ledger = createEvidenceLedger({
    append: recordEvidenceEvent,
    async list(input) {
      const { serviceFetch } = await import("../supabase/server");
      return serviceFetch<EvidenceEventRow[]>(
        `/rest/v1/storyflow_evidence_events?owner_id=eq.${encodeURIComponent(input.ownerId)}&project_id=eq.${encodeURIComponent(input.projectId)}&source_unit_id=eq.${encodeURIComponent(input.sourceUnitId)}&select=*&order=sequence_number.asc`,
      );
    },
  });
  return ledger.list(scope);
}
