export type CanonFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export type CanonCheckTrigger = "outline_confirmed" | "script_finalized" | "storyboard_finalized" | "before_export";

export class CanonError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "validation_failed" | "service_unavailable" | "ai_unavailable";

  constructor(code: CanonError["code"], message: string) {
    super(`${code}: ${message}`);
    this.name = "CanonError";
    this.code = code;
  }
}

type UniverseRow = { id: string; user_id?: string | null; team_id?: string | null; name: string; updated_at: string };
type FactRow = { id: string; universe_id: string; fact_text: string; category: string; importance: string; status: string; is_locked: boolean; updated_at?: string };
type EntityRow = { id: string; universe_id: string; type: string; name: string; summary?: string | null; details_json?: Record<string, unknown> | null; status?: string | null; updated_at?: string };
type LinkRow = { id: string; universe_id: string; project_id: string; updated_at?: string };
type ProjectRow = { id: string; title?: string | null; updated_at?: string | null; universe_id?: string | null };
type SnapshotRow = { id: string; project_id: string; universe_id: string; universe_version: string; payload?: Record<string, unknown> | null; created_at: string; updated_at?: string };

export interface CanonCheckInput {
  trigger?: CanonCheckTrigger;
  mode?: "rules" | "ai";
  target: { id?: string; text: string; category?: string; entityId?: string };
}

export interface CanonIssue {
  id: string;
  severity: "Critical" | "Warning" | "Note";
  category: string;
  message: string;
  target: { id: string | null; content: string };
  relatedCanon: { id: string; content: string; category: string; locked: boolean };
  remediation: string;
}

export async function runCanonCheck(params: { fetcher: CanonFetcher; userId: string; universeId: string; input: CanonCheckInput }) {
  const universe = await assertUniverseAccess(params);
  if (!params.input?.target?.text?.trim()) throw new CanonError("validation_failed", "target.text is required.");
  if (params.input.mode === "ai") throw new CanonError("ai_unavailable", "AI Canon Check is unavailable; no provider is configured. Use rules mode or try again later.");
  const [facts, entities] = await Promise.all([
    query<FactRow[]>(params.fetcher, `/rest/v1/storyflow_canon_facts?universe_id=eq.${encodeURIComponent(params.universeId)}&status=neq.deprecated&select=id,universe_id,fact_text,category,importance,status,is_locked,updated_at&order=importance.desc,updated_at.desc&limit=2000`),
    query<EntityRow[]>(params.fetcher, `/rest/v1/storyflow_universe_entities?universe_id=eq.${encodeURIComponent(params.universeId)}&status=neq.deprecated&select=id,universe_id,type,name,summary,details_json,status,updated_at&limit=2000`),
  ]);
  const target = params.input.target;
  const issues = buildIssues(target, facts || [], entities || []);
  return {
    universeId: universe.id,
    trigger: params.input.trigger || "script_finalized",
    checkedCategories: ["identity", "relationships", "timeline", "world_rules", "locations", "secrets", "production_rules"],
    issues,
    checkedAt: new Date().toISOString(),
  };
}

