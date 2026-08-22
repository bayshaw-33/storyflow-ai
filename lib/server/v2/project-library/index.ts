import { isRetiredNovelRecord } from "../../../v2/retired-novel.ts";
import type {
  ProjectLibraryProject,
  ProjectLibrarySource,
} from "../../../client/v2/project-library/types.ts";

export type ProjectLibraryFetcher = <T = unknown>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

type Row = Record<string, unknown>;

const PROJECT_SELECT = "*";
const CHILD_SELECT = "*";

export async function listProjectLibrary(
  fetcher: ProjectLibraryFetcher,
  ownerId: string,
): Promise<ProjectLibraryProject[]> {
  if (!ownerId) throw new Error("PROJECT_LIBRARY_OWNER_REQUIRED");

  const owner = encodeURIComponent(ownerId);
  const baseRows = await fetcher<Row[]>(
    `/rest/v1/storyflow_projects?or=(owner_id.eq.${owner},user_id.eq.${owner})&select=${PROJECT_SELECT}&order=updated_at.desc`,
  );

  const childResults = await Promise.allSettled([
    fetcher<Row[]>(
      `/rest/v1/storyflow_production_projects?owner_id=eq.${owner}&select=${CHILD_SELECT}&order=updated_at.desc`,
    ),
    fetcher<Row[]>(
      `/rest/v1/storyflow_art_projects?owner_id=eq.${owner}&select=${CHILD_SELECT}&order=updated_at.desc`,
    ),
    fetcher<Row[]>(
      `/rest/v1/storyflow_viral_projects?user_id=eq.${owner}&select=${CHILD_SELECT}&order=updated_at.desc`,
    ),
  ]);

  const projects = baseRows
    .filter((row) => !isRetiredNovelRecord(row))
    .map((row) => projectRow(row));
  const productionRows = settledRows(childResults[0]);
  const artRows = settledRows(childResults[1]);
  const viralRows = settledRows(childResults[2]);

  return [...projects, ...productionRows.map(productionRow), ...artRows.map(artRow), ...viralRows.map(viralRow)]
    .filter((project) => !isRetiredNovelRecord(project))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function settledRows(result: PromiseSettledResult<Row[]>): Row[] {
  return result.status === "fulfilled" && Array.isArray(result.value) ? result.value : [];
}

function projectRow(row: Row): ProjectLibraryProject {
  const data = objectValue(row.data);
  const id = stringValue(row.id);
  return record({
    id,
    title: stringValue(data.title) || stringValue(row.title) || "未命名项目",
    workflowType: normalizeWorkflowType(data.workflowType || row.workflow_type || row.mode),
    status: normalizeStatus(data.status || row.status),
    projectGroup: stringValue(data.projectGroup) || stringValue(row.project_group) || "默认分组",
    universeId: stringValue(data.universeId) || stringValue(row.universe_id) || null,
    genre: stringValue(data.genre) || stringValue(row.genre),
    idea: stringValue(data.idea),
    brief: stringValue(data.brief),
    characters: stringValue(data.characters),
    characterCards: Array.isArray(data.characterCards) ? data.characterCards : [],
    outline: stringValue(data.outline),
    episodes: stringValue(data.episodes),
    existingScript: stringValue(data.existingScript),
    continuationScript: stringValue(data.continuationScript),
    finalScript: stringValue(data.finalScript),
    createdAt: dateValue(row.created_at),
    updatedAt: dateValue(row.updated_at),
    source: "project",
    sourceId: id,
    libraryKey: `project:${id}`,
  });
}

function productionRow(row: Row): ProjectLibraryProject {
  const id = stringValue(row.project_id) || stringValue(row.id);
  const workflowType = normalizeProductionWorkflow(row.workflow_type, row.mode);
  return record({
    id,
    title: stringValue(row.title) || "未命名制作项目",
    workflowType,
    status: "draft",
    universeId: stringValue(row.universe_id) || null,
    createdAt: dateValue(row.created_at),
    updatedAt: dateValue(row.updated_at),
    source: "production",
    sourceId: stringValue(row.id),
    sourceProjectId: stringValue(row.project_id) || null,
    sourceUnitId: stringValue(row.source_unit_id) || null,
    libraryKey: `production:${stringValue(row.id)}`,
  });
}

function artRow(row: Row): ProjectLibraryProject {
  const id = stringValue(row.id);
  return record({
    id: `art-${id}`,
    title: stringValue(row.name) || "未命名美术项目",
    workflowType: "art",
    status: stringValue(row.status) === "archived" ? "draft" : "ready",
    universeId: stringValue(row.universe_id) || null,
    createdAt: dateValue(row.created_at),
    updatedAt: dateValue(row.updated_at),
    source: "art",
    sourceId: id,
    // P0-02：保留与 storyflow_projects 的真实关联，供工作台路由使用
    sourceProjectId: stringValue(row.source_project_id) || null,
    libraryKey: `art:${id}`,
  });
}

function viralRow(row: Row): ProjectLibraryProject {
  const id = stringValue(row.id);
  const hasOutput = Boolean(row.analysis_json || row.remake_json || row.remake_markdown);
  return record({
    id: `viral-${id}`,
    title: stringValue(row.title) || "未命名改编项目",
    workflowType: "viral",
    status: hasOutput ? "ready" : "draft",
    createdAt: dateValue(row.created_at),
    updatedAt: dateValue(row.updated_at),
    source: "viral",
    sourceId: id,
    libraryKey: `viral:${id}`,
  });
}

function record(input: Partial<ProjectLibraryProject> & Pick<ProjectLibraryProject, "id" | "title" | "workflowType" | "createdAt" | "updatedAt">) {
  return {
    status: "draft",
    projectGroup: "默认分组",
    universeId: null,
    ...input,
  } as ProjectLibraryProject;
}

function normalizeWorkflowType(value: unknown) {
  if (value === "script") return "creation";
  if (value === "continuation" || value === "song" || value === "viral" || value === "art" || value === "storyboard" || value === "video" || value === "voice" || value === "editing") return value;
  return "creation";
}

function normalizeProductionWorkflow(workflowType: unknown, mode: unknown) {
  if (workflowType === "video" || mode === "editor") return "video";
  return "storyboard";
}

function normalizeStatus(value: unknown) {
  if (value === "ready" || value === "generating" || value === "error") return value;
  return "draft";
}

function objectValue(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function dateValue(value: unknown) {
  return typeof value === "string" && value ? value : new Date(0).toISOString();
}

export function projectLibrarySource(value: unknown): ProjectLibrarySource {
  return value === "production" || value === "art" || value === "viral" ? value : "project";
}
