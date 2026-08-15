import { isRetiredNovelRecord } from "../../../v2/retired-novel.ts";
import type { ProjectLibraryProject } from "./types.ts";

export type ProjectLibrarySort = "updated" | "created" | "title";
export type ProjectLibraryFilters = {
  query: string;
  workflow: string;
  status: string;
  universe: "all" | "bound" | "unbound";
  sort: ProjectLibrarySort;
};

const CREATION_PROGRESS_FIELDS = [
  "idea",
  "brief",
  "characters",
  "outline",
  "episodes",
  "finalScript",
] as const;

const CONTINUATION_PROGRESS_FIELDS = [
  "existingScript",
  "continuationScript",
  "finalScript",
] as const;

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

function timestamp(value: string | undefined) {
  const parsed = Date.parse(value || "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isRetiredNovelProject(project: ProjectLibraryProject) {
  return isRetiredNovelRecord(project) || project.workflowType === "novel";
}

export function getProjectProgress(project: ProjectLibraryProject): number | null {
  const fields = project.workflowType === "continuation"
    ? CONTINUATION_PROGRESS_FIELDS
    : project.workflowType === "creation"
      ? CREATION_PROGRESS_FIELDS
      : null;

  if (!fields) return null;
  const completed = fields.filter((field) => hasText(project[field])).length;
  return Math.round((completed / fields.length) * 100);
}

export function filterAndSortProjects(
  projects: ProjectLibraryProject[],
  filters: ProjectLibraryFilters,
): ProjectLibraryProject[] {
  const query = normalized(filters.query);
  const workflow = normalized(filters.workflow);
  const status = normalized(filters.status);

  return projects
    .filter((project) => !isRetiredNovelProject(project))
    .filter((project) => !query || [project.title, project.genre, project.id].some((value) => normalized(value).includes(query)))
    .filter((project) => filters.workflow === "all" || normalized(project.workflowType) === workflow)
    .filter((project) => filters.status === "all" || normalized(project.status) === status)
    .filter((project) => filters.universe === "all" || (filters.universe === "bound" ? Boolean(project.universeId) : !project.universeId))
    .sort((left, right) => {
      if (filters.sort === "title") return left.title.localeCompare(right.title, "zh-CN");
      if (filters.sort === "created") return timestamp(right.createdAt) - timestamp(left.createdAt);
      return timestamp(right.updatedAt) - timestamp(left.updatedAt);
    });
}

export function getProjectWorkbenchHref(project: ProjectLibraryProject) {
  const projectId = encodeURIComponent(project.id);
  const sourceUnitId = encodeURIComponent(project.sourceUnitId || `project-${project.id}`);
  if (project.workflowType === "song") return `/song-workbench?projectId=${projectId}`;
  if (project.workflowType === "storyboard") return `/production?projectId=${projectId}&sourceUnitId=${sourceUnitId}&mode=planning`;
  if (project.workflowType === "video") return `/production?projectId=${projectId}&sourceUnitId=${sourceUnitId}&mode=editor`;
  if (project.workflowType === "art") return `/production?projectId=${projectId}&sourceUnitId=${sourceUnitId}&mode=art`;
  if (project.workflowType === "voice") return `/casting?projectId=${projectId}`;
  if (project.workflowType === "editing") return `/editor?projectId=${projectId}&sourceUnitId=${sourceUnitId}`;
  if (project.workflowType === "viral") {
    const viralProjectId = project.id.startsWith("viral-") ? project.id.slice("viral-".length) : project.id;
    return `/viral-workbench?projectId=${encodeURIComponent(viralProjectId)}&dashboardProjectId=${projectId}`;
  }
  return `/script-workbench?projectId=${projectId}`;
}
