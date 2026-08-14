/**
 * KIIKIS V2.2 Context Packet service — Phase 2 Task 2.3.
 *
 * Builds a high-signal, deterministic context packet for AI generation from:
 *   - Current Work Version (content used for scene-matching, not concatenated)
 *   - Active Inheritance Manifest (included Canon object IDs)
 *   - Work Local State (active patches overlaid on Canon content)
 *   - Recent user selection (relevance boost)
 *
 * Ranking rules (PRD Task 2.3):
 *   - Current scene characters/locations have highest priority
 *   - Relationships involving current scene entities are secondary
 *   - Timeline neighboring events are secondary
 *   - Irrelevant Universe long-text is excluded when over budget
 *   - Fixed input produces fixed reference order (determinism)
 *   - Each reference carries reason + versionId (source visibility)
 *   - Does NOT concatenate full Universe/script/conversation
 */

import { canonicalJson, sha256Hex, utf8Bytes } from "../../../compliance/manifest.ts";
import {
  rankByRelevance,
  selectWithinBudget,
  estimateObjectByteSize,
  type EntityType,
  type RankableObject,
} from "./ranking.ts";

export type ContextPacketFetcher = <T = unknown>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

export class ContextPacketError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "validation_failed" | "service_unavailable";
  constructor(code: ContextPacketError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "ContextPacketError";
    this.code = code;
  }
}

export interface ContextPacketResult {
  id: string;
  manifestId: string | null;
  references: Array<{
    type: string;
    id: string;
    versionId: string;
    reason: string;
  }>;
  content: unknown;
  contentHash: string;
}

// ---------------------------------------------------------------------------
// DB row types (snake_case, as returned by PostgREST)
// ---------------------------------------------------------------------------

interface WorkVersionRow {
  id: string;
  work_id: string;
  content_json: unknown;
  content_hash: string;
}

interface WorkRow {
  id: string;
  owner_id: string;
}

interface ManifestRow {
  id: string;
  work_id: string;
  universe_id: string;
  universe_version_id: string;
  relation: string;
  timeline_anchor_id: string | null;
  canon_policy: string;
  included_entity_version_ids: string[];
  included_fact_version_ids: string[];
  included_relationship_version_ids: string[];
  included_timeline_event_version_ids: string[];
  included_asset_version_ids: string[];
  is_active: boolean;
  superseded_by: string | null;
  created_by: string;
  created_at: string;
}

interface EntityRow {
  id: string;
  universe_id: string;
  type: string;
  name: string;
  summary: string | null;
  status: string | null;
}

interface FactRow {
  id: string;
  universe_id: string;
  fact_text: string;
  category: string;
  importance: string;
  status: string;
  is_locked: boolean;
}

interface RelationshipRow {
  id: string;
  source_entity_id: string | null;
  target_entity_id: string | null;
  relationship_type: string;
  summary: string | null;
  status: string | null;
}

interface TimelineRow {
  id: string;
  title: string;
  description: string | null;
  date_label: string | null;
  related_entity_ids: string[] | null;
  status: string | null;
}

interface AssetRow {
  id: string;
  kind: string | null;
  name: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
}

interface LocalStateRow {
  id: string;
  work_id: string;
  base_manifest_id: string;
  entity_type: string;
  entity_id: string;
  patch_json: Record<string, unknown>;
  revision: number;
  status: string;
}

// ---------------------------------------------------------------------------
// Scoring constants
// ---------------------------------------------------------------------------

const SELECTION_BOOST = 1000;
const CURRENT_SCENE_BOOST = 200;
const DIRECTLY_RELATED_BOOST = 100;
const CANON_STATUS_BOOST = 10;

function entityBaseScore(type: string): number {
  switch (type) {
    case "character": return 60;
    case "location": return 55;
    case "organization": return 45;
    case "object": return 40;
    case "rule": return 35;
    case "concept": return 35;
    default: return 40;
  }
}

const FACT_BASE = 30;
const RELATIONSHIP_BASE = 35;
const TIMELINE_BASE = 30;
const ASSET_BASE = 20;

