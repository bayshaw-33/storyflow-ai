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
type RelationshipRow = { id: string; source_entity_id?: string | null; target_entity_id?: string | null; relationship_type: string; summary?: string | null; status?: string | null };
type TimelineRow = { id: string; title: string; description?: string | null; date_label?: string | null; status?: string | null };
type LinkRow = { id: string; universe_id: string; project_id: string; user_id?: string | null; updated_at?: string };
type ProjectRow = { id: string; title?: string | null; owner_id?: string | null; user_id?: string | null; updated_at?: string | null; universe_id?: string | null };
type ArtProjectRow = { id: string; owner_id?: string | null; universe_id?: string | null; source_project_id?: string | null };
type SnapshotRow = { id: string; project_id: string; universe_id: string; universe_version: string; payload?: Record<string, unknown> | null; created_at: string; updated_at?: string };

export interface CanonCheckInput {
  trigger?: CanonCheckTrigger;
  mode?: "rules" | "ai";
  target: { id?: string; text: string; category?: string; entityId?: string };
}

export function validateCanonCheckInput(value: unknown): CanonCheckInput {
  if (!value || typeof value !== "object") throw new CanonError("validation_failed", "Request body must be an object.");
  const input = value as Record<string, unknown>;
  const triggers: CanonCheckTrigger[] = ["outline_confirmed", "script_finalized", "storyboard_finalized", "before_export"];
  const trigger = input.trigger === undefined ? "script_finalized" : input.trigger;
  const mode = input.mode === undefined ? "rules" : input.mode;
  const target = input.target;
  if (!triggers.includes(trigger as CanonCheckTrigger)) throw new CanonError("validation_failed", "Unsupported Canon Check trigger.");
  if (mode !== "rules" && mode !== "ai") throw new CanonError("validation_failed", "Unsupported Canon Check mode.");
  if (!target || typeof target !== "object" || typeof (target as Record<string, unknown>).text !== "string") throw new CanonError("validation_failed", "target.text is required.");
  const targetRecord = target as Record<string, unknown>;
  const categories = ["identity", "character", "relationship", "relationships", "timeline", "world_rule", "world_rules", "location", "locations", "secret", "secrets", "production_rule", "production_rules"];
  if (targetRecord.category !== undefined && (typeof targetRecord.category !== "string" || !categories.includes(targetRecord.category))) throw new CanonError("validation_failed", "Unsupported Canon target category.");
  for (const key of ["id", "entityId"]) if (targetRecord[key] !== undefined && typeof targetRecord[key] !== "string") throw new CanonError("validation_failed", `${key} must be a string.`);
  return { trigger: trigger as CanonCheckTrigger, mode: mode as "rules" | "ai", target: target as CanonCheckInput["target"] };
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
  const input = validateCanonCheckInput(params.input);
  if (!input.target.text.trim()) throw new CanonError("validation_failed", "target.text is required.");
  if (input.mode === "ai") throw new CanonError("ai_unavailable", "AI Canon Check is unavailable; no provider is configured. Use rules mode or try again later.");
  const [facts, entities, relationships, timeline] = await Promise.all([
    query<FactRow[]>(params.fetcher, `/rest/v1/storyflow_canon_facts?universe_id=eq.${encodeURIComponent(params.universeId)}&status=eq.canon&is_locked=eq.true&select=id,universe_id,fact_text,category,importance,status,is_locked,updated_at&order=importance.desc,updated_at.desc&limit=2000`),
    query<EntityRow[]>(params.fetcher, `/rest/v1/storyflow_universe_entities?universe_id=eq.${encodeURIComponent(params.universeId)}&status=neq.deprecated&select=id,universe_id,type,name,summary,details_json,status,updated_at&limit=2000`),
    query<RelationshipRow[]>(params.fetcher, `/rest/v1/storyflow_universe_relationships?universe_id=eq.${encodeURIComponent(params.universeId)}&status=eq.canon&select=id,source_entity_id,target_entity_id,relationship_type,summary,status&limit=2000`),
    query<TimelineRow[]>(params.fetcher, `/rest/v1/storyflow_universe_timeline_events?universe_id=eq.${encodeURIComponent(params.universeId)}&status=eq.canon&select=id,title,description,date_label,status&limit=2000`),
  ]);
  const references = [
    ...(facts || []).map((fact) => ({ id: fact.id, content: fact.fact_text, category: canonicalCategory(fact.category), locked: fact.is_locked, importance: fact.importance })),
    ...(timeline || []).map((event) => ({ id: event.id, content: [event.title, event.description, event.date_label].filter(Boolean).join(" — "), category: "timeline", locked: event.status === "canon", importance: "medium" })),
    ...(relationships || []).map((relationship) => ({ id: relationship.id, content: [relationship.relationship_type, relationship.summary].filter(Boolean).join(": "), category: "relationship", locked: relationship.status === "canon", importance: "medium" })),
  ];
  const issues = buildIssues(input.target, references, entities || []);
  return {
    universeId: universe.id,
    trigger: input.trigger,
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
    query<LinkRow[]>(params.fetcher, `/rest/v1/storyflow_universe_project_links?universe_id=eq.${encodeURIComponent(params.universeId)}&unbound_at=is.null&select=id,universe_id,project_id,user_id,updated_at&limit=500`),
    query<SnapshotRow[]>(params.fetcher, `/rest/v1/storyflow_universe_inheritance_snapshots?universe_id=eq.${encodeURIComponent(params.universeId)}&select=id,project_id,universe_id,universe_version,payload,created_at,updated_at&order=created_at.desc&limit=2000`),
  ]);
  const entity = entityRows?.[0];
  if (!entity) throw new CanonError("not_found", "Canon entity not found.");
  const linkedProjectIds = Array.from(new Set((links || []).map((link) => link.project_id).filter(Boolean)));
  const filter = linkedProjectIds.length ? `id=in.(${linkedProjectIds.map(encodeURIComponent).join(",")})` : "id=eq.__none__";
  const allProjects = await query<ProjectRow[]>(params.fetcher, `/rest/v1/storyflow_projects?${filter}&select=id,title,owner_id,user_id,updated_at,universe_id&limit=500`);
  const projectById = new Map((allProjects || []).map((project) => [project.id, project]));
  const authorizedProjectIds = linkedProjectIds.filter((projectId) => {
    const link = (links || []).find((candidate) => candidate.project_id === projectId);
    const project = projectById.get(projectId);
    return project?.owner_id === params.userId || project?.user_id === params.userId;
  });
  const projectFilter = authorizedProjectIds.map(encodeURIComponent).join(",");
  const artProjects = authorizedProjectIds.length
    ? await query<ArtProjectRow[]>(params.fetcher, `/rest/v1/storyflow_art_projects?source_project_id=in.(${projectFilter})&owner_id=eq.${encodeURIComponent(params.userId)}&select=id,owner_id,universe_id,source_project_id&limit=500`)
    : [];
  const artProjectIds = (artProjects || []).map((project) => encodeURIComponent(project.id));
  const [characters, scenes, productionProjects, assets, artAssets] = authorizedProjectIds.length ? await Promise.all([
    query<Array<{ id: string; project_id: string; user_id?: string | null; name: string; content_json?: Record<string, unknown> | null }>>(params.fetcher, `/rest/v1/storyflow_characters?project_id=in.(${projectFilter})&user_id=eq.${encodeURIComponent(params.userId)}&select=id,project_id,user_id,name,content_json&limit=2000`),
    query<Array<{ id: string; project_id: string; user_id?: string | null; location?: string | null; characters?: unknown; beats?: unknown }>>(params.fetcher, `/rest/v1/storyflow_scenes?project_id=in.(${projectFilter})&user_id=eq.${encodeURIComponent(params.userId)}&select=id,project_id,user_id,location,characters,beats&limit=2000`),
    query<Array<{ id: string; project_id?: string | null; owner_id?: string | null; title?: string | null }>>(params.fetcher, `/rest/v1/storyflow_production_projects?project_id=in.(${projectFilter})&owner_id=eq.${encodeURIComponent(params.userId)}&select=id,project_id,owner_id,title&limit=500`),
    query<Array<{ id: string; project_id?: string | null; user_id?: string | null; asset_type?: string | null; metadata?: Record<string, unknown> | null }>>(params.fetcher, `/rest/v1/storyflow_assets?project_id=in.(${projectFilter})&user_id=eq.${encodeURIComponent(params.userId)}&select=id,project_id,user_id,asset_type,metadata&limit=2000`),
    query<Array<{ id: string; project_id?: string | null; created_by?: string | null; kind?: string | null }>>(params.fetcher, artProjectIds.length ? `/rest/v1/storyflow_art_assets?universe_entity_id=eq.${encodeURIComponent(params.entityId)}&project_id=in.(${artProjectIds.join(",")})&created_by=eq.${encodeURIComponent(params.userId)}&select=id,project_id,created_by,kind&limit=2000` : "/rest/v1/storyflow_art_assets?id=eq.__none__&select=id,project_id,created_by,kind"),
  ]) : [[], [], [], [], []];
  const productionIds = (productionProjects || []).map((project) => encodeURIComponent(project.id));
  const productionShots = productionIds.length
    ? await query<Array<{ id: string; production_project_id: string; character_refs?: unknown; scene_refs?: unknown; prop_refs?: unknown }>>(params.fetcher, `/rest/v1/storyflow_production_shots?production_project_id=in.(${productionIds.join(",")})&select=id,production_project_id,character_refs,scene_refs,prop_refs&limit=5000`)
    : [];
  const entityName = entity.name;
  const entityTokens = [params.entityId, entityName].filter((value): value is string => Boolean(value)).map(normalize);
  const matchesEntity = (value: unknown) => entityTokens.some((token) => token && normalize(JSON.stringify(value || "")).includes(token));
  const affectedCharacters = (characters || []).filter((character) => normalize(character.name || "").includes(normalize(entityName)) || matchesEntity(character.content_json));
  const affectedScenes = (scenes || []).filter((scene) => normalize(scene.location || "").includes(normalize(entityName)) || matchesEntity(scene.characters) || matchesEntity(scene.beats));
  const affectedShots = (productionShots || []).filter((shot) => matchesEntity([shot.character_refs, shot.scene_refs, shot.prop_refs]));
  const affectedProductionIds = new Set(affectedShots.map((shot) => shot.production_project_id));
  const affectedStoryboards = (productionProjects || []).filter((project) => affectedProductionIds.has(project.id));
  const affectedAssets = [
    ...(assets || []).filter((asset) => matchesEntity(asset.metadata)).map((asset) => ({ id: asset.id, projectId: asset.project_id || null, kind: asset.asset_type || "asset" })),
    ...(artAssets || []).map((asset) => ({ id: asset.id, projectId: asset.project_id || null, kind: asset.kind || "art" })),
  ];
  const affectedProjectIds = new Set([
    ...affectedCharacters.map((item) => item.project_id),
    ...affectedScenes.map((item) => item.project_id),
    ...(affectedStoryboards || []).map((item) => item.project_id).filter((value): value is string => Boolean(value)),
    ...affectedAssets.map((item) => item.projectId).filter((value): value is string => Boolean(value)),
    ...(snapshots || []).filter((snapshot) => authorizedProjectIds.includes(snapshot.project_id) && snapshotTouchesEntity(snapshot, params.entityId, entity.name)).map((snapshot) => snapshot.project_id),
  ]);
  const projectIds = authorizedProjectIds.filter((projectId) => affectedProjectIds.has(projectId));
  return {
    universeId: universe.id,
    entityId: params.entityId,
    entity: { id: entity.id, type: entity.type, name: entity.name, summary: entity.summary || "" },
    works: projectIds.map((id) => ({ id, name: projectById.get(id)?.title || "Untitled work", updatedAt: projectById.get(id)?.updated_at || null })),
    snapshots: (snapshots || []).filter((snapshot) => projectIds.includes(snapshot.project_id) && snapshotTouchesEntity(snapshot, params.entityId, entity.name)).map((snapshot) => toSnapshotImpact(snapshot, universe.updated_at)),
    characters: affectedCharacters.map((character) => ({ id: character.id, projectId: character.project_id, name: character.name })),
    scenes: affectedScenes.map((scene) => ({ id: scene.id, projectId: scene.project_id, location: scene.location || "" })),
    storyboards: affectedStoryboards.map((project) => ({ id: project.id, projectId: project.project_id || null, name: project.title || "Untitled storyboard", shotIds: affectedShots.filter((shot) => shot.production_project_id === project.id).map((shot) => shot.id) })),
    assets: affectedAssets,
  };
}

