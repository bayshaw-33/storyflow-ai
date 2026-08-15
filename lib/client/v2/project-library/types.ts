import type { DramaProject } from "../../../projects.ts";

export type ProjectLibrarySource = "project" | "production" | "art" | "viral";

/**
 * The dashboard's normalized project card shape.
 *
 * Legacy projects remain structurally compatible with this type. Records
 * sourced from a child table carry source/sourceId so deletion never guesses
 * which underlying table should be mutated.
 */
export type ProjectLibraryProject = {
  id: string;
  title: string;
  workflowType: string;
  status: string;
  projectGroup?: string | null;
  universeId?: string | null;
  genre?: string;
  idea?: string;
  brief?: string;
  characters?: string;
  characterCards?: unknown[];
  outline?: string;
  episodes?: string;
  existingScript?: string;
  continuationScript?: string;
  finalScript?: string;
  createdAt: string;
  updatedAt: string;
  source?: ProjectLibrarySource;
  sourceId?: string;
  sourceProjectId?: string | null;
  sourceUnitId?: string | null;
  libraryKey?: string;
};

export function toProjectLibraryRecord(
  input: Partial<ProjectLibraryProject> & Pick<ProjectLibraryProject, "id" | "title" | "workflowType" | "createdAt" | "updatedAt">,
): ProjectLibraryProject {
  return {
    status: "draft",
    projectGroup: "默认分组",
    universeId: null,
    genre: "",
    idea: "",
    brief: "",
    characters: "",
    outline: "",
    episodes: "",
    existingScript: "",
    continuationScript: "",
    finalScript: "",
    ...input,
  };
}

export function asProjectLibraryRecord(project: DramaProject): ProjectLibraryProject {
  return toProjectLibraryRecord({
    ...project,
    workflowType: project.workflowType,
    source: "project",
    sourceId: project.id,
    libraryKey: `project:${project.id}`,
  });
}