// ---------------------------------------------------------------------------
// buildContextPacket
// ---------------------------------------------------------------------------

export interface BuildContextPacketInput {
  ownerId: string;
  workId: string;
  workVersionId: string;
  view: string;
  selection?: { entityType: string; entityId: string } | null;
  tokenBudget: number;
}

/**
 * Build a high-signal context packet for AI generation.
 *
 * Determinism: the same input (workVersionId, selection, budget) always
 * produces the same references order and contentHash, regardless of the
 * order objects are returned by the fetcher.
 */
export async function buildContextPacket(
  input: BuildContextPacketInput,
  fetcher: ContextPacketFetcher,
): Promise<ContextPacketResult> {
  if (!input.ownerId) {
    throw new ContextPacketError("unauthenticated", "ownerId is required.");
  }
  if (!input.workId) {
    throw new ContextPacketError("validation_failed", "workId is required.");
  }
  if (!input.workVersionId) {
    throw new ContextPacketError("validation_failed", "workVersionId is required.");
  }

  // Fetch the work version (for scene-matching) and verify ownership.
  const [workVersion, work] = await Promise.all([
    fetchWorkVersion(input.workVersionId, fetcher),
    fetchWork(input.workId, fetcher),
  ]);

  if (!workVersion) {
    throw new ContextPacketError("not_found", "Work version not found.");
  }
  if (workVersion.work_id !== input.workId) {
    throw new ContextPacketError("validation_failed", "Work version does not belong to the specified work.");
  }
  if (!work) {
    throw new ContextPacketError("not_found", "Work not found.");
  }
  if (work.owner_id !== input.ownerId) {
    throw new ContextPacketError("forbidden", "Work access denied.");
  }

  // Fetch the active inheritance manifest (if any).
  const manifest = await fetchActiveManifest(input.workId, fetcher);

  // Fetch active local state patches.
  const localStates = await fetchLocalStates(input.workId, fetcher);
  const patchByEntity = new Map<string, LocalStateRow>();
  for (const ls of localStates) {
    if (ls.status === "active") {
      patchByEntity.set(`${ls.entity_type}:${ls.entity_id}`, ls);
    }
  }

  const rankableObjects: RankableObject[] = [];

  if (manifest) {
    // Serialize work version content for scene-matching (entity names).
    const sceneText = serializeContent(workVersion.content_json);

    const selectionEntityId = input.selection?.entityId ?? null;
    const selectionEntityType = input.selection?.entityType ?? null;

    // Fetch included Canon objects in parallel.
    const [entities, facts, relationships, timelineEvents, assets] = await Promise.all([
      fetchEntities(manifest.included_entity_version_ids, manifest.universe_id, fetcher),
      fetchFacts(manifest.included_fact_version_ids, manifest.universe_id, fetcher),
      fetchRelationships(manifest.included_relationship_version_ids, manifest.universe_id, fetcher),
      fetchTimelineEvents(manifest.included_timeline_event_version_ids, manifest.universe_id, fetcher),
      fetchAssets(manifest.included_asset_version_ids, fetcher),
    ]);

    // Build rankable objects with relevance scores.
    for (const entity of entities) {
      const isSelected = isSelectionMatch("entity", entity.id, selectionEntityType, selectionEntityId);
      const inScene = isInCurrentScene(entity.name, sceneText);
      const isCanon = entity.status === "canon";
      const score = entityBaseScore(entity.type)
        + (isSelected ? SELECTION_BOOST : 0)
        + (inScene ? CURRENT_SCENE_BOOST : 0)
        + (isCanon ? CANON_STATUS_BOOST : 0);

      const content = applyPatch(toEntityContent(entity), patchByEntity.get(`entity:${entity.id}`));
      rankableObjects.push({
        type: "entity",
        id: entity.id,
        versionId: entity.id,
        relevanceScore: score,
        reason: buildReason(
          `${entity.type} entity: ${entity.name}`,
          [isSelected, "user-selected"],
          [inScene, "referenced in current scene"],
          [isCanon, "canon status"],
        ),
        content,
        byteSize: estimateObjectByteSize(content),
      });
    }

    for (const fact of facts) {
      const isSelected = isSelectionMatch("fact", fact.id, selectionEntityType, selectionEntityId);
      const isCanon = fact.is_locked;
      const score = FACT_BASE
        + (isSelected ? SELECTION_BOOST : 0)
        + (isCanon ? CANON_STATUS_BOOST : 0);

      const content = applyPatch(toFactContent(fact), patchByEntity.get(`fact:${fact.id}`));
      rankableObjects.push({
        type: "fact",
        id: fact.id,
        versionId: fact.id,
        relevanceScore: score,
        reason: buildReason(
          `canon fact: ${fact.fact_text.slice(0, 60)}`,
          [isSelected, "user-selected"],
          [isCanon, "locked canon"],
        ),
        content,
        byteSize: estimateObjectByteSize(content),
      });
    }

    for (const rel of relationships) {
      const isSelected = isSelectionMatch("relationship", rel.id, selectionEntityType, selectionEntityId);
      const directlyRelated = selectionEntityId !== null
        && (rel.source_entity_id === selectionEntityId || rel.target_entity_id === selectionEntityId);
      const isCanon = rel.status === "canon";
      const score = RELATIONSHIP_BASE
        + (isSelected ? SELECTION_BOOST : 0)
        + (directlyRelated ? DIRECTLY_RELATED_BOOST : 0)
        + (isCanon ? CANON_STATUS_BOOST : 0);

      const content = applyPatch(toRelationshipContent(rel), patchByEntity.get(`relationship:${rel.id}`));
      rankableObjects.push({
        type: "relationship",
        id: rel.id,
        versionId: rel.id,
        relevanceScore: score,
        reason: buildReason(
          `relationship: ${rel.relationship_type}`,
          [isSelected, "user-selected"],
          [directlyRelated, "directly related to selection"],
          [isCanon, "canon status"],
        ),
        content,
        byteSize: estimateObjectByteSize(content),
      });
    }

    for (const event of timelineEvents) {
      const isSelected = isSelectionMatch("timeline_event", event.id, selectionEntityType, selectionEntityId);
      const relatedIds = Array.isArray(event.related_entity_ids)
        ? event.related_entity_ids.map(String)
        : [];
      const directlyRelated = selectionEntityId !== null && relatedIds.includes(selectionEntityId);
      const isCanon = event.status === "canon";
      const score = TIMELINE_BASE
        + (isSelected ? SELECTION_BOOST : 0)
        + (directlyRelated ? DIRECTLY_RELATED_BOOST : 0)
        + (isCanon ? CANON_STATUS_BOOST : 0);

      const content = applyPatch(toTimelineContent(event), patchByEntity.get(`timeline_event:${event.id}`));
      rankableObjects.push({
        type: "timeline_event",
        id: event.id,
        versionId: event.id,
        relevanceScore: score,
        reason: buildReason(
          `timeline event: ${event.title}`,
          [isSelected, "user-selected"],
          [directlyRelated, "related to selection"],
          [isCanon, "canon status"],
        ),
        content,
        byteSize: estimateObjectByteSize(content),
      });
    }

    for (const asset of assets) {
      const isSelected = isSelectionMatch("asset", asset.id, selectionEntityType, selectionEntityId);
      const score = ASSET_BASE + (isSelected ? SELECTION_BOOST : 0);

      const content = applyPatch(toAssetContent(asset), patchByEntity.get(`asset:${asset.id}`));
      rankableObjects.push({
        type: "asset",
        id: asset.id,
        versionId: asset.id,
        relevanceScore: score,
        reason: buildReason(
          `asset: ${asset.name || asset.kind || asset.id}`,
          [isSelected, "user-selected"],
        ),
        content,
        byteSize: estimateObjectByteSize(content),
      });
    }
  }

  // Rank and select within budget.
  const ranked = rankByRelevance(rankableObjects);
  const { selected, totalBytes } = selectWithinBudget(ranked, input.tokenBudget);

  // Build references (deterministic order from ranking).
  const references = selected.map((obj) => ({
    type: obj.type,
    id: obj.id,
    versionId: obj.versionId,
    reason: obj.reason,
  }));

  // Build content object (selected object payloads only — no full script/conversation).
  const content = {
    workVersionId: input.workVersionId,
    view: input.view,
    manifestId: manifest?.id ?? null,
    tokenBudget: input.tokenBudget,
    totalBytes,
    objects: selected.map((obj) => ({
      type: obj.type,
      id: obj.id,
      versionId: obj.versionId,
      reason: obj.reason,
      payload: obj.content,
    })),
  };

  const contentHash = sha256Hex(utf8Bytes(canonicalJson(content)));
  const id = `ctx_${contentHash}`;

  return { id, manifestId: manifest?.id ?? null, references, content, contentHash };
}