export async function listStaleSnapshots(params: { fetcher: CanonFetcher; userId: string; universeId: string }) {
  const universe = await assertUniverseAccess(params);
  const projectIds = await readAuthorizedProjectIds(params);
  const snapshots = await query<SnapshotRow[]>(params.fetcher, `/rest/v1/storyflow_universe_inheritance_snapshots?universe_id=eq.${encodeURIComponent(params.universeId)}&select=id,project_id,universe_id,universe_version,payload,created_at,updated_at&order=created_at.desc&limit=2000`);
  const items = (snapshots || []).filter((snapshot) => projectIds.includes(snapshot.project_id) && (snapshot.universe_version < universe.updated_at || snapshot.created_at < universe.updated_at)).map((snapshot) => toSnapshotImpact(snapshot, universe.updated_at));
  return { universeId: universe.id, currentUniverseUpdatedAt: universe.updated_at, items };
}

function buildIssues(target: CanonCheckInput["target"], facts: Array<{ id: string; content: string; category: string; locked: boolean; importance: string }>, entities: EntityRow[]): CanonIssue[] {
  const text = target.text.trim();
  const relevantFacts = facts.filter((fact) => !target.category || categoryMatches(target.category, fact.category));
  const issues: CanonIssue[] = [];
  for (const fact of relevantFacts) {
    const contradicts = hasContradictoryAssertion(text, fact.content);
    if (!contradicts) continue;
    issues.push({
      id: `canon-conflict:${fact.id}`,
      severity: fact.importance === "critical" || fact.locked ? "Critical" : "Warning",
      category: fact.category,
      message: `Target conflicts with Canon: ${fact.content}`,
      target: { id: target.id || target.entityId || null, content: text },
      relatedCanon: { id: fact.id, content: fact.content, category: fact.category, locked: fact.locked },
      remediation: `Review the target against Canon ${fact.id}; explicitly accept a proposal or revise the target before confirmation.`,
    });
  }
  if (target.entityId && !entities.some((entity) => entity.id === target.entityId)) {
    const fact = relevantFacts[0];
    if (fact) issues.push({ id: `canon-missing-entity:${target.entityId}`, severity: "Warning", category: "identity", message: "Target references an entity that is not present in this Universe.", target: { id: target.entityId, content: text }, relatedCanon: { id: fact.id, content: fact.content, category: fact.category, locked: fact.locked }, remediation: "Select an existing Universe entity or submit a reviewed proposal to add one." });
  }
  if (!issues.length && relevantFacts.length) {
    const fact = relevantFacts[0];
    issues.push({ id: `canon-note:${fact.id}`, severity: "Note", category: fact.category, message: "Target was checked against the related Canon fact.", target: { id: target.id || target.entityId || null, content: text }, relatedCanon: { id: fact.id, content: fact.content, category: fact.category, locked: fact.locked }, remediation: "No automatic change was made; keep the Canon reference visible during review." });
  }
  return issues;
}

