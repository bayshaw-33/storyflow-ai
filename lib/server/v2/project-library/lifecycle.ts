import type { ProjectLibrarySource } from "../../../client/v2/project-library/types.ts";
import type { ProjectLibraryFetcher } from "./index.ts";

type Row = Record<string, unknown>;

export type ProjectDeleteDecision = "safe_to_delete" | "archive_only" | "not_found";

export type ProjectDeletePreflight = {
  source: ProjectLibrarySource;
  sourceId: string;
  title: string;
  decision: ProjectDeleteDecision;
  reason: string;
  relatedCounts: {
    works: number;
    screenplayUnits: number;
    generationTasks: number;
    assets: number;
    universeLinks: number;
  };
};

type ProjectDeleteInput = {
  source: ProjectLibrarySource;
  sourceId: string;
};

const EMPTY_COUNTS: ProjectDeletePreflight["relatedCounts"] = {
  works: 0,
  screenplayUnits: 0,
  generationTasks: 0,
  assets: 0,
  universeLinks: 0,
};

export async function getProjectDeletePreflight(
  fetcher: ProjectLibraryFetcher,
  ownerId: string,
  input: ProjectDeleteInput,
): Promise<ProjectDeletePreflight> {
  const sourceId = input.sourceId.trim();
  const source = input.source;
  if (!ownerId || !sourceId) return notFound(source, sourceId);

  const row = await readOwnedRow(fetcher, ownerId, source, sourceId);
  if (!row) return notFound(source, sourceId);

  if (source !== "project") {
    return hasChildOutput(source, row)
      ? archiveOnly(source, sourceId, titleFor(source, row), EMPTY_COUNTS)
      : safeToDelete(source, sourceId, titleFor(source, row), EMPTY_COUNTS);
  }

  const relatedCounts = await readRelatedCounts(fetcher, ownerId, sourceId);
  if (hasPrimaryContent(row) || hasMeaningfulPrimaryRelations(relatedCounts)) {
    return archiveOnly(source, sourceId, titleFor(source, row), relatedCounts);
  }
  return safeToDelete(source, sourceId, titleFor(source, row), relatedCounts);
}

function hasMeaningfulPrimaryRelations(counts: ProjectDeletePreflight["relatedCounts"]) {
  return counts.screenplayUnits > 0
    || counts.generationTasks > 0
    || counts.assets > 0
    || counts.universeLinks > 0;
}

