/**
 * KIIKIS V2.2 Universe Inheritance contracts — Phase 2 Task 2.1.
 *
 * Extends V2.2 with object-level InheritanceManifestV1, immutable Universe
 * Version (content-hash based), and Work Local State. All V2.2 constants are
 * additive; the legacy V2 `CONTRACT_VERSION = "2.0.0-alpha.1"` in
 * `lib/contracts/v2/index.ts` is intentionally left untouched.
 *
 * contract_version = 2.2.0-alpha.1 (same as KIIKIS_22_CONTRACT_VERSION).
 *
 * Persistence-agnostic DTOs: DB row names, storage paths and provider metadata
 * stay in server adapters and never cross the v2.2 API boundary.
 */

import { KIIKIS_22_CONTRACT_VERSION } from "./work-history.ts";

// NOTE: `computeUniverseVersionContentHash` lives in
// `./universe-inheritance-v22-hash.ts` to keep this contract module free of
// `node:crypto` so it can be safely imported by client bundles.

export { KIIKIS_22_CONTRACT_VERSION };

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const INHERITANCE_MANIFEST_V1_SCHEMA = "kiikis.inheritance-manifest/1" as const;
export const UNIVERSE_VERSION_V22_SCHEMA = "kiikis.universe-version/1" as const;

// ---------------------------------------------------------------------------
// Work relation & canon policy
// ---------------------------------------------------------------------------

export const WORK_RELATIONS = [
  "canon_continuation",
  "prequel",
  "sequel",
  "spinoff",
  "adaptation",
  "parallel",
] as const;
export type WorkRelation = (typeof WORK_RELATIONS)[number];

export const CANON_POLICIES = ["strict", "flexible", "reference_only"] as const;
export type CanonPolicy = (typeof CANON_POLICIES)[number];

// ---------------------------------------------------------------------------
// Canon object input (for content hash computation)
// ---------------------------------------------------------------------------

/**
 * A single Canon object reference used to compute a Universe Version hash.
 *
 * `id` is the stable object identity; `versionId` changes when content
 * changes. Content fields are the persisted payload (excluding `updatedAt`
 * and other non-content metadata).
 */
export interface CanonObjectInput {
  type: "entity" | "fact" | "relationship" | "timeline_event" | "asset";
  id: string;
  versionId: string;
  /** Content payload (excluding updatedAt and other non-content metadata). */
  content: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Universe Version V22
// ---------------------------------------------------------------------------

/**
 * Immutable Universe Version. `versionNo` is monotonic but `contentHash` is
 * derived only from Canon object content — the same object set and version
 * order always produces the same hash, regardless of when it was computed.
 */
export interface UniverseVersionV22 {
  id: string;
  universeId: string;
  versionNo: number;
  contentHash: string;
  /** Ordered object index: type → sorted id list. */
  objectIndex: {
    entities: string[];
    facts: string[];
    relationships: string[];
    timelineEvents: string[];
    assets: string[];
  };
  createdBy: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Inheritance Manifest V1
// ---------------------------------------------------------------------------

/**
 * Object-level inheritance manifest: records exactly which Universe Version a
 * Work is bound to, the relation, canon policy, and the included object
 * version IDs at bind time. Append-only per Work (new manifest supersedes old).
 */
export interface InheritanceManifestV1 {
  schemaVersion: typeof INHERITANCE_MANIFEST_V1_SCHEMA;
  workId: string;
  universeId: string;
  universeVersionId: string;
  relation: WorkRelation;
  timelineAnchorId: string | null;
  canonPolicy: CanonPolicy;
  includedEntityVersionIds: string[];
  includedFactVersionIds: string[];
  includedRelationshipVersionIds: string[];
  includedTimelineEventVersionIds: string[];
  includedAssetVersionIds: string[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Contract errors
// ---------------------------------------------------------------------------

export class UniverseInheritanceContractError extends Error {
  readonly code:
    | "validation_failed"
    | "invalid_contract_version"
    | "determinism_violation";
  readonly field?: string;

  constructor(
    code: UniverseInheritanceContractError["code"],
    message: string,
    field?: string,
  ) {
    super(message);
    this.name = "UniverseInheritanceContractError";
    this.code = code;
    this.field = field;
  }
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isWorkRelation(value: unknown): value is WorkRelation {
  return (
    typeof value === "string" &&
    (WORK_RELATIONS as readonly string[]).includes(value)
  );
}

export function isCanonPolicy(value: unknown): value is CanonPolicy {
  return (
    typeof value === "string" &&
    (CANON_POLICIES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Universe Version V22 validator
// ---------------------------------------------------------------------------

export function assertUniverseVersionV22(
  value: unknown,
): asserts value is UniverseVersionV22 {
  if (typeof value !== "object" || value === null) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      "UniverseVersion must be an object",
    );
  }
  const v = value as Record<string, unknown>;

  if (typeof v.id !== "string" || v.id.length === 0) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      "id is required",
      "id",
    );
  }
  if (typeof v.universeId !== "string" || v.universeId.length === 0) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      "universeId must be non-empty",
      "universeId",
    );
  }
  if (typeof v.versionNo !== "number" || !Number.isInteger(v.versionNo) || v.versionNo < 1) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      "versionNo must be a positive integer",
      "versionNo",
    );
  }
  if (typeof v.contentHash !== "string" || v.contentHash.length === 0) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      "contentHash must be non-empty",
      "contentHash",
    );
  }
  if (typeof v.objectIndex !== "object" || v.objectIndex === null) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      "objectIndex must be an object",
      "objectIndex",
    );
  }
  const idx = v.objectIndex as Record<string, unknown>;
  for (const key of ["entities", "facts", "relationships", "timelineEvents", "assets"] as const) {
    if (!Array.isArray(idx[key]) || !idx[key].every((x) => typeof x === "string")) {
      throw new UniverseInheritanceContractError(
        "validation_failed",
        `objectIndex.${key} must be string[]`,
        `objectIndex.${key}`,
      );
    }
  }
  if (typeof v.createdBy !== "string" || v.createdBy.length === 0) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      "createdBy must be non-empty",
      "createdBy",
    );
  }
  if (typeof v.createdAt !== "string" || Number.isNaN(Date.parse(v.createdAt))) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      "createdAt must be a valid ISO string",
      "createdAt",
    );
  }
}