// ---------------------------------------------------------------------------
// Content builders (snake_case DB row → clean content object)
// ---------------------------------------------------------------------------

function toEntityContent(row: EntityRow): Record<string, unknown> {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    summary: row.summary ?? "",
    status: row.status ?? "draft",
  };
}

function toFactContent(row: FactRow): Record<string, unknown> {
  return {
    id: row.id,
    factText: row.fact_text,
    category: row.category,
    importance: row.importance,
    status: row.status,
    isLocked: Boolean(row.is_locked),
  };
}

function toRelationshipContent(row: RelationshipRow): Record<string, unknown> {
  return {
    id: row.id,
    sourceEntityId: row.source_entity_id ?? null,
    targetEntityId: row.target_entity_id ?? null,
    relationshipType: row.relationship_type,
    summary: row.summary ?? "",
    status: row.status ?? "draft",
  };
}

function toTimelineContent(row: TimelineRow): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    dateLabel: row.date_label ?? "",
    relatedEntityIds: Array.isArray(row.related_entity_ids)
      ? row.related_entity_ids.map(String)
      : [],
    status: row.status ?? "draft",
  };
}

function toAssetContent(row: AssetRow): Record<string, unknown> {
  return {
    id: row.id,
    kind: row.kind ?? "asset",
    name: row.name ?? "",
    status: row.status ?? "draft",
    metadata: row.metadata ?? {},
  };
}

