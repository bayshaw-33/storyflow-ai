import type {
  Universe as UniverseDto,
  UniverseEntity,
  UniverseEntityKind,
  Project,
} from "@/lib/contracts/v2";
import { isRetiredNovelRecord } from "../../../v2/retired-novel.ts";

export type UniverseReadFetcher = <T = unknown>(path: string) => Promise<T>;

export class V2UniverseError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "service_unavailable" | "validation_failed";

  constructor(code: "unauthenticated" | "forbidden" | "not_found" | "service_unavailable" | "validation_failed", message: string) {
    super(`${code}: ${message}`);
    this.name = "V2UniverseError";
    this.code = code;
  }
}

type UniverseRow = {
  id: string;
  name: string;
  description?: string | null;
  card_summary?: string | null;
  status?: string | null;
  updated_at: string;
  user_id?: string | null;
  team_id?: string | null;
  metadata?: Record<string, unknown> | null;
  genre?: string | null;
};

type EntityRow = {
  id: string;
  universe_id: string;
  type: string;
  name: string;
  summary?: string | null;
  status?: string | null;
  updated_at: string;
};

type LinkRow = { id: string; universe_id: string; project_id: string; project_role?: string | null; updated_at: string };
type ProjectRow = { id: string; title?: string | null; workflow_type?: string | null; mode?: string | null; data?: Record<string, unknown> | null; status?: string | null; updated_at: string };
type InboxRow = { id: string; universe_id: string; status: string; item_type?: string | null; title?: string | null; confidence?: number | null; updated_at: string };

export interface UniverseListItem extends UniverseDto {
  workCount: number;
  characterCount: number;
  locationCount: number;
  pendingInboxCount: number;
  tags: string[];
}

