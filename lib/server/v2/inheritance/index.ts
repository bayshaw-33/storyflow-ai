import type { InheritanceSnapshot } from "@/lib/contracts/v2";

export type InheritanceFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export class InheritanceError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "conflict" | "validation_failed" | "service_unavailable";

  constructor(code: InheritanceError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "InheritanceError";
    this.code = code;
  }
}

type ProjectRow = { id: string; owner_id?: string | null; user_id?: string | null; universe_id?: string | null; title?: string | null; updated_at: string };
type UniverseRow = { id: string; user_id?: string | null; team_id?: string | null; name: string; updated_at: string };
type LinkRow = { id: string; universe_id: string; project_id: string; user_id?: string | null; project_role?: string | null; inheritance_settings?: Record<string, unknown> | null; unbound_at?: string | null; created_at: string; updated_at: string };
type SnapshotRow = { id: string; project_id: string; universe_id: string; universe_version: string; payload: Record<string, unknown>; created_at: string; updated_at: string };
type EntityRow = { id: string; universe_id: string; type: string; name: string; summary: string; status: string; updated_at: string };

export async function bindUniverse(params: { fetcher: InheritanceFetcher; userId: string; projectId: string; universeId: string }) {
  const [project, universe] = await Promise.all([readProject(params), readUniverse(params)]);
  assertOwner(project, params.userId);
  await assertUniverseAccess(universe, params.userId, params.fetcher);
  const links = await query<LinkRow[]>(params.fetcher, `/rest/v1/storyflow_universe_project_links?project_id=eq.${encodeURIComponent(params.projectId)}&unbound_at=is.null&select=id,universe_id,project_id,user_id,project_role,inheritance_settings,unbound_at,created_at,updated_at&limit=10`);
  const existing = (links || []).find((link) => link.universe_id === params.universeId);
  if (existing) return { link: toLinkDto(existing), created: false };
  if ((links || []).length) throw new InheritanceError("conflict", "Project already has a primary Universe.");
  const rows = await query<LinkRow[]>(params.fetcher, "/rest/v1/storyflow_universe_project_links", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ universe_id: params.universeId, project_id: params.projectId, user_id: params.userId, project_role: "main_season", inheritance_settings: {} }),
  });
  const link = rows?.[0];
  if (!link) throw new InheritanceError("service_unavailable", "Unable to bind Universe.");
  await writeBindingHistory(params.fetcher, {
    projectId: params.projectId,
    universeId: params.universeId,
    userId: params.userId,
    action: "bound",
    sourceLinkId: link.id,
  });
  return { link: toLinkDto(link), created: true };
}

