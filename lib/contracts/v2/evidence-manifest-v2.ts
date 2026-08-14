/**
 * KIIKIS V2.2 EvidenceManifestV2 contract — Phase 1 Task 1.1.
 *
 * Defines the deterministic manifest that aggregates Work, Version,
 * Conversation, Generation, Job, Asset, Universe, Rights and Evidence Event
 * IDs into a single reproducible artifact. The manifest is built server-side
 * from persisted facts; clients never construct it directly.
 *
 * Schema: `kiikis.evidence-manifest/2` (V1 was `kiikis.evidence-package/1`).
 * V1 packages continue to be downloadable via the legacy route; V2.2 uses the
 * new schema and the new `/api/v2/works/[workId]/evidence` endpoint.
 */

export const EVIDENCE_MANIFEST_V2_SCHEMA = "kiikis.evidence-manifest/2" as const;
export type EvidenceManifestV2Schema = typeof EVIDENCE_MANIFEST_V2_SCHEMA;

/**
 * A file entry in the manifest. `sha256` is required — files without a hash
 * cannot be included (PRD Task 1.1 Step 1 RED: Manifest 文件缺 sha256 拒绝).
 */
export interface EvidenceManifestFileV2 {
  /** Stable path within the package, e.g. `versions/v3/content.json`. */
  archivePath: string;
  /** Original file name for human reference. */
  fileName: string;
  sha256: string;
  /** Byte size of the file content. */
  byteSize: number;
  /** Content type hint (e.g. `application/json`, `image/png`). */
  contentType: string;
}

/**
 * A Work Version entry in the manifest. References the immutable version by
 * stable `workVersionId` and `contentHash` so downstream phases can pin to it.
 */
export interface EvidenceManifestVersionEntryV2 {
  workVersionId: string;
  kind: "editing_draft" | "checkpoint" | "finalized";
  contentSchema: string;
  contentHash: string;
  createdAt: string;
}

/**
 * A conversation message entry in the manifest.
 */
export interface EvidenceManifestMessageEntryV2 {
  messageId: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  /** sha256 of the message content for tamper detection. */
  contentHash: string;
  createdAt: string;
}

/**
 * A generation request + candidate entry in the manifest.
 */
export interface EvidenceManifestGenerationEntryV2 {
  requestId: string;
  operation: "discuss" | "propose_change" | "generate" | "update";
  baseVersionId: string;
  messageIds: string[];
  candidates: Array<{
    candidateId: string;
    status: "ready" | "applied" | "rejected" | "superseded";
    contentHash: string;
    appliedVersionId: string | null;
  }>;
  createdAt: string;
}

/**
 * EvidenceManifestV2 — the top-level deterministic manifest.
 *
 * Built by `lib/server/v2/evidence/manifest-v2.ts` from persisted facts.
 * The same set of facts must always produce the same `manifestHash` and file
 * list (order-independent).
 */
export interface EvidenceManifestV2 {
  schemaVersion: EvidenceManifestV2Schema;
  contractVersion: string;
  /** Owner of the Work this manifest covers. */
  ownerId: string;
  projectId: string;
  workId: string;
  /** Highest sequence number of included evidence events. */
  highestEventSequence: number;
  /** Hash of the evidence event chain tip (legacy V1 compatibility). */
  eventChainTip: string | null;
  versions: EvidenceManifestVersionEntryV2[];
  conversations: EvidenceManifestMessageEntryV2[];
  generations: EvidenceManifestGenerationEntryV2[];
  files: EvidenceManifestFileV2[];
  /** sha256 over canonicalJson(this manifest without manifestHash). */
  manifestHash: string;
  createdAt: string;
}

export class EvidenceManifestV2Error extends Error {
  readonly code: "validation_failed" | "determinism_violation";
  readonly field?: string;

  constructor(
    code: EvidenceManifestV2Error["code"],
    message: string,
    field?: string,
  ) {
    super(message);
    this.name = "EvidenceManifestV2Error";
    this.code = code;
    this.field = field;
  }
}