export interface UniverseListResult {
  items: UniverseListItem[];
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface UniverseReadResult {
  universe: UniverseDto;
  bible: { summary: string; content: string; genre: string; tags: string[] };
}

export interface UniverseEntityResult {
  items: UniverseEntity[];
}

export interface UniverseWorkResult {
  items: Project[];
}

export interface HealthDimension {
  key: "canon_completeness" | "character_completeness" | "relationship_timeline_completeness" | "asset_coverage" | "pending_proposals" | "conflicts_and_stale_snapshots";
  label: string;
  todos: string[];
}

export interface UniverseHealthResult {
  dimensions: HealthDimension[];
}

export function toUniverseDto(row: UniverseRow): UniverseDto {
  return {
    id: row.id,
    name: row.name,
    summary: buildUniverseDisplaySummary(row.card_summary, row.description),
    status: row.status === "archived" ? "deprecated" : "draft",
    visibility: row.team_id ? "team" : "private",
    currentVersion: "legacy",
    updatedAt: row.updated_at,
  };
}

export async function listUniverses(params: {
  fetcher: UniverseReadFetcher;
  userId: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<UniverseListResult> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(50, Math.max(1, params.limit || 20));
  const teamIds = await readTeamIds(params.fetcher, params.userId);
  const access = teamIds.length
    ? `or=(user_id.eq.${encodeURIComponent(params.userId)},team_id.in.(${teamIds.map(encodeURIComponent).join(",")}))`
    : `user_id=eq.${encodeURIComponent(params.userId)}`;
  const rows = await query<UniverseRow[]>(params.fetcher, `/rest/v1/storyflow_universes?${access}&archived_at=is.null&order=updated_at.desc&limit=${limit + 1}`);
  const filtered = (rows || []).filter((row) => !params.search || `${row.name} ${row.card_summary || row.description || ""}`.toLowerCase().includes(params.search.toLowerCase()));
  const pageRows = filtered.slice((page - 1) * limit, page * limit);
  const summaries = await aggregateUniverseRows(params.fetcher, pageRows);
  return { items: summaries, page, limit, hasMore: filtered.length > page * limit };
}

export async function readUniverse(params: { fetcher: UniverseReadFetcher; userId: string; universeId: string }): Promise<UniverseReadResult> {
  const row = await readAuthorizedUniverse(params);
  const dto = toUniverseDto(row);
  return {
    universe: dto,
    bible: {
      summary: dto.summary,
      content: normalizeBibleContent(row.description || ""),
      genre: row.genre || "",
      tags: readTags(row.metadata),
    },
  };
}

export async function readUniverseEntities(params: { fetcher: UniverseReadFetcher; userId: string; universeId: string }): Promise<UniverseEntityResult> {
  await readAuthorizedUniverse(params);
  const rows = await query<EntityRow[]>(params.fetcher, `/rest/v1/storyflow_universe_entities?universe_id=eq.${encodeURIComponent(params.universeId)}&select=id,universe_id,type,name,summary,status,updated_at&order=updated_at.desc&limit=500`);
  return { items: (rows || []).map(toEntityDto) };
}

export async function readUniverseWorks(params: { fetcher: UniverseReadFetcher; userId: string; universeId: string }): Promise<UniverseWorkResult> {
  await readAuthorizedUniverse(params);
  const links = await query<LinkRow[]>(params.fetcher, `/rest/v1/storyflow_universe_project_links?universe_id=eq.${encodeURIComponent(params.universeId)}&select=id,universe_id,project_id,project_role,updated_at&order=updated_at.desc&limit=500`);
  const projectIds = Array.from(new Set((links || []).map((link) => link.project_id).filter(Boolean)));
  if (!projectIds.length) return { items: [] };
  const projects = await query<ProjectRow[]>(params.fetcher, `/rest/v1/storyflow_projects?id=in.(${projectIds.map(encodeURIComponent).join(",")})&select=id,title,workflow_type,mode,data,status,updated_at`);
  const projectById = new Map((projects || []).filter((project) => !isRetiredNovelRecord(project)).map((project) => [project.id, project]));
  return { items: (links || [])
    .filter((link) => projectById.has(link.project_id))
    .map((link) => toProjectDto(projectById.get(link.project_id), link)) };
}

export async function readUniverseHealth(params: { fetcher: UniverseReadFetcher; userId: string; universeId: string }): Promise<UniverseHealthResult> {
  await readAuthorizedUniverse(params);
  const filter = `universe_id=eq.${encodeURIComponent(params.universeId)}`;
  const [entities, relationships, timeline, canonFacts, inbox, links] = await Promise.all([
    query<EntityRow[]>(params.fetcher, `/rest/v1/storyflow_universe_entities?${filter}&select=id,type,status`),
    query<Array<{ id: string }>>(params.fetcher, `/rest/v1/storyflow_universe_relationships?${filter}&select=id`),
    query<Array<{ id: string }>>(params.fetcher, `/rest/v1/storyflow_universe_timeline_events?${filter}&select=id`),
    query<Array<{ id: string; is_locked: boolean }>>(params.fetcher, `/rest/v1/storyflow_canon_facts?${filter}&select=id,is_locked`),
    query<InboxRow[]>(params.fetcher, `/rest/v1/storyflow_universe_inbox_items?${filter}&status=eq.pending&select=id`),
    query<LinkRow[]>(params.fetcher, `/rest/v1/storyflow_universe_project_links?${filter}&select=id,project_id`),
  ]);
  const characterCount = (entities || []).filter((entity) => entity.type === "character").length;
  const lockedCanonCount = (canonFacts || []).filter((fact) => fact.is_locked).length;
  const dimensions: HealthDimension[] = [
    { key: "canon_completeness", label: "Canon 完整性", todos: lockedCanonCount ? [] : ["确认至少一条锁定 Canon Fact"] },
    { key: "character_completeness", label: "角色完整度", todos: characterCount ? [] : ["补充至少一个角色实体"] },
    { key: "relationship_timeline_completeness", label: "关系和时间线完整度", todos: relationships?.length && timeline?.length ? [] : ["补充关系和时间线"] },
    { key: "asset_coverage", label: "资产覆盖", todos: entities?.length ? [] : ["为 Universe 添加可复用实体"] },
    { key: "pending_proposals", label: "待处理候选", todos: inbox?.length ? [`处理 ${inbox.length} 条候选变更`] : [] },
    { key: "conflicts_and_stale_snapshots", label: "冲突与过期快照", todos: links?.length ? [] : ["将 Universe 绑定到至少一个项目"] },
  ];
  return { dimensions };
}

async function readAuthorizedUniverse(params: { fetcher: UniverseReadFetcher; userId: string; universeId: string }): Promise<UniverseRow> {
  if (!params.userId) throw new V2UniverseError("unauthenticated", "Authentication is required.");
  if (!params.universeId) throw new V2UniverseError("validation_failed", "Universe id is required.");
  const rows = await query<UniverseRow[]>(params.fetcher, `/rest/v1/storyflow_universes?id=eq.${encodeURIComponent(params.universeId)}&select=id,name,description,card_summary,status,updated_at,user_id,team_id,metadata,genre&limit=1`);
  const row = rows?.[0];
  if (!row) throw new V2UniverseError("not_found", "Universe not found.");
  if (row.user_id !== params.userId && !(row.team_id && (await readTeamIds(params.fetcher, params.userId)).includes(row.team_id))) {
    throw new V2UniverseError("forbidden", "Universe access denied.");
  }
  return row;
}

async function aggregateUniverseRows(fetcher: UniverseReadFetcher, rows: UniverseRow[]): Promise<UniverseListItem[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const filter = `universe_id=in.(${ids.map(encodeURIComponent).join(",")})`;
  const [entities, inbox, links] = await Promise.all([
    query<EntityRow[]>(fetcher, `/rest/v1/storyflow_universe_entities?${filter}&select=universe_id,type`),
    query<Array<{ universe_id: string; status: string }>>(fetcher, `/rest/v1/storyflow_universe_inbox_items?${filter}&select=universe_id,status`),
    query<Array<{ universe_id: string; project_id: string }>>(fetcher, `/rest/v1/storyflow_universe_project_links?${filter}&select=universe_id,project_id`),
  ]);
  return rows.map((row) => {
    const universeEntities = (entities || []).filter((entity) => entity.universe_id === row.id);
    const universeInbox = (inbox || []).filter((item) => item.universe_id === row.id && item.status === "pending");
    const universeLinks = new Set((links || []).filter((link) => link.universe_id === row.id).map((link) => link.project_id));
    return {
      ...toUniverseDto(row),
      tags: readTags(row.metadata),
      workCount: universeLinks.size,
      characterCount: universeEntities.filter((entity) => entity.type === "character").length,
      locationCount: universeEntities.filter((entity) => entity.type === "location").length,
      pendingInboxCount: universeInbox.length,
    };
  });
}

function toEntityDto(row: EntityRow): UniverseEntity {
  const validKinds: UniverseEntityKind[] = ["character", "location", "organization", "object", "rule", "concept"];
  return { id: row.id, universeId: row.universe_id, kind: validKinds.includes(row.type as UniverseEntityKind) ? row.type as UniverseEntityKind : "concept", name: row.name, summary: row.summary || "", status: row.status === "canon" || row.status === "alternative" || row.status === "deprecated" ? row.status : "draft", updatedAt: row.updated_at };
}

function toProjectDto(row: ProjectRow | undefined, link: LinkRow): Project {
  return { id: link.project_id, name: row?.title || "Untitled project", contentType: mapContentType(row?.workflow_type), productionStage: mapProductionStage(row?.status), universeId: link.universe_id, updatedAt: row?.updated_at || link.updated_at };
}

function mapContentType(value: string | null | undefined): Project["contentType"] {
  if (value === "script" || value === "song" || value === "storyboard" || value === "video") return value;
  return value === "production" ? "short_drama" : "other";
}

function mapProductionStage(value: string | null | undefined): Project["productionStage"] {
  if (value === "draft") return "idea";
  if (value === "completed") return "exported";
  return "structure";
}

function readTags(metadata: Record<string, unknown> | null | undefined): string[] {
  return Array.isArray(metadata?.tags) ? metadata.tags.map(String).filter(Boolean).slice(0, 10) : [];
}

function buildUniverseDisplaySummary(cardSummary?: string | null, description?: string | null): string {
  const explicitSummary = normalizeSummaryText(cardSummary || "");
  if (explicitSummary) return shortenSummary(explicitSummary);

  const source = normalizeSummaryText(description || "");
  const synopsisMatch = /(?:[一二三四五六七八九十]+、\s*)?(?:长简介|故事简介|项目简介|核心设定|世界观简介)\s*[:：]?\s*/u.exec(source);
  const candidate = synopsisMatch ? source.slice((synopsisMatch.index || 0) + synopsisMatch[0].length) : source;
  return shortenSummary(candidate);
}

function normalizeSummaryText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[|｜]{2,}/g, " ")
    .replace(/[-—]{3,}/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function shortenSummary(value: string): string {
  const compact = value.trim();
  if (compact.length <= 180) return compact;
  return `${compact.slice(0, 179).trimEnd()}…`;
}

function normalizeBibleContent(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[|｜]{2,}/g, "\n")
    .replace(/[-—]{3,}/g, "\n")
    .replace(/\s*([一二三四五六七八九十]+、)/g, "\n$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readTeamIds(fetcher: UniverseReadFetcher, userId: string): Promise<string[]> {
  const rows = await query<Array<{ team_id: string }>>(fetcher, `/rest/v1/storyflow_team_members?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=team_id`);
  return (rows || []).map((row) => row.team_id).filter(Boolean);
}

async function query<T>(fetcher: UniverseReadFetcher, path: string): Promise<T> {
  try {
    return await fetcher<T>(path);
  } catch (error) {
    if (error instanceof V2UniverseError) throw error;
    throw new V2UniverseError("service_unavailable", error instanceof Error ? error.message : "Universe service unavailable.");
  }
}