export async function unbindUniverse(params: { fetcher: InheritanceFetcher; userId: string; projectId: string }) {
  const project = await readProject(params);
  assertOwner(project, params.userId);
  const links = await query<LinkRow[]>(params.fetcher, `/rest/v1/storyflow_universe_project_links?project_id=eq.${encodeURIComponent(params.projectId)}&unbound_at=is.null&select=id,universe_id,project_id,user_id,project_role,inheritance_settings,unbound_at,created_at,updated_at&limit=10`);
  if (!links?.length) throw new InheritanceError("not_found", "Project is not bound to a Universe.");
  await query(params.fetcher, `/rest/v1/storyflow_universe_project_links?id=eq.${encodeURIComponent(links[0].id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ unbound_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
  await writeBindingHistory(params.fetcher, {
    projectId: params.projectId,
    universeId: links[0].universe_id,
    userId: params.userId,
    action: "unbound",
    sourceLinkId: links[0].id,
  });
  return { unbound: true, historyId: links[0].id };
}

export async function createInheritanceSnapshot(params: { fetcher: InheritanceFetcher; userId: string; projectId: string }) {
  const project = await readProject(params);
  assertOwner(project, params.userId);
  const link = await readActiveLink(params);
  const entities = await query<EntityRow[]>(params.fetcher, `/rest/v1/storyflow_universe_entities?universe_id=eq.${encodeURIComponent(link.universe_id)}&select=id,universe_id,type,name,summary,status,updated_at&order=updated_at.asc&limit=2000`);
  const payload = { entities: (entities || []).map((entity) => ({ id: entity.id, type: entity.type, name: entity.name, summary: entity.summary, status: entity.status, updatedAt: entity.updated_at })) };
  const rows = await query<SnapshotRow[]>(params.fetcher, "/rest/v1/storyflow_universe_inheritance_snapshots", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ project_id: params.projectId, universe_id: link.universe_id, universe_version: new Date().toISOString(), payload, created_by: params.userId }),
  });
  const snapshot = rows?.[0];
  if (!snapshot) throw new InheritanceError("service_unavailable", "Unable to create inheritance snapshot.");
  return { snapshot: toSnapshotDto(snapshot) };
}

export async function readInheritanceSnapshot(params: { fetcher: InheritanceFetcher; userId: string; projectId: string }) {
  const project = await readProject(params);
  assertOwner(project, params.userId);
  const rows = await query<SnapshotRow[]>(params.fetcher, `/rest/v1/storyflow_universe_inheritance_snapshots?project_id=eq.${encodeURIComponent(params.projectId)}&select=id,project_id,universe_id,universe_version,payload,created_at,updated_at&order=created_at.desc&limit=1`);
  const snapshot = rows?.[0];
  if (!snapshot) throw new InheritanceError("not_found", "Inheritance snapshot not found.");
  return { snapshot: toSnapshotDto(snapshot) };
}

export async function diffInheritanceSnapshot(params: { fetcher: InheritanceFetcher; userId: string; projectId: string }) {
  const current = await readInheritanceSnapshot(params);
  const entities = await query<EntityRow[]>(params.fetcher, `/rest/v1/storyflow_universe_entities?universe_id=eq.${encodeURIComponent(current.snapshot.universeId)}&select=id,universe_id,type,name,summary,status,updated_at&order=updated_at.asc&limit=2000`);
  const oldEntities = Array.isArray(current.snapshot.payload.entities) ? current.snapshot.payload.entities as Array<Record<string, unknown>> : [];
  const oldById = new Map(oldEntities.map((entity) => [String(entity.id), entity]));
  const fields: Array<{ path: string; before: unknown; after: unknown; impact: "added" | "changed" | "removed" }> = [];
  for (const entity of entities || []) {
    const next = { type: entity.type, name: entity.name, summary: entity.summary, status: entity.status, updatedAt: entity.updated_at };
    const previous = oldById.get(entity.id);
    if (!previous) fields.push({ path: `entities.${entity.id}`, before: null, after: next, impact: "added" });
    else for (const key of Object.keys(next) as Array<keyof typeof next>) if (previous[key] !== next[key]) fields.push({ path: `entities.${entity.id}.${key}`, before: previous[key], after: next[key], impact: "changed" });
    oldById.delete(entity.id);
  }
  for (const [id, previous] of oldById) fields.push({ path: `entities.${id}`, before: previous, after: null, impact: "removed" });
  return { snapshot: current.snapshot, fields, upgradeRequired: fields.length > 0, impacts: fields.map((field) => ({ path: field.path, reason: "Project snapshot differs from current Universe." })) };
}

async function readProject(params: { fetcher: InheritanceFetcher; userId: string; projectId: string }) {
  if (!params.userId) throw new InheritanceError("unauthenticated", "Authentication is required.");
  if (!params.projectId) throw new InheritanceError("validation_failed", "Project id is required.");
  const rows = await query<ProjectRow[]>(params.fetcher, `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(params.projectId)}&select=id,owner_id,user_id,universe_id,title,updated_at&limit=1`);
  const project = rows?.[0];
  if (!project) throw new InheritanceError("not_found", "Project not found.");
  return project;
}

async function readUniverse(params: { fetcher: InheritanceFetcher; userId: string; universeId: string }) {
  const rows = await query<UniverseRow[]>(params.fetcher, `/rest/v1/storyflow_universes?id=eq.${encodeURIComponent(params.universeId)}&select=id,user_id,team_id,name,updated_at&limit=1`);
  const universe = rows?.[0];
  if (!universe) throw new InheritanceError("not_found", "Universe not found.");
  return universe;
}

async function readActiveLink(params: { fetcher: InheritanceFetcher; userId: string; projectId: string }) {
  const rows = await query<LinkRow[]>(params.fetcher, `/rest/v1/storyflow_universe_project_links?project_id=eq.${encodeURIComponent(params.projectId)}&unbound_at=is.null&select=id,universe_id,project_id,user_id,project_role,inheritance_settings,unbound_at,created_at,updated_at&limit=1`);
  if (!rows?.[0]) throw new InheritanceError("conflict", "Project must be bound to a Universe first.");
  return rows[0];
}

function assertOwner(project: ProjectRow, userId: string) {
  if (project.owner_id !== userId && project.user_id !== userId) throw new InheritanceError("forbidden", "Project access denied.");
}

async function assertUniverseAccess(universe: UniverseRow, userId: string, fetcher: InheritanceFetcher) {
  if (universe.user_id === userId) return;
  if (!universe.team_id) throw new InheritanceError("forbidden", "Universe access denied.");
  const memberships = await query<Array<{ team_id: string }>>(
    fetcher,
    `/rest/v1/storyflow_team_members?team_id=eq.${encodeURIComponent(universe.team_id)}&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=team_id&limit=1`,
  );
  if (!memberships?.length) throw new InheritanceError("forbidden", "Universe access denied.");
}

async function writeBindingHistory(
  fetcher: InheritanceFetcher,
  input: { projectId: string; universeId: string; userId: string; action: "bound" | "unbound"; sourceLinkId: string },
) {
  await query(fetcher, "/rest/v1/storyflow_universe_binding_history", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      project_id: input.projectId,
      universe_id: input.universeId,
      user_id: input.userId,
      action: input.action,
      source_link_id: input.sourceLinkId,
    }),
  });
}

function toLinkDto(row: LinkRow) {
  return { id: row.id, projectId: row.project_id, universeId: row.universe_id, role: row.project_role || "main_season", settings: row.inheritance_settings || {}, boundAt: row.created_at, unboundAt: row.unbound_at || null };
}

function toSnapshotDto(row: SnapshotRow): InheritanceSnapshot & { payload: Record<string, unknown> } {
  const entities = Array.isArray(row.payload?.entities) ? row.payload.entities as Array<{ id: string }> : [];
  return { id: row.id, projectId: row.project_id, universeId: row.universe_id, universeVersion: row.universe_version, includedObjectIds: entities.map((entity) => entity.id), createdAt: row.created_at, payload: row.payload };
}

async function query<T>(fetcher: InheritanceFetcher, path: string, init?: RequestInit): Promise<T> {
  try { return await fetcher<T>(path, init); }
  catch (error) { if (error instanceof InheritanceError) throw error; throw new InheritanceError("service_unavailable", error instanceof Error ? error.message : "Inheritance service unavailable."); }
}

// ===========================================================================
// V2.2 Work-level Universe Inheritance (Phase 2 Task 2.2)
//
// The legacy functions above (bindUniverse, unbindUniverse,
// createInheritanceSnapshot, readInheritanceSnapshot, diffInheritanceSnapshot)
// handle project-level binding and remain unchanged. The functions below
// handle the newer Work-level binding introduced in K22-P2, going through the
// SECURITY DEFINER RPC `bind_work_to_universe_v22` for atomicity.
// ===========================================================================

export class InheritanceV22Error extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "conflict" | "validation_failed" | "service_unavailable";

  constructor(code: InheritanceV22Error["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "InheritanceV22Error";
    this.code = code;
  }
}

export interface WorkInheritanceManifestV22Row {
  id: string;
  workId: string;
  universeId: string;
  universeVersionId: string;
  relation: string;
  timelineAnchorId: string | null;
  canonPolicy: string;
  includedEntityVersionIds: string[];
  includedFactVersionIds: string[];
  includedRelationshipVersionIds: string[];
  includedTimelineEventVersionIds: string[];
  includedAssetVersionIds: string[];
  isActive: boolean;
  supersededBy: string | null;
  createdBy: string;
  createdAt: string;
}

export interface UniverseVersionV22Row {
  id: string;
  universeId: string;
  versionNo: number;
  contentHash: string;
  objectIndex: Record<string, string[]>;
  createdBy: string;
  createdAt: string;
}

export interface WorkInheritanceSnapshotV22Row {
  id: string;
  manifestId: string;
  workId: string;
  universeVersionId: string;
  snapshotHash: string;
  objectSnapshot: Record<string, unknown>;
  createdAt: string;
}

const V22_WORK_RELATIONS = new Set([
  "canon_continuation",
  "prequel",
  "sequel",
  "spinoff",
  "adaptation",
  "parallel",
]);

const V22_CANON_POLICIES = new Set(["strict", "flexible", "reference_only"]);

const V22_MANIFEST_SELECT =
  "id,work_id,universe_id,universe_version_id,relation,timeline_anchor_id,canon_policy,included_entity_version_ids,included_fact_version_ids,included_relationship_version_ids,included_timeline_event_version_ids,included_asset_version_ids,is_active,superseded_by,created_by,created_at";

const V22_VERSION_SELECT = "id,universe_id,version_no,content_hash,object_index,created_by,created_at";

const V22_SNAPSHOT_SELECT = "id,manifest_id,work_id,universe_version_id,snapshot_hash,object_snapshot,created_at";

/**
 * Bind a Work to a Universe atomically via the `bind_work_to_universe_v22` RPC.
 *
 * The RPC validates ownership, object membership, finds-or-creates a Universe
 * Version, and inserts the Manifest + Snapshot in a single transaction. This
 * function adds input validation, idempotency (returns the existing active
 * manifest if bind params match), and error mapping on top of the RPC.
 */
export async function bindWorkToUniverseV22(input: {
  fetcher: InheritanceFetcher;
  ownerId: string;
  workId: string;
  universeId: string;
  relation: "canon_continuation" | "prequel" | "sequel" | "spinoff" | "adaptation" | "parallel";
  canonPolicy: "strict" | "flexible" | "reference_only";
  timelineAnchorId?: string | null;
  includedEntityIds?: string[];
  includedFactIds?: string[];
  includedRelationshipIds?: string[];
  includedTimelineEventIds?: string[];
  includedAssetIds?: string[];
}): Promise<WorkInheritanceManifestV22Row> {
  if (!input.ownerId) throw new InheritanceV22Error("unauthenticated", "ownerId is required.");
  if (!input.workId) throw new InheritanceV22Error("validation_failed", "workId is required.");
  if (!input.universeId) throw new InheritanceV22Error("validation_failed", "universeId is required.");
  if (!V22_WORK_RELATIONS.has(input.relation)) {
    throw new InheritanceV22Error("validation_failed", `Unsupported relation: ${input.relation}`);
  }
  if (!V22_CANON_POLICIES.has(input.canonPolicy)) {
    throw new InheritanceV22Error("validation_failed", `Unsupported canonPolicy: ${input.canonPolicy}`);
  }

  // Idempotency: if there is already an active manifest with identical bind
  // params, return it without calling the RPC. The RPC always supersedes, so
  // this guard makes duplicate binds (e.g. from-Universe pre-bind retry) a
  // no-op instead of creating a redundant supersession chain.
  const existing = await readActiveManifestV22(input.fetcher, input.workId);
  if (existing && isSameBindParams(existing, input)) {
    return existing;
  }

  const rpcBody = {
    p_work_id: input.workId,
    p_universe_id: input.universeId,
    p_relation: input.relation,
    p_canon_policy: input.canonPolicy,
    p_timeline_anchor_id: input.timelineAnchorId ?? null,
    p_included_entity_ids: input.includedEntityIds ?? [],
    p_included_fact_ids: input.includedFactIds ?? [],
    p_included_relationship_ids: input.includedRelationshipIds ?? [],
    p_included_timeline_event_ids: input.includedTimelineEventIds ?? [],
    p_included_asset_ids: input.includedAssetIds ?? [],
    p_caller_id: input.ownerId,
  };

  let row: unknown;
  try {
    row = await input.fetcher("/rest/v1/rpc/bind_work_to_universe_v22", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(rpcBody),
    });
  } catch (error) {
    throw mapRpcError(error);
  }

  if (!row || typeof row !== "object") {
    throw new InheritanceV22Error("service_unavailable", "Bind RPC returned no manifest.");
  }
  return toManifestV22Row(row as Record<string, unknown>);
}

/**
 * Read the current active inheritance for a Work.
 *
 * Returns `{ manifest: null, universeVersion: null, snapshot: null }` when the
 * Work is not bound. When bound, validates work ownership before returning the
 * manifest + universe version + snapshot.
 */
export async function readWorkInheritanceV22(input: {
  fetcher: InheritanceFetcher;
  ownerId: string;
  workId: string;
}): Promise<{
  manifest: WorkInheritanceManifestV22Row | null;
  universeVersion: UniverseVersionV22Row | null;
  snapshot: WorkInheritanceSnapshotV22Row | null;
}> {
  if (!input.ownerId) throw new InheritanceV22Error("unauthenticated", "ownerId is required.");
  if (!input.workId) throw new InheritanceV22Error("validation_failed", "workId is required.");

  const manifest = await readActiveManifestV22(input.fetcher, input.workId);
  if (!manifest) {
    return { manifest: null, universeVersion: null, snapshot: null };
  }

  // Validate work ownership before returning manifest data. The service-role
  // fetcher bypasses RLS, so we must enforce ownership here.
  await assertWorkOwnerV22(input.fetcher, input.workId, input.ownerId);

  const [universeVersion, snapshot] = await Promise.all([
    readUniverseVersionV22(input.fetcher, manifest.universeVersionId),
    readSnapshotV22(input.fetcher, manifest.id),
  ]);

  return { manifest, universeVersion, snapshot };
}

/**
 * Read the latest Universe Version for a Universe (highest version_no).
 *
 * Used by the diff/adopt service (Phase 2 Task 2.4) to determine whether a
 * Work's bound snapshot is stale. Returns null if no versions exist.
 */
export async function readLatestUniverseVersionV22(
  fetcher: InheritanceFetcher,
  universeId: string,
): Promise<UniverseVersionV22Row | null> {
  const rows = await query<unknown[]>(
    fetcher,
    `/rest/v1/storyflow_universe_versions?universe_id=eq.${encodeURIComponent(universeId)}&select=${V22_VERSION_SELECT}&order=version_no.desc&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row || typeof row !== "object") return null;
  return toUniverseVersionV22Row(row as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// V2.2 internal helpers
// ---------------------------------------------------------------------------

async function readActiveManifestV22(
  fetcher: InheritanceFetcher,
  workId: string,
): Promise<WorkInheritanceManifestV22Row | null> {
  const rows = await query<unknown[]>(fetcher, `/rest/v1/storyflow_work_inheritance_manifests?work_id=eq.${encodeURIComponent(workId)}&is_active=eq.true&select=${V22_MANIFEST_SELECT}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row || typeof row !== "object") return null;
  return toManifestV22Row(row as Record<string, unknown>);
}

async function assertWorkOwnerV22(fetcher: InheritanceFetcher, workId: string, ownerId: string): Promise<void> {
  const rows = await query<Array<{ id: string; owner_id?: string | null }>>(fetcher, `/rest/v1/storyflow_works?id=eq.${encodeURIComponent(workId)}&select=id,owner_id&limit=1`);
  const work = rows?.[0];
  if (!work) throw new InheritanceV22Error("not_found", "Work not found.");
  if (work.owner_id !== ownerId) throw new InheritanceV22Error("forbidden", "Work access denied.");
}

async function readUniverseVersionV22(fetcher: InheritanceFetcher, versionId: string): Promise<UniverseVersionV22Row | null> {
  const rows = await query<unknown[]>(fetcher, `/rest/v1/storyflow_universe_versions?id=eq.${encodeURIComponent(versionId)}&select=${V22_VERSION_SELECT}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row || typeof row !== "object") return null;
  return toUniverseVersionV22Row(row as Record<string, unknown>);
}

async function readSnapshotV22(fetcher: InheritanceFetcher, manifestId: string): Promise<WorkInheritanceSnapshotV22Row | null> {
  const rows = await query<unknown[]>(fetcher, `/rest/v1/storyflow_work_inheritance_snapshots?manifest_id=eq.${encodeURIComponent(manifestId)}&select=${V22_SNAPSHOT_SELECT}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row || typeof row !== "object") return null;
  return toSnapshotV22Row(row as Record<string, unknown>);
}

function isSameBindParams(
  manifest: WorkInheritanceManifestV22Row,
  input: {
    universeId: string;
    relation: string;
    canonPolicy: string;
    timelineAnchorId?: string | null;
    includedEntityIds?: string[];
    includedFactIds?: string[];
    includedRelationshipIds?: string[];
    includedTimelineEventIds?: string[];
    includedAssetIds?: string[];
  },
): boolean {
  if (manifest.universeId !== input.universeId) return false;
  if (manifest.relation !== input.relation) return false;
  if (manifest.canonPolicy !== input.canonPolicy) return false;
  if ((manifest.timelineAnchorId ?? null) !== (input.timelineAnchorId ?? null)) return false;
  if (!stringArrayEq(manifest.includedEntityVersionIds, input.includedEntityIds ?? [])) return false;
  if (!stringArrayEq(manifest.includedFactVersionIds, input.includedFactIds ?? [])) return false;
  if (!stringArrayEq(manifest.includedRelationshipVersionIds, input.includedRelationshipIds ?? [])) return false;
  if (!stringArrayEq(manifest.includedTimelineEventVersionIds, input.includedTimelineEventIds ?? [])) return false;
  if (!stringArrayEq(manifest.includedAssetVersionIds, input.includedAssetIds ?? [])) return false;
  return true;
}

function stringArrayEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function mapRpcError(error: unknown): InheritanceV22Error {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("MISSING_CALLER")) return new InheritanceV22Error("unauthenticated", "Missing caller.");
  if (msg.includes("FORBIDDEN")) return new InheritanceV22Error("forbidden", "Work access denied.");
  if (msg.includes("UNIVERSE_ACCESS_DENIED")) return new InheritanceV22Error("forbidden", "Universe access denied.");
  if (msg.includes("WORK_NOT_FOUND")) return new InheritanceV22Error("not_found", "Work not found.");
  if (msg.includes("UNIVERSE_NOT_FOUND")) return new InheritanceV22Error("not_found", "Universe not found.");
  if (
    msg.includes("ENTITY_NOT_IN_UNIVERSE") ||
    msg.includes("FACT_NOT_IN_UNIVERSE") ||
    msg.includes("RELATIONSHIP_NOT_IN_UNIVERSE") ||
    msg.includes("TIMELINE_EVENT_NOT_IN_UNIVERSE") ||
    msg.includes("ASSET_NOT_FOUND")
  ) {
    return new InheritanceV22Error("validation_failed", "One or more included objects do not belong to the Universe.");
  }
  if (msg.includes("INVALID_RELATION") || msg.includes("INVALID_CANON_POLICY")) {
    return new InheritanceV22Error("validation_failed", "Invalid relation or canon policy.");
  }
  if (error instanceof InheritanceV22Error) return error;
  return new InheritanceV22Error("service_unavailable", msg || "Bind RPC failed.");
}

function toManifestV22Row(row: Record<string, unknown>): WorkInheritanceManifestV22Row {
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

function toUniverseVersionV22Row(row: Record<string, unknown>): UniverseVersionV22Row {
  const rawIndex = row.object_index;
  const objectIndex: Record<string, string[]> = {};
  if (rawIndex && typeof rawIndex === "object") {
    for (const [key, value] of Object.entries(rawIndex as Record<string, unknown>)) {
      objectIndex[key] = asStringArray(value);
    }
  }
  return {
    id: String(row.id),
    universeId: String(row.universe_id),
    versionNo: Number(row.version_no),
    contentHash: String(row.content_hash),
    objectIndex,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
  };
}

function toSnapshotV22Row(row: Record<string, unknown>): WorkInheritanceSnapshotV22Row {
  const rawSnapshot = row.object_snapshot;
  const objectSnapshot: Record<string, unknown> =
    rawSnapshot && typeof rawSnapshot === "object"
      ? (rawSnapshot as Record<string, unknown>)
      : {};
  return {
    id: String(row.id),
    manifestId: String(row.manifest_id),
    workId: String(row.work_id),
    universeVersionId: String(row.universe_version_id),
    snapshotHash: String(row.snapshot_hash),
    objectSnapshot,
    createdAt: String(row.created_at),
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v));
}
