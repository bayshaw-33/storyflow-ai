import type { ProjectLibraryProject } from "./types.ts";

export class ProjectLibraryClientError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ProjectLibraryClientError";
    this.status = status;
  }
}

export async function fetchProjectLibrary(accessToken: string): Promise<ProjectLibraryProject[]> {
  const response = await fetch("/api/v2/project-library", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.success || !Array.isArray(body.projects)) {
    throw new ProjectLibraryClientError(body?.error || "项目数据加载失败。", response.status);
  }
  return body.projects as ProjectLibraryProject[];
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
