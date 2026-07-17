import type { DramaProject } from "./projects.ts";
import { assembleNovel, assembleScreenplay } from "./creation/assembly.ts";

export const CREATIVE_HANDOFF_STORAGE_KEY = "kiikis_creative_handoff_v1";

export type CreativeContentType = "novel" | "script";

export type CreativeHandoffPackage = {
  version: 1;
  sourceProjectId: string;
  /**
   * 当前集 / 来源单元 ID。
   * 任务卡 KIIKIS-P1-TRAE-002 §2 BLOCKER 3：必须锁定当前集，
   * 不允许导入整部剧本或串到其他项目。
   * 由 CreationWorkbench.openDownstream 传入 activeUnitId。
   */
  sourceUnitId?: string;
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
  sourceUnitId?: string,
): CreativeHandoffPackage {
  const workspace = project.creationWorkspace;
  const novelManuscript = workspace?.novel.units.length
    ? assembleNovel(workspace, "original", project.title).markdown
    : project.novelChapters?.map((chapter) => chapter.draft).filter(Boolean).join("\n\n") || project.novelChapterDraft || "";
  const scriptManuscript = workspace?.screenplay.units.length
    ? assembleScreenplay(workspace, "original", workspace.settings.screenplayFormat, project.title).markdown
    : project.finalScript || project.chineseScript || project.existingScript || project.importedScript || "";
  const activeTrack = workspace?.[contentType === "script" ? "screenplay" : "novel"];
  const translation = activeTrack?.units.map((unit) => unit.translation).filter(Boolean).join("\n\n") || project.translation || "";
  const localization = activeTrack?.units.map((unit) => unit.localizedContent).filter(Boolean).join("\n\n") || project.localization || "";
  return {
    version: 1,
    sourceProjectId: project.id,
    sourceUnitId,
    sourceUpdatedAt: project.updatedAt,
    title: project.title,
    contentType,
    universeId: project.universeId || null,
    projectBackground: workspace?.documents.backgroundWorld.content || project.novelBrief || project.brief || project.idea || "",
    worldAndOutline: workspace?.documents.plotOutline.content || project.novelBible || project.outline || "",
    characterBible: workspace?.documents.characterBible.content || project.novelCharacters || project.characters || "",
    manuscript: contentType === "script" ? scriptManuscript : novelManuscript,
    translation,
    localization,
    createdAt: new Date().toISOString(),
  };
}

export function writeCreativeHandoff(pkg: CreativeHandoffPackage) {
  window.localStorage.setItem(CREATIVE_HANDOFF_STORAGE_KEY, JSON.stringify(pkg));
}

export function parseCreativeHandoff(
  raw: string | null,
  sourceProjectId?: string | null,
  sourceUnitId?: string | null,
): CreativeHandoffPackage | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CreativeHandoffPackage>;
    if (value.version !== 1 || !value.sourceProjectId || !value.title || !value.contentType) return null;
    if (sourceProjectId && value.sourceProjectId !== sourceProjectId) return null;
    // BLOCKER 3: 若调用方传了 sourceUnitId，必须与 handoff 包内一致
    if (sourceUnitId && value.sourceUnitId && value.sourceUnitId !== sourceUnitId) return null;
    return value as CreativeHandoffPackage;
  } catch {
    return null;
  }
}

export function readCreativeHandoff(
  sourceProjectId?: string | null,
  sourceUnitId?: string | null,
) {
  return parseCreativeHandoff(
    window.localStorage.getItem(CREATIVE_HANDOFF_STORAGE_KEY),
    sourceProjectId,
    sourceUnitId,
  );
}