export async function readCanonImpact(params: { fetcher: CanonFetcher; userId: string; universeId: string; entityId: string }) {
  const universe = await assertUniverseAccess(params);
  if (!params.entityId) throw new CanonError("validation_failed", "entity is required.");
  const [entityRows, links, snapshots] = await Promise.all([
    query<EntityRow[]>(params.fetcher, `/rest/v1/storyflow_universe_entities?id=eq.${encodeURIComponent(params.entityId)}&universe_id=eq.${encodeURIComponent(params.universeId)}&select=id,universe_id,type,name,summary,details_json,status,updated_at&limit=1`),
    query<LinkRow[]>(params.fetcher, `/rest/v1/storyflow_universe_project_links?universe_id=eq.${encodeURIComponent(params.universeId)}&unbound_at=is.null&select=id,universe_id,project_id,updated_at&limit=500`),
    query<SnapshotRow[]>(params.fetcher, `/rest/v1/storyflow_universe_inheritance_snapshots?universe_id=eq.${encodeURIComponent(params.universeId)}&select=id,project_id,universe_id,universe_version,payload,created_at,updated_at&order=created_at.desc&limit=2000`),
  ]);
  const entity = entityRows?.[0];
  if (!entity) throw new CanonError("not_found", "Canon entity not found.");
  const projectIds = Array.from(new Set((links || []).map((link) => link.project_id).filter(Boolean)));
  const filter = projectIds.length ? `id=in.(${projectIds.map(encodeURIComponent).join(",")})` : "id=eq.__none__";
  const projectFilter = projectIds.map(encodeURIComponent).join(",");
  const [projects, characters, scenes, productionProjects, assets, artAssets] = projectIds.length ? await Promise.all([
    query<ProjectRow[]>(params.fetcher, `/rest/v1/storyflow_projects?${filter}&select=id,title,updated_at,universe_id&limit=500`),
    query<Array<{ id: string; project_id: string; name: string }>>(params.fetcher, `/rest/v1/storyflow_characters?project_id=in.(${projectFilter})&select=id,project_id,name&limit=2000`),
    query<Array<{ id: string; project_id: string; location?: string | null }>>(params.fetcher, `/rest/v1/storyflow_scenes?project_id=in.(${projectFilter})&select=id,project_id,location&limit=2000`),
    query<Array<{ id: string; project_id?: string | null; title?: string | null }>>(params.fetcher, `/rest/v1/storyflow_production_projects?project_id=in.(${projectFilter})&select=id,project_id,title&limit=500`),
    query<Array<{ id: string; project_id?: string | null; asset_type?: string | null }>>(params.fetcher, `/rest/v1/storyflow_assets?project_id=in.(${projectFilter})&select=id,project_id,asset_type&limit=2000`),
    query<Array<{ id: string; project_id?: string | null; kind?: string | null }>>(params.fetcher, `/rest/v1/storyflow_art_assets?universe_entity_id=eq.${encodeURIComponent(params.entityId)}&select=id,project_id,kind&limit=2000`),
  ]) : [[], [], [], [], [], []];
  const projectById = new Map((projects || []).map((project) => [project.id, project]));
  return {
    universeId: universe.id,
    entityId: params.entityId,
    entity: { id: entity.id, type: entity.type, name: entity.name, summary: entity.summary || "" },
    works: projectIds.map((id) => ({ id, name: projectById.get(id)?.title || "Untitled work", updatedAt: projectById.get(id)?.updated_at || null })),
    snapshots: (snapshots || []).filter((snapshot) => projectIds.includes(snapshot.project_id)).map((snapshot) => toSnapshotImpact(snapshot, universe.updated_at)),
    characters: (characters || []).map((character) => ({ id: character.id, projectId: character.project_id, name: character.name })),
    scenes: (scenes || []).map((scene) => ({ id: scene.id, projectId: scene.project_id, location: scene.location || "" })),
    storyboards: (productionProjects || []).map((project) => ({ id: project.id, projectId: project.project_id || null, name: project.title || "Untitled storyboard" })),
    assets: [...(assets || []).map((asset) => ({ id: asset.id, projectId: asset.project_id || null, kind: asset.asset_type || "asset" })), ...(artAssets || []).map((asset) => ({ id: asset.id, projectId: asset.project_id || null, kind: asset.kind || "art" }))],
  };
}

export async function listStaleSnapshots(params: { fetcher: CanonFetcher; userId: string; universeId: string }) {
  const universe = await assertUniverseAccess(params);
  const snapshots = await query<SnapshotRow[]>(params.fetcher, `/rest/v1/storyflow_universe_inheritance_snapshots?universe_id=eq.${encodeURIComponent(params.universeId)}&select=id,project_id,universe_id,universe_version,payload,created_at,updated_at&order=created_at.desc&limit=2000`);
  const items = (snapshots || []).filter((snapshot) => snapshot.universe_version < universe.updated_at || snapshot.created_at < universe.updated_at).map((snapshot) => toSnapshotImpact(snapshot, universe.updated_at));
  return { universeId: universe.id, currentUniverseUpdatedAt: universe.updated_at, items };
}