function categoryMatches(target: string, fact: string) {
  const value = target.toLowerCase().replace(/[-_ ]/g, "");
  const other = fact.toLowerCase().replace(/[-_ ]/g, "");
  return value === other || (value === "identity" && (other === "character" || other === "identity")) || (value === "character" && (other === "character" || other === "identity")) || (value === "worldrules" && other === "worldrule") || (value === "productionrules" && other === "productionrule") || (value === "relationships" && other === "relationship") || (value === "locations" && other === "location") || (value === "secrets" && other === "secret");
}

function normalize(value: unknown) { return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
const STOP_WORDS = new Set(["the", "and", "has", "have", "is", "are", "was", "with", "this", "that", "一个", "是", "的", "在", "与"]);

function canonicalCategory(value: string) { return value === "character" ? "identity" : value === "world_rule" ? "world_rules" : value === "production_rule" ? "production_rules" : value; }

function hasContradictoryAssertion(target: string, canon: string) {
  const targetAssertion = splitAssertion(target);
  const canonAssertion = splitAssertion(canon);
  if (!targetAssertion || !canonAssertion) return false;
  const sameSubject = targetAssertion.subject.some((word) => canonAssertion.subject.includes(word));
  return sameSubject && targetAssertion.value.some((word) => !canonAssertion.value.includes(word)) && canonAssertion.value.some((word) => !targetAssertion.value.includes(word));
}

function splitAssertion(value: string) {
  const match = value.match(/^(.+?)\s+(?:is|are|was|were|has|have|为|是|有|拥有)\s+(.+)$/i);
  if (!match) return null;
  return { subject: normalize(match[1]).split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)), value: normalize(match[2]).split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)) };
}

