/**
 * KIIKIS V2.2 Universe Inheritance Diff & Per-Item Adoption — Phase 2 Task 2.4.
 *
 * Object-level diff between a Work's bound snapshot and the latest Universe
 * Version, plus per-item adoption that creates a new Manifest + Snapshot +
 * Work Checkpoint with only the user-selected changes.
 *
 * Rules (PRD Task 2.4 Step 1-2):
 *   - Work Version and Snapshot content are NOT changed by Universe update
 *   - Work is only marked stale when Universe Version differs
 *   - Diffs reference old/new versionId and field path
 *   - Categories: added, changed, deprecated, conflict
 *   - Conflict = object was locally modified in the Work AND the Universe also
 *     updated it. Detected via `localModified: true` in the old object content.
 */

import { canonicalJson, sha256Hex, utf8Bytes } from "../../../compliance/manifest.ts";
import {
  type InheritanceFetcher,
  type WorkInheritanceManifestV22Row,
  type UniverseVersionV22Row,
  type WorkInheritanceSnapshotV22Row,
  InheritanceV22Error,
  readWorkInheritanceV22,
  readLatestUniverseVersionV22,
} from "./index.ts";
import { createCheckpoint } from "../works/versions.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiffImpact = "added" | "changed" | "deprecated" | "conflict";

export interface SnapshotObject {
  type: "entity" | "fact" | "relationship" | "timeline_event" | "asset";
  id: string;
  versionId: string;
  content: Record<string, unknown>;
}

export interface UniverseObjectDiff {
  objectId: string;
  objectType: "entity" | "fact" | "relationship" | "timeline_event" | "asset";
  oldVersionId: string | null;
  newVersionId: string | null;
  impact: DiffImpact;
  fieldPath: string | null;
  before: unknown;
  after: unknown;
}

export interface InheritanceDiffResult {
  workId: string;
  currentManifestId: string;
  currentUniverseVersionId: string;
  latestUniverseVersionId: string;
  isStale: boolean;
  diffs: UniverseObjectDiff[];
}