/**
 * Validate an EvidenceManifestV2 DTO.
 *
 * Rules (PRD Task 1.1 Step 1 RED):
 *   - schemaVersion must be EVIDENCE_MANIFEST_V2_SCHEMA
 *   - ownerId, projectId, workId must be non-empty
 *   - every file in `files` must have a non-empty sha256
 *   - manifestHash must be non-empty (64-char sha256 hex)
 *   - createdAt must be a valid ISO string
 */
export function assertEvidenceManifestV2(value: unknown): asserts value is EvidenceManifestV2 {
  if (typeof value !== "object" || value === null) {
    throw new EvidenceManifestV2Error("validation_failed", "EvidenceManifestV2 must be an object");
  }
  const v = value as Record<string, unknown>;

  if (v.schemaVersion !== EVIDENCE_MANIFEST_V2_SCHEMA) {
    throw new EvidenceManifestV2Error(
      "validation_failed",
      `schemaVersion must be ${EVIDENCE_MANIFEST_V2_SCHEMA}, received ${String(v.schemaVersion)}`,
      "schemaVersion",
    );
  }
  if (typeof v.contractVersion !== "string" || v.contractVersion.length === 0) {
    throw new EvidenceManifestV2Error("validation_failed", "contractVersion must be non-empty", "contractVersion");
  }
  if (typeof v.ownerId !== "string" || v.ownerId.length === 0) {
    throw new EvidenceManifestV2Error("validation_failed", "ownerId must be non-empty", "ownerId");
  }
  if (typeof v.projectId !== "string" || v.projectId.length === 0) {
    throw new EvidenceManifestV2Error("validation_failed", "projectId must be non-empty", "projectId");
  }
  if (typeof v.workId !== "string" || v.workId.length === 0) {
    throw new EvidenceManifestV2Error("validation_failed", "workId must be non-empty", "workId");
  }
  if (typeof v.highestEventSequence !== "number" || v.highestEventSequence < 0) {
    throw new EvidenceManifestV2Error("validation_failed", "highestEventSequence must be a non-negative number", "highestEventSequence");
  }
  if (!Array.isArray(v.versions)) {
    throw new EvidenceManifestV2Error("validation_failed", "versions must be an array", "versions");
  }
  if (!Array.isArray(v.conversations)) {
    throw new EvidenceManifestV2Error("validation_failed", "conversations must be an array", "conversations");
  }
  if (!Array.isArray(v.generations)) {
    throw new EvidenceManifestV2Error("validation_failed", "generations must be an array", "generations");
  }
  if (!Array.isArray(v.files)) {
    throw new EvidenceManifestV2Error("validation_failed", "files must be an array", "files");
  }
  // 每个文件必须有 sha256
  for (const file of v.files) {
    if (typeof file !== "object" || file === null) {
      throw new EvidenceManifestV2Error("validation_failed", "file entry must be an object", "files");
    }
    const f = file as Record<string, unknown>;
    if (typeof f.sha256 !== "string" || f.sha256.length === 0) {
      throw new EvidenceManifestV2Error(
        "validation_failed",
        "file.sha256 is required (PRD: Manifest 文件缺 sha256 拒绝)",
        "files.sha256",
      );
    }
    if (typeof f.archivePath !== "string" || f.archivePath.length === 0) {
      throw new EvidenceManifestV2Error("validation_failed", "file.archivePath is required", "files.archivePath");
    }
    if (typeof f.byteSize !== "number" || f.byteSize < 0) {
      throw new EvidenceManifestV2Error("validation_failed", "file.byteSize must be non-negative", "files.byteSize");
    }
  }
  if (typeof v.manifestHash !== "string" || v.manifestHash.length === 0) {
    throw new EvidenceManifestV2Error("validation_failed", "manifestHash must be non-empty", "manifestHash");
  }
  if (typeof v.createdAt !== "string" || Number.isNaN(Date.parse(v.createdAt))) {
    throw new EvidenceManifestV2Error("validation_failed", "createdAt must be a valid ISO string", "createdAt");
  }
}

export function isEvidenceManifestV2(value: unknown): value is EvidenceManifestV2 {
  try {
    assertEvidenceManifestV2(value);
    return true;
  } catch {
    return false;
  }
}
