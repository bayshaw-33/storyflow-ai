export const EVIDENCE_EVENT_TYPES = [
  "storyboard_snapshot_saved",
  "generation_completed",
  "reference_selected",
  "export_released",
  "package_generated",
] as const;

export type EvidenceEventType = (typeof EVIDENCE_EVENT_TYPES)[number];

export interface EvidenceScope {
  ownerId: string;
  projectId: string;
  sourceUnitId: string;
}

export interface EvidenceEventInput extends EvidenceScope {
  eventType: EvidenceEventType;
  subjectType: string;
  subjectId: string;
  subjectVersionId?: string | null;
  payload: Record<string, unknown>;
  objectSha256?: string | null;
  idempotencyKey: string;
}

export interface EvidenceEventRow {
  id: string;
  case_id: string;
  owner_id: string;
  project_id: string;
  source_unit_id: string;
  sequence_number: number;
  event_type: EvidenceEventType;
  subject_type: string;
  subject_id: string;
  subject_version_id: string | null;
  payload: Record<string, unknown>;
  object_sha256: string | null;
  previous_event_hash: string | null;
  event_hash: string;
  idempotency_key: string;
  occurred_at: string;
}

export interface EvidencePackageRow {
  id: string;
  case_id: string;
  owner_id: string;
  project_id: string;
  source_unit_id: string;
  highest_sequence_number: number;
  manifest_sha256: string;
  package_sha256: string;
  storage_bucket: string;
  storage_path: string;
  status: "ready" | "failed";
  created_at: string;
}
