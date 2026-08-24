import type { ProjectDeletePreflight, ProjectLibraryProject } from "./types.ts";

export class ProjectLibraryClientError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ProjectLibraryClientError";
    this.status = status;
  }
}

export async function fetchProjectLibrary(accessToken: string, view: "active" | "archived" = "active"): Promise<ProjectLibraryProject[]> {
  const response = await fetch(`/api/v2/project-library?view=${view}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.success || !Array.isArray(body.projects)) {
    throw new ProjectLibraryClientError(body?.error || "项目数据加载失败。", response.status);
  }
  return body.projects as ProjectLibraryProject[];
}

export async function fetchProjectDeletePreflight(
  accessToken: string,
  project: Pick<ProjectLibraryProject, "id" | "source" | "sourceId">,
): Promise<ProjectDeletePreflight> {
  const response = await fetch("/api/v2/project-library/preflight-delete", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ source: project.source || "project", sourceId: project.sourceId || project.id }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.success || !body?.preflight) {
    throw new ProjectLibraryClientError(body?.error || "项目清理检查失败。", response.status);
  }
  return body.preflight as ProjectDeletePreflight;
}

export async function archiveProjectFromLibrary(
  accessToken: string,
  project: Pick<ProjectLibraryProject, "id" | "source" | "sourceId">,
  action: "archive" | "restore",
) {
  const response = await fetch("/api/v2/project-library", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ source: project.source || "project", sourceId: project.sourceId || project.id, action }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.success) {
    throw new ProjectLibraryClientError(body?.error || "项目归档失败。", response.status);
  }
}

export async function deleteProjectFromLibrary(
  accessToken: string,
  project: Pick<ProjectLibraryProject, "id" | "source" | "sourceId">,
) {
  const response = await fetch("/api/v2/project-library", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: project.source || "project",
      sourceId: project.sourceId || project.id,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.success) {
    throw new ProjectLibraryClientError(body?.error || "项目删除失败。", response.status);
  }
}