function applyPatch(
  content: Record<string, unknown>,
  patch: LocalStateRow | undefined,
): Record<string, unknown> {
  if (!patch) return content;
    const merged: Record<string, unknown> = { ...content };
  for (const [key, value] of Object.entries(patch.patch_json || {})) {
    if (value !== undefined) merged[key] = value;
  }
  merged.__localPatchRevision = patch.revision;
  return merged;
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function isSelectionMatch(
  type: string,
  id: string,
  selectionEntityType: string | null,
  selectionEntityId: string | null,
): boolean {
  return selectionEntityType === type && selectionEntityId === id;
}

function serializeContent(content: unknown): string {
  try {
    return JSON.stringify(content || "").toLowerCase();
  } catch {
    return "";
  }
}

function isInCurrentScene(entityName: string, sceneText: string): boolean {
  if (!entityName || !sceneText) return false;
  return sceneText.includes(entityName.toLowerCase());
}

function buildReason(
  base: string,
  ...flags: Array<[boolean, string]>
): string {
  const parts: string[] = [base];
  for (const [active, label] of flags) {
    if (active) parts.push(label);
  }
  return parts.join("; ");
}

// ---------------------------------------------------------------------------
// DB fetch helpers (all return [] on error for resilience)
// ---------------------------------------------------------------------------

const MANIFEST_SELECT = "id,work_id,universe_id,universe_version_id,relation,timeline_anchor_id,canon_policy,included_entity_version_ids,included_fact_version_ids,included_relationship_version_ids,included_timeline_event_version_ids,included_asset_version_ids,is_active,superseded_by,created_by,created_at";

async function fetchWorkVersion(
  versionId: string,
  fetcher: ContextPacketFetcher,
): Promise<WorkVersionRow | null> {
  try {
    const rows = await fetcher<WorkVersionRow[]>(
      `/rest/v1/storyflow_work_versions?id=eq.${encodeURIComponent(versionId)}&select=id,work_id,content_json,content_hash&limit=1`,
    );
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

async function fetchWork(
  workId: string,
  fetcher: ContextPacketFetcher,
): Promise<WorkRow | null> {
  try {
    const rows = await fetcher<WorkRow[]>(
      `/rest/v1/storyflow_works?id=eq.${encodeURIComponent(workId)}&select=id,owner_id&limit=1`,
    );
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

async function fetchActiveManifest(
  workId: string,
  fetcher: ContextPacketFetcher,
): Promise<ManifestRow | null> {
  try {
    const rows = await fetcher<ManifestRow[]>(
      `/rest/v1/storyflow_work_inheritance_manifests?work_id=eq.${encodeURIComponent(workId)}&is_active=eq.true&select=${MANIFEST_SELECT}&limit=1`,
    );
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

async function fetchLocalStates(
  workId: string,
  fetcher: ContextPacketFetcher,
): Promise<LocalStateRow[]> {
  try {
    const rows = await fetcher<LocalStateRow[]>(
      `/rest/v1/storyflow_work_local_states?work_id=eq.${encodeURIComponent(workId)}&status=eq.active&select=id,work_id,base_manifest_id,entity_type,entity_id,patch_json,revision,status&limit=500`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function inFilter(ids: string[]): string {
  if (ids.length === 0) return "id=eq.__none__";
  return `id=in.(${ids.map(encodeURIComponent).join(",")})`;
}

async function fetchEntities(
  ids: string[],
  universeId: string,
  fetcher: ContextPacketFetcher,
): Promise<EntityRow[]> {
  if (!ids.length) return [];
  try {
    const rows = await fetcher<EntityRow[]>(
      `/rest/v1/storyflow_universe_entities?${inFilter(ids)}&universe_id=eq.${encodeURIComponent(universeId)}&select=id,universe_id,type,name,summary,status&limit=500`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function fetchFacts(
  ids: string[],
  universeId: string,
  fetcher: ContextPacketFetcher,
): Promise<FactRow[]> {
  if (!ids.length) return [];
  try {
    const rows = await fetcher<FactRow[]>(
      `/rest/v1/storyflow_canon_facts?${inFilter(ids)}&universe_id=eq.${encodeURIComponent(universeId)}&select=id,universe_id,fact_text,category,importance,status,is_locked&limit=500`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function fetchRelationships(
  ids: string[],
  universeId: string,
  fetcher: ContextPacketFetcher,
): Promise<RelationshipRow[]> {
  if (!ids.length) return [];
  try {
    const rows = await fetcher<RelationshipRow[]>(
      `/rest/v1/storyflow_universe_relationships?${inFilter(ids)}&universe_id=eq.${encodeURIComponent(universeId)}&select=id,source_entity_id,target_entity_id,relationship_type,summary,status&limit=500`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function fetchTimelineEvents(
  ids: string[],
  universeId: string,
  fetcher: ContextPacketFetcher,
): Promise<TimelineRow[]> {
  if (!ids.length) return [];
  try {
    const rows = await fetcher<TimelineRow[]>(
      `/rest/v1/storyflow_universe_timeline_events?${inFilter(ids)}&universe_id=eq.${encodeURIComponent(universeId)}&select=id,title,description,date_label,related_entity_ids,status&limit=500`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function fetchAssets(
  ids: string[],
  fetcher: ContextPacketFetcher,
): Promise<AssetRow[]> {
  if (!ids.length) return [];
  try {
    const rows = await fetcher<AssetRow[]>(
      `/rest/v1/storyflow_v2_assets?${inFilter(ids)}&select=id,kind,name,status,metadata&limit=500`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