function buildIssues(target: CanonCheckInput["target"], facts: FactRow[], entities: EntityRow[]): CanonIssue[] {
  const text = target.text.trim();
  const normalizedTarget = normalize(text);
  const relevantFacts = facts.filter((fact) => !target.category || categoryMatches(target.category, fact.category));
  const issues: CanonIssue[] = [];
  for (const fact of relevantFacts) {
    const factWords = significantWords(fact.fact_text);
    const sharedSubject = factWords.some((word) => normalizedTarget.includes(word));
    const contradicts = sharedSubject && !normalizedTarget.includes(normalize(fact.fact_text));
    if (!contradicts) continue;
    issues.push({
      id: `canon-conflict:${fact.id}`,
      severity: fact.importance === "critical" || fact.is_locked ? "Critical" : "Warning",
      category: fact.category,
      message: `Target conflicts with locked Canon: ${fact.fact_text}`,
      target: { id: target.id || target.entityId || null, content: text },
      relatedCanon: { id: fact.id, content: fact.fact_text, category: fact.category, locked: fact.is_locked },
      remediation: `Review the target against Canon ${fact.id}; explicitly accept a proposal or revise the target before confirmation.`,
    });
  }
  if (target.entityId && !entities.some((entity) => entity.id === target.entityId)) {
    const fact = relevantFacts[0];
    if (fact) issues.push({ id: `canon-missing-entity:${target.entityId}`, severity: "Warning", category: "identity", message: "Target references an entity that is not present in this Universe.", target: { id: target.entityId, content: text }, relatedCanon: { id: fact.id, content: fact.fact_text, category: fact.category, locked: fact.is_locked }, remediation: "Select an existing Universe entity or submit a reviewed proposal to add one." });
  }
  if (!issues.length && relevantFacts.length) {
    const fact = relevantFacts[0];
    issues.push({ id: `canon-note:${fact.id}`, severity: "Note", category: fact.category, message: "Target was checked against the related Canon fact.", target: { id: target.id || target.entityId || null, content: text }, relatedCanon: { id: fact.id, content: fact.fact_text, category: fact.category, locked: fact.is_locked }, remediation: "No automatic change was made; keep the Canon reference visible during review." });
  }
  return issues;
}

function categoryMatches(target: string, fact: string) {
  const value = target.toLowerCase().replace(/[-_ ]/g, "");
  const other = fact.toLowerCase().replace(/[-_ ]/g, "");
  return value === other || (value === "worldrules" && other === "worldrule") || (value === "productionrules" && other === "productionrule") || (value === "relationships" && other === "relationship") || (value === "locations" && other === "location") || (value === "secrets" && other === "secret");
}

function significantWords(value: string) { return normalize(value).split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)); }
function normalize(value: string) { return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
const STOP_WORDS = new Set(["the", "and", "has", "have", "is", "are", "was", "with", "this", "that", "一个", "是", "的", "在", "与"]);

function toSnapshotImpact(snapshot: SnapshotRow, currentUpdatedAt: string) {
  return { snapshotId: snapshot.id, projectId: snapshot.project_id, universeVersion: snapshot.universe_version, createdAt: snapshot.created_at, stale: snapshot.universe_version < currentUpdatedAt || snapshot.created_at < currentUpdatedAt };
}

async function assertUniverseAccess(params: { fetcher: CanonFetcher; userId: string; universeId: string }) {
  if (!params.userId) throw new CanonError("unauthenticated", "Authentication is required.");
  if (!params.universeId) throw new CanonError("validation_failed", "Universe id is required.");
  const rows = await query<UniverseRow[]>(params.fetcher, `/rest/v1/storyflow_universes?id=eq.${encodeURIComponent(params.universeId)}&select=id,user_id,team_id,name,updated_at&limit=1`);
  const universe = rows?.[0];
  if (!universe) throw new CanonError("not_found", "Universe not found.");
  if (universe.user_id !== params.userId) {
    if (!universe.team_id) throw new CanonError("forbidden", "Universe access denied.");
    const members = await query<Array<{ team_id: string }>>(params.fetcher, `/rest/v1/storyflow_team_members?team_id=eq.${encodeURIComponent(universe.team_id)}&user_id=eq.${encodeURIComponent(params.userId)}&status=eq.active&select=team_id&limit=1`);
    if (!members?.length) throw new CanonError("forbidden", "Universe access denied.");
  }
  return universe;
}

async function query<T>(fetcher: CanonFetcher, path: string, init?: RequestInit): Promise<T> {
  try { return await fetcher<T>(path, init); } catch (error) { if (error instanceof CanonError) throw error; throw new CanonError("service_unavailable", error instanceof Error ? error.message : "Canon service unavailable."); }
}