function toSnapshotImpact(snapshot: SnapshotRow, currentUpdatedAt: string) {
  return { snapshotId: snapshot.id, projectId: snapshot.project_id, universeVersion: snapshot.universe_version, createdAt: snapshot.created_at, stale: snapshot.universe_version < currentUpdatedAt || snapshot.created_at < currentUpdatedAt };
}

function snapshotTouchesEntity(snapshot: SnapshotRow, entityId: string, entityName: string) {
  return normalize(JSON.stringify(snapshot.payload || "")).includes(normalize(entityId)) || normalize(JSON.stringify(snapshot.payload || "")).includes(normalize(entityName));
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

async function readAuthorizedProjectIds(params: { fetcher: CanonFetcher; userId: string; universeId: string }) {
  const links = await query<LinkRow[]>(params.fetcher, `/rest/v1/storyflow_universe_project_links?universe_id=eq.${encodeURIComponent(params.universeId)}&unbound_at=is.null&select=project_id,user_id&limit=500`);
  const linkedIds = Array.from(new Set((links || []).map((link) => link.project_id).filter(Boolean)));
  if (!linkedIds.length) return [];
  const projects = await query<ProjectRow[]>(params.fetcher, `/rest/v1/storyflow_projects?id=in.(${linkedIds.map(encodeURIComponent).join(",")})&select=id,owner_id,user_id&limit=500`);
  const projectById = new Map((projects || []).map((project) => [project.id, project]));
  return linkedIds.filter((projectId) => {
    const link = (links || []).find((candidate) => candidate.project_id === projectId);
    const project = projectById.get(projectId);
    return project?.owner_id === params.userId || project?.user_id === params.userId;
  });
}

async function query<T>(fetcher: CanonFetcher, path: string, init?: RequestInit): Promise<T> {
  try { return await fetcher<T>(path, init); } catch (error) { if (error instanceof CanonError) throw error; throw new CanonError("service_unavailable", error instanceof Error ? error.message : "Canon service unavailable."); }
}