export interface AdoptResult {
  manifest: WorkInheritanceManifestV22Row;
  idempotent: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SNAPSHOT_TYPE_KEYS: ReadonlyArray<{
  key: string;
  type: SnapshotObject["type"];
  table: string;
  universeScoped: boolean;
}> = [
  { key: "entities", type: "entity", table: "storyflow_universe_entities", universeScoped: true },
  { key: "facts", type: "fact", table: "storyflow_canon_facts", universeScoped: true },
  { key: "relationships", type: "relationship", table: "storyflow_universe_relationships", universeScoped: true },
  { key: "timeline_events", type: "timeline_event", table: "storyflow_universe_timeline_events", universeScoped: true },
  { key: "assets", type: "asset", table: "storyflow_v2_assets", universeScoped: false },
];

// Metadata fields stripped from raw DB rows to produce normalized content.
// Mirrors the field stripping in the `bind_work_to_universe_v22` RPC.
const METADATA_FIELDS_TO_STRIP: ReadonlySet<string> = new Set([
  "created_at",
  "updated_at",
  "user_id",
  "owner_id",
  "source_project_id",
  "source_step_id",
  "source_episode",
  "source_location_text",
  "confirmed_by_user",
  "confirmed_at",
  "project_id",
  "actor_id",
]);

// ---------------------------------------------------------------------------
// Pure diff functions
// ---------------------------------------------------------------------------

/**
 * Compute object-level diff between a Work's bound snapshot and the latest
 * Universe Version.
 *
 * Rules (PRD Task 2.4 Step 1-2):
 *   - Work Version and Snapshot content are NOT changed by Universe update
 *   - Work is only marked stale when Universe Version differs
 *   - Diffs reference old/new versionId and field path
 *   - Categories: added, changed, deprecated, conflict
 */
export function computeInheritanceDiff(input: {
  currentSnapshotObjects: SnapshotObject[];
  latestUniverseObjects: SnapshotObject[];
  currentUniverseVersionId: string;
  latestUniverseVersionId: string;
  currentManifestId: string;
  workId: string;
}): InheritanceDiffResult {
  const isStale = input.currentUniverseVersionId !== input.latestUniverseVersionId;

  if (!isStale) {
    return {
      workId: input.workId,
      currentManifestId: input.currentManifestId,
      currentUniverseVersionId: input.currentUniverseVersionId,
      latestUniverseVersionId: input.latestUniverseVersionId,
      isStale: false,
      diffs: [],
    };
  }

  const oldById = new Map<string, SnapshotObject>();
  for (const obj of input.currentSnapshotObjects) {
    oldById.set(objectKey(obj), obj);
  }

  const newById = new Map<string, SnapshotObject>();
  for (const obj of input.latestUniverseObjects) {
    newById.set(objectKey(obj), obj);
  }

  const diffs: UniverseObjectDiff[] = [];

  // New objects: added or changed/conflict
  for (const [key, newObj] of newById) {
    const oldObj = oldById.get(key);
    if (!oldObj) {
      const { impact, fieldPath, before, after } = categorizeObjectChange(null, newObj);
      diffs.push({
        objectId: newObj.id,
        objectType: newObj.type,
        oldVersionId: null,
        newVersionId: newObj.versionId,
        impact,
        fieldPath,
        before,
        after,
      });
    } else if (oldObj.versionId !== newObj.versionId) {
      const { impact, fieldPath, before, after } = categorizeObjectChange(oldObj, newObj);
      diffs.push({
        objectId: newObj.id,
        objectType: newObj.type,
        oldVersionId: oldObj.versionId,
        newVersionId: newObj.versionId,
        impact,
        fieldPath,
        before,
        after,
      });
    }
  }

  // Old objects not in new: deprecated
  for (const [key, oldObj] of oldById) {
    if (!newById.has(key)) {
      const { impact, fieldPath, before, after } = categorizeObjectChange(oldObj, null);
      diffs.push({
        objectId: oldObj.id,
        objectType: oldObj.type,
        oldVersionId: oldObj.versionId,
        newVersionId: null,
        impact,
        fieldPath,
        before,
        after,
      });
    }
  }

  // Deterministic ordering: (objectType, objectId)
  diffs.sort((a, b) => {
    if (a.objectType !== b.objectType) return a.objectType.localeCompare(b.objectType);
    return a.objectId.localeCompare(b.objectId);
  });

  return {
    workId: input.workId,
    currentManifestId: input.currentManifestId,
    currentUniverseVersionId: input.currentUniverseVersionId,
    latestUniverseVersionId: input.latestUniverseVersionId,
    isStale: true,
    diffs,
  };
}

/**
 * Categorize a single object change.
 *
 * - oldObj null, newObj exists → added
 * - newObj null, oldObj exists → deprecated
 * - Both exist, different versionId, old has localModified → conflict
 * - Both exist, different versionId → changed
 */
export function categorizeObjectChange(
  oldObj: SnapshotObject | null,
  newObj: SnapshotObject | null,
): { impact: DiffImpact; fieldPath: string | null; before: unknown; after: unknown } {
  if (!oldObj && newObj) {
    return { impact: "added", fieldPath: null, before: null, after: newObj.content };
  }
  if (oldObj && !newObj) {
    return { impact: "deprecated", fieldPath: null, before: oldObj.content, after: null };
  }
  if (!oldObj && !newObj) {
    return { impact: "changed", fieldPath: null, before: null, after: null };
  }

  const oldContent = oldObj!.content;
  const newContent = newObj!.content;
  const isLocalModified = oldContent?.localModified === true;
  const impact: DiffImpact = isLocalModified ? "conflict" : "changed";
  const fieldPath = findFirstDiffField(oldContent, newContent);

  return { impact, fieldPath, before: oldContent, after: newContent };
}

// ---------------------------------------------------------------------------
// Service: read diff (for GET route)
// ---------------------------------------------------------------------------

/**
 * Read the current Work inheritance, fetch the latest Universe Version and its
 * objects, and compute the diff. Returns isStale=false with empty diffs when
 * the Work is already bound to the latest version.
 */
export async function readInheritanceDiff(input: {
  fetcher: InheritanceFetcher;
  ownerId: string;
  workId: string;
}): Promise<InheritanceDiffResult> {
  if (!input.ownerId) throw new InheritanceV22Error("unauthenticated", "ownerId is required.");
  if (!input.workId) throw new InheritanceV22Error("validation_failed", "workId is required.");

  const current = await readWorkInheritanceV22({
    fetcher: input.fetcher,
    ownerId: input.ownerId,
    workId: input.workId,
  });

  if (!current.manifest) {
    throw new InheritanceV22Error("not_found", "Work is not bound to a Universe.");
  }

  const latestVersion = await readLatestUniverseVersionV22(
    input.fetcher,
    current.manifest.universeId,
  );

  if (!latestVersion) {
    return {
      workId: input.workId,
      currentManifestId: current.manifest.id,
      currentUniverseVersionId: current.manifest.universeVersionId,
      latestUniverseVersionId: current.manifest.universeVersionId,
      isStale: false,
      diffs: [],
    };
  }

  const currentSnapshotObjects = current.snapshot
    ? parseSnapshotObjects(current.snapshot)
    : [];

  const latestUniverseObjects = await readUniverseObjectsForVersion(
    input.fetcher,
    current.manifest.universeId,
    latestVersion,
  );

  return computeInheritanceDiff({
    currentSnapshotObjects,
    latestUniverseObjects,
    currentUniverseVersionId: current.manifest.universeVersionId,
    latestUniverseVersionId: latestVersion.id,
    currentManifestId: current.manifest.id,
    workId: input.workId,
  });
}

// ---------------------------------------------------------------------------
// Service: per-item adoption (for POST route)
// ---------------------------------------------------------------------------

/**
 * Adopt selected diff items from the latest Universe Version into the Work's
 * inheritance. Creates a new Manifest + Snapshot (superseding the prior) and a
 * Work Checkpoint. Unadopted items keep their old snapshot content.
 *
 * Idempotent: if the current manifest already points to the latest Universe
 * Version, returns the current manifest without creating a new one.
 */
export async function adoptInheritanceDiff(input: {
  fetcher: InheritanceFetcher;
  ownerId: string;
  workId: string;
  diffIds: string[];
}): Promise<AdoptResult> {
  if (!input.ownerId) throw new InheritanceV22Error("unauthenticated", "ownerId is required.");
  if (!input.workId) throw new InheritanceV22Error("validation_failed", "workId is required.");
  if (!Array.isArray(input.diffIds) || input.diffIds.length === 0) {
    throw new InheritanceV22Error("validation_failed", "diffIds must be a non-empty array.");
  }

  const current = await readWorkInheritanceV22({
    fetcher: input.fetcher,
    ownerId: input.ownerId,
    workId: input.workId,
  });

  if (!current.manifest) {
    throw new InheritanceV22Error("not_found", "Work is not bound to a Universe.");
  }

  const latestVersion = await readLatestUniverseVersionV22(
    input.fetcher,
    current.manifest.universeId,
  );

  if (!latestVersion) {
    throw new InheritanceV22Error("not_found", "No Universe Version found.");
  }

  // Idempotent: already on the latest version.
  if (current.manifest.universeVersionId === latestVersion.id) {
    return { manifest: current.manifest, idempotent: true };
  }

  const currentSnapshotObjects = current.snapshot
    ? parseSnapshotObjects(current.snapshot)
    : [];

  const latestUniverseObjects = await readUniverseObjectsForVersion(
    input.fetcher,
    current.manifest.universeId,
    latestVersion,
  );

  const diffResult = computeInheritanceDiff({
    currentSnapshotObjects,
    latestUniverseObjects,
    currentUniverseVersionId: current.manifest.universeVersionId,
    latestUniverseVersionId: latestVersion.id,
    currentManifestId: current.manifest.id,
    workId: input.workId,
  });

  // Validate all diffIds exist in the computed diff.
  const diffById = new Map(diffResult.diffs.map((d) => [d.objectId, d]));
  for (const diffId of input.diffIds) {
    if (!diffById.has(diffId)) {
      throw new InheritanceV22Error(
        "validation_failed",
        `diffId ${diffId} is not a valid diff item.`,
      );
    }
  }

  const adoptedSet = new Set(input.diffIds);

  // Build merged objects: start with current, apply adopted changes.
  const mergedByType = new Map<SnapshotObject["type"], Map<string, SnapshotObject>>();
  for (const obj of currentSnapshotObjects) {
    if (!mergedByType.has(obj.type)) mergedByType.set(obj.type, new Map());
    mergedByType.get(obj.type)!.set(obj.id, obj);
  }

  const latestByType = new Map<SnapshotObject["type"], Map<string, SnapshotObject>>();
  for (const obj of latestUniverseObjects) {
    if (!latestByType.has(obj.type)) latestByType.set(obj.type, new Map());
    latestByType.get(obj.type)!.set(obj.id, obj);
  }

  for (const diff of diffResult.diffs) {
    if (!adoptedSet.has(diff.objectId)) continue;
    const typeMap = mergedByType.get(diff.objectType) || new Map<string, SnapshotObject>();
    if (diff.impact === "deprecated") {
      typeMap.delete(diff.objectId);
    } else {
      // added, changed, conflict → use the new version
      const newObj = latestByType.get(diff.objectType)?.get(diff.objectId);
      if (newObj) typeMap.set(diff.objectId, newObj);
    }
    mergedByType.set(diff.objectType, typeMap);
  }

  // Build new snapshot content and included ID lists.
  const objectSnapshot: Record<string, unknown> = {
    universe_id: current.manifest.universeId,
    universe_version_id: latestVersion.id,
  };
  const includedIds: Record<SnapshotObject["type"], string[]> = {
    entity: [],
    fact: [],
    relationship: [],
    timeline_event: [],
    asset: [],
  };

  for (const { key, type } of SNAPSHOT_TYPE_KEYS) {
    const typeMap = mergedByType.get(type);
    const items: Record<string, unknown>[] = [];
    if (typeMap) {
      const sortedIds = [...typeMap.keys()].sort();
      for (const id of sortedIds) {
        const obj = typeMap.get(id)!;
        items.push(obj.content);
        includedIds[type].push(id);
      }
    }
    objectSnapshot[key] = items;
  }

  const snapshotHash = sha256Hex(utf8Bytes(canonicalJson(objectSnapshot)));

  // 1. Supersede the old manifest (release the active slot).
  await queryV22(input.fetcher, `/rest/v1/storyflow_work_inheritance_manifests?id=eq.${encodeURIComponent(current.manifest.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ is_active: false }),
  });

  // 2. Insert the new active manifest.
  const manifestRows = await queryV22<unknown[]>(input.fetcher, "/rest/v1/storyflow_work_inheritance_manifests", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      work_id: current.manifest.workId,
      universe_id: current.manifest.universeId,
      universe_version_id: latestVersion.id,
      relation: current.manifest.relation,
      timeline_anchor_id: current.manifest.timelineAnchorId,
      canon_policy: current.manifest.canonPolicy,
      included_entity_version_ids: includedIds.entity,
      included_fact_version_ids: includedIds.fact,
      included_relationship_version_ids: includedIds.relationship,
      included_timeline_event_version_ids: includedIds.timeline_event,
      included_asset_version_ids: includedIds.asset,
      is_active: true,
      superseded_by: null,
      created_by: input.ownerId,
    }),
  });

  const manifestRow = Array.isArray(manifestRows) ? manifestRows[0] : undefined;
  if (!manifestRow || typeof manifestRow !== "object") {
    throw new InheritanceV22Error("service_unavailable", "Unable to create new manifest.");
  }
  const newManifest = toManifestRow(manifestRow as Record<string, unknown>);

  // 3. Backfill superseded_by on the old manifest.
  await queryV22(input.fetcher, `/rest/v1/storyflow_work_inheritance_manifests?id=eq.${encodeURIComponent(current.manifest.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ superseded_by: newManifest.id }),
  });

