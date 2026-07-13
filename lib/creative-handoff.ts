import type { DramaProject } from "./projects.ts";

export const CREATIVE_HANDOFF_STORAGE_KEY = "kiikis_creative_handoff_v1";

export type CreativeContentType = "novel" | "script";

export type CreativeHandoffPackage = {
  version: 1;
  sourceProjectId: string;
  sourceUpdatedAt: string;
  title: string;
  contentType: CreativeContentType;
  universeId: string | null;
  projectBackground: string;
  worldAndOutline: string;
  characterBible: string;
  manuscript: string;
  translation: string;
  localization: string;
  createdAt: string;
};

export function buildCreativeHandoffPackage(
  project: DramaProject,
  contentType: CreativeContentType,
): CreativeHandoffPackage {
  const novelManuscript = project.novelChapters?.map((chapter) => chapter.draft).filter(Boolean).join("\n\n") || project.novelChapterDraft || "";
  const scriptManuscript = project.finalScript || project.chineseScript || project.existingScript || project.importedScript || "";
  return {
    version: 1,
    sourceProjectId: project.id,
    sourceUpdatedAt: project.updatedAt,
    title: project.title,
    contentType,
    universeId: project.universeId || null,
    projectBackground: project.novelBrief || project.brief || project.idea || "",
    worldAndOutline: project.novelBible || project.outline || "",
    characterBible: project.novelCharacters || project.characters || "",
    manuscript: contentType === "script" ? scriptManuscript : novelManuscript,
    translation: project.translation || "",
    localization: project.localization || "",
    createdAt: new Date().toISOString(),
  };
}

export function writeCreativeHandoff(pkg: CreativeHandoffPackage) {
  window.localStorage.setItem(CREATIVE_HANDOFF_STORAGE_KEY, JSON.stringify(pkg));
}

export function parseCreativeHandoff(raw: string | null, sourceProjectId?: string | null): CreativeHandoffPackage | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CreativeHandoffPackage>;
    if (value.version !== 1 || !value.sourceProjectId || !value.title || !value.contentType) return null;
    if (sourceProjectId && value.sourceProjectId !== sourceProjectId) return null;
    return value as CreativeHandoffPackage;
  } catch {
    return null;
  }
}

export function readCreativeHandoff(sourceProjectId?: string | null) {
  return parseCreativeHandoff(window.localStorage.getItem(CREATIVE_HANDOFF_STORAGE_KEY), sourceProjectId);
}
