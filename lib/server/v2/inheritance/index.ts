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