  // 4. Insert the new snapshot.
  await queryV22(input.fetcher, "/rest/v1/storyflow_work_inheritance_snapshots", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      manifest_id: newManifest.id,
      work_id: current.manifest.workId,
      universe_version_id: latestVersion.id,
      snapshot_hash: snapshotHash,
      object_snapshot: objectSnapshot,
    }),
  });

  // 5. Create a Work Checkpoint.
  const idempotencyKey = `adopt:${current.manifest.workId}:${latestVersion.id}:${[...adoptedSet].sort().join(",")}`;
  await createCheckpoint(
    {
      ownerId: input.ownerId,
      workId: current.manifest.workId,
      parentVersionId: null,
      contentSchema: "kiikis.inheritance-adopt/1",
      content: {
        action: "inheritance_adopt",
        manifestId: newManifest.id,
        fromUniverseVersionId: current.manifest.universeVersionId,
        toUniverseVersionId: latestVersion.id,
        adoptedDiffIds: [...adoptedSet].sort(),
        diffCount: diffResult.diffs.length,
      },
      source: "manual",
      idempotencyKey,
    },
    input.fetcher,
  ).catch((error) => {
    // Checkpoint failure should not roll back the manifest creation.
    // Re-throw as a service error so the client knows the checkpoint failed.
    if (error instanceof InheritanceV22Error) throw error;
    throw new InheritanceV22Error(
      "service_unavailable",
      `Manifest created but checkpoint failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  });

  return { manifest: newManifest, idempotent: false };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function objectKey(obj: SnapshotObject): string {
  return `${obj.type}:${obj.id}`;
}

function findFirstDiffField(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string | null {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of [...keys].sort()) {
    if (key === "localModified") continue; // internal flag, not a content field
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      return key;
    }
  }
  return null;
}

function computeObjectVersionId(content: Record<string, unknown>): string {
  return sha256Hex(utf8Bytes(canonicalJson(content)));
}

function normalizeContent(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!METADATA_FIELDS_TO_STRIP.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Parse a WorkInheritanceSnapshotV22Row's objectSnapshot into SnapshotObject[].
 */
function parseSnapshotObjects(snapshot: WorkInheritanceSnapshotV22Row): SnapshotObject[] {
  const objects: SnapshotObject[] = [];
  const snap = snapshot.objectSnapshot;

  for (const { key, type } of SNAPSHOT_TYPE_KEYS) {
    const arr = snap[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const raw = item as Record<string, unknown>;
      const id = String(raw.id);
      const content = normalizeContent(raw);
      objects.push({
        type,
        id,
        versionId: computeObjectVersionId(content),
        content,
      });
    }
  }

  return objects;
}

/**
 * Fetch the current content of objects listed in a Universe Version's
 * objectIndex from the canonical tables.
 */
async function readUniverseObjectsForVersion(
  fetcher: InheritanceFetcher,
  universeId: string,
  version: UniverseVersionV22Row,
): Promise<SnapshotObject[]> {
  const objects: SnapshotObject[] = [];
  const idx = version.objectIndex;

  const tasks: Promise<SnapshotObject[]>[] = [];

  for (const { key, type, table, universeScoped } of SNAPSHOT_TYPE_KEYS) {
    const ids = idx[key];
    if (!Array.isArray(ids) || ids.length === 0) continue;
    const idFilter = ids.map(encodeURIComponent).join(",");
    const universeFilter = universeScoped
      ? `&universe_id=eq.${encodeURIComponent(universeId)}`
      : "";
    tasks.push(
      queryV22<Record<string, unknown>[]>(
        fetcher,
        `/rest/v1/${table}?id=in.(${idFilter})${universeFilter}&select=*&order=id.asc&limit=500`,
      ).then((rows) => {
        const result: SnapshotObject[] = [];
        for (const row of rows || []) {
          if (!row || typeof row !== "object") continue;
          const raw = row as Record<string, unknown>;
          const id = String(raw.id);
          const content = normalizeContent(raw);
          result.push({
            type,
            id,
            versionId: computeObjectVersionId(content),
            content,
          });
        }
        return result;
      }),
    );
  }

  const results = await Promise.all(tasks);
  for (const result of results) {
    objects.push(...result);
  }

  return objects;
}

/**
 * Query wrapper that maps fetcher errors to InheritanceV22Error.
 */
async function queryV22<T>(
  fetcher: InheritanceFetcher,
  path: string,
  init?: RequestInit,
): Promise<T> {
  try {
    return await fetcher<T>(path, init);
  } catch (error) {
    if (error instanceof InheritanceV22Error) throw error;
    throw new InheritanceV22Error(
      "service_unavailable",
      error instanceof Error ? error.message : "Inheritance service unavailable.",
    );
  }
}

/**
 * Convert a snake_case DB row to a camelCase WorkInheritanceManifestV22Row.
 * Mirrors the (private) toManifestV22Row in index.ts.
 */
function toManifestRow(row: Record<string, unknown>): WorkInheritanceManifestV22Row {
  return {
    id: String(row.id),
    workId: String(row.work_id),
    universeId: String(row.universe_id),
    universeVersionId: String(row.universe_version_id),
    relation: String(row.relation),
    timelineAnchorId: row.timeline_anchor_id != null ? String(row.timeline_anchor_id) : null,
    canonPolicy: String(row.canon_policy),
    includedEntityVersionIds: asStringArray(row.included_entity_version_ids),
    includedFactVersionIds: asStringArray(row.included_fact_version_ids),
    includedRelationshipVersionIds: asStringArray(row.included_relationship_version_ids),
    includedTimelineEventVersionIds: asStringArray(row.included_timeline_event_version_ids),
    includedAssetVersionIds: asStringArray(row.included_asset_version_ids),
    isActive: Boolean(row.is_active),
    supersededBy: row.superseded_by != null ? String(row.superseded_by) : null,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v));
}