export async function setPrimaryProjectArchiveState(
  fetcher: ProjectLibraryFetcher,
  ownerId: string,
  sourceId: string,
  action: "archive" | "restore",
) {
  const id = encodeURIComponent(sourceId);
  const owner = encodeURIComponent(ownerId);
  const rows = await fetcher<Row[]>(
    `/rest/v1/storyflow_projects?id=eq.${id}&or=(owner_id.eq.${owner},user_id.eq.${owner})`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        deleted_at: action === "archive" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("PROJECT_NOT_FOUND_OR_FORBIDDEN");
  return rows[0];
}

export async function deletePreflightedProject(
  fetcher: ProjectLibraryFetcher,
  ownerId: string,
  input: ProjectDeleteInput,
) {
  const preflight = await getProjectDeletePreflight(fetcher, ownerId, input);
  if (preflight.decision === "not_found") throw new Error("PROJECT_NOT_FOUND_OR_FORBIDDEN");
  if (preflight.decision !== "safe_to_delete") throw new Error("PROJECT_ARCHIVE_ONLY");

  const owner = encodeURIComponent(ownerId);
  const sourceId = encodeURIComponent(input.sourceId);
  const table = projectLibraryTable(input.source);
  const ownerFilter = input.source === "project"
    ? `or=(owner_id.eq.${owner},user_id.eq.${owner})`
    : `${input.source === "viral" ? "user_id" : "owner_id"}=eq.${owner}`;
  const rows = await fetcher<Row[]>(`/rest/v1/${table}?id=eq.${sourceId}&${ownerFilter}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("PROJECT_NOT_FOUND_OR_FORBIDDEN");
  return { preflight, deleted: rows[0] };
}

export function projectLibraryTable(source: ProjectLibrarySource) {
  if (source === "production") return "storyflow_production_projects";
  if (source === "art") return "storyflow_art_projects";
  if (source === "viral") return "storyflow_viral_projects";
  return "storyflow_projects";
}

async function readOwnedRow(
  fetcher: ProjectLibraryFetcher,
  ownerId: string,
  source: ProjectLibrarySource,
  sourceId: string,
): Promise<Row | null> {
  const owner = encodeURIComponent(ownerId);
  const id = encodeURIComponent(sourceId);
  const path = source === "project"
    ? `/rest/v1/storyflow_projects?id=eq.${id}&or=(owner_id.eq.${owner},user_id.eq.${owner})&select=*&limit=1`
    : source === "production"
      ? `/rest/v1/storyflow_production_projects?id=eq.${id}&owner_id=eq.${owner}&select=*&limit=1`
      : source === "art"
        ? `/rest/v1/storyflow_art_projects?id=eq.${id}&owner_id=eq.${owner}&select=*&limit=1`
        : `/rest/v1/storyflow_viral_projects?id=eq.${id}&user_id=eq.${owner}&select=*&limit=1`;
  const rows = await fetcher<Row[]>(path);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function readRelatedCounts(
  fetcher: ProjectLibraryFetcher,
  ownerId: string,
  projectId: string,
): Promise<ProjectDeletePreflight["relatedCounts"]> {
  const owner = encodeURIComponent(ownerId);
  const project = encodeURIComponent(projectId);
  const works = await fetcher<Row[]>(`/rest/v1/storyflow_works?project_id=eq.${project}&owner_id=eq.${owner}&select=id`);
  const workIds = Array.isArray(works)
    ? works.map((work) => stringValue(work.id)).filter(Boolean)
    : [];
  const screenplayUnits = workIds.length > 0
    ? await fetcher<Row[]>(`/rest/v1/storyflow_screenplay_units?work_id=in.(${workIds.map(encodeURIComponent).join(",")})&select=id`)
    : [];
  const [generationTasks, assets, universeLinks] = await Promise.all([
    fetcher<Row[]>(`/rest/v1/storyflow_generation_tasks?project_id=eq.${project}&user_id=eq.${owner}&select=id`),
    fetcher<Row[]>(`/rest/v1/storyflow_assets?project_id=eq.${project}&user_id=eq.${owner}&select=id`),
    fetcher<Row[]>(`/rest/v1/storyflow_universe_project_links?project_id=eq.${project}&user_id=eq.${owner}&select=id`),
  ]);
  return {
    works: rowCount(works),
    screenplayUnits: rowCount(screenplayUnits),
    generationTasks: rowCount(generationTasks),
    assets: rowCount(assets),
    universeLinks: rowCount(universeLinks),
  };
}

function hasPrimaryContent(row: Row) {
  const data = objectValue(row.data);
  return ["idea", "brief", "characters", "outline", "episodes", "finalScript"]
    .some((key) => hasMeaningfulValue(data[key]));
}

function hasChildOutput(source: ProjectLibrarySource, row: Row) {
  if (source === "production") {
    return ["source_summary", "selected_shot_id", "story_brief", "visual_bible", "chat_messages", "history"]
      .some((key) => hasMeaningfulValue(row[key]));
  }
  if (source === "art") return hasMeaningfulValue(row.asset_manifest) || hasMeaningfulValue(row.data);
  if (source === "viral") return hasMeaningfulValue(row.analysis_json) || hasMeaningfulValue(row.remake_json) || hasMeaningfulValue(row.remake_markdown);
  return false;
}

function safeToDelete(
  source: ProjectLibrarySource,
  sourceId: string,
  title: string,
  relatedCounts: ProjectDeletePreflight["relatedCounts"],
): ProjectDeletePreflight {
  return { source, sourceId, title, decision: "safe_to_delete", reason: "未发现创作内容或关联记录。", relatedCounts };
}

function archiveOnly(
  source: ProjectLibrarySource,
  sourceId: string,
  title: string,
  relatedCounts: ProjectDeletePreflight["relatedCounts"],
): ProjectDeletePreflight {
  return { source, sourceId, title, decision: "archive_only", reason: "项目含有创作内容或关联记录，建议归档。", relatedCounts };
}

function notFound(source: ProjectLibrarySource, sourceId: string): ProjectDeletePreflight {
  return { source, sourceId, title: "", decision: "not_found", reason: "项目不存在或你无权管理。", relatedCounts: EMPTY_COUNTS };
}

function titleFor(source: ProjectLibrarySource, row: Row) {
  return stringValue(source === "art" ? row.name : row.title) || "未命名项目";
}

function objectValue(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasMeaningfulValue(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

function rowCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}