export function isUniverseVersionV22(value: unknown): value is UniverseVersionV22 {
  try {
    assertUniverseVersionV22(value);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Inheritance Manifest V1 validator
// ---------------------------------------------------------------------------

/**
 * Validate an InheritanceManifestV1 DTO. Throws on violation.
 *
 * Rules (PRD Task 2.1 Step 3):
 *   - schemaVersion must be INHERITANCE_MANIFEST_V1_SCHEMA
 *   - workId, universeId, universeVersionId must be non-empty
 *   - relation must be one of WORK_RELATIONS
 *   - canonPolicy must be one of CANON_POLICIES
 *   - included*VersionIds must be string[] with no duplicates
 *   - createdAt must be a valid ISO string
 */
export function assertInheritanceManifestV1(
  value: unknown,
): asserts value is InheritanceManifestV1 {
  if (typeof value !== "object" || value === null) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      "InheritanceManifest must be an object",
    );
  }
  const v = value as Record<string, unknown>;

  if (v.schemaVersion !== INHERITANCE_MANIFEST_V1_SCHEMA) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      `schemaVersion must be ${INHERITANCE_MANIFEST_V1_SCHEMA}`,
      "schemaVersion",
    );
  }
  if (typeof v.workId !== "string" || v.workId.length === 0) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      "workId must be non-empty",
      "workId",
    );
  }
  if (typeof v.universeId !== "string" || v.universeId.length === 0) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      "universeId must be non-empty",
      "universeId",
    );
  }
  if (typeof v.universeVersionId !== "string" || v.universeVersionId.length === 0) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      "universeVersionId must be non-empty",
      "universeVersionId",
    );
  }
  if (!isWorkRelation(v.relation)) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      `Unsupported relation: ${String(v.relation)}`,
      "relation",
    );
  }
  if (v.timelineAnchorId !== null && typeof v.timelineAnchorId !== "string") {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      "timelineAnchorId must be string or null",
      "timelineAnchorId",
    );
  }
  if (!isCanonPolicy(v.canonPolicy)) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      `Unsupported canonPolicy: ${String(v.canonPolicy)}`,
      "canonPolicy",
    );
  }

  // Validate included*VersionIds: must be string[] with no duplicates.
  const idFields = [
    "includedEntityVersionIds",
    "includedFactVersionIds",
    "includedRelationshipVersionIds",
    "includedTimelineEventVersionIds",
    "includedAssetVersionIds",
  ] as const;
  for (const field of idFields) {
    const arr = v[field];
    if (!Array.isArray(arr) || !arr.every((x) => typeof x === "string" && x.length > 0)) {
      throw new UniverseInheritanceContractError(
        "validation_failed",
        `${field} must be a non-empty string[]`,
        field,
      );
    }
    const seen = new Set<string>();
    for (const id of arr as string[]) {
      if (seen.has(id)) {
        throw new UniverseInheritanceContractError(
          "validation_failed",
          `${field} contains duplicate id: ${id}`,
          field,
        );
      }
      seen.add(id);
    }
  }

  if (typeof v.createdAt !== "string" || Number.isNaN(Date.parse(v.createdAt))) {
    throw new UniverseInheritanceContractError(
      "validation_failed",
      "createdAt must be a valid ISO string",
      "createdAt",
    );
  }
}

export function isInheritanceManifestV1(value: unknown): value is InheritanceManifestV1 {
  try {
    assertInheritanceManifestV1(value);
    return true;
  } catch {
    return false;
  }
}
