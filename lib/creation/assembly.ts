import { renderScreenplayEpisode } from "./screenplay.ts";
import type {
  CreationMode,
  CreationTrack,
  CreationUnit,
  CreationWorkspaceV2,
  ScreenplayFormat,
} from "./types.ts";

export type AssemblyVariant = "original" | "translated" | "bilingual" | "localized";
export type AssemblyDiagnosticCode = "missing_unit" | "draft_unit" | "duplicate_title" | "missing_translation";

export type AssemblyDiagnostic = {
  code: AssemblyDiagnosticCode;
  message: string;
  unitId?: string;
};

export type AssembledDocument = {
  title: string;
  language: string;
  markdown: string;
  diagnostics: AssemblyDiagnostic[];
};

export type DeliveryItem = {
  id: string;
  label: string;
  baseFilename: string;
  document: AssembledDocument;
};

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "") || "creation";
}

function languageSlug(value: string) {
  const normalized = value.trim().toLowerCase();
  const names: Record<string, string> = {
    中文: "chinese",
    简体中文: "chinese",
    英文: "english",
    英语: "english",
    西班牙语: "spanish",
    法语: "french",
    意大利语: "italian",
    日语: "japanese",
    韩语: "korean",
  };
  return names[value.trim()] || slug(normalized);
}

function orderedUnits(track: CreationTrack) {
  const map = new Map(track.units.map((unit) => [unit.id, unit]));
  const seen = new Set<string>();
  const groups: Array<{ title: string; units: CreationUnit[] }> = [];
  const diagnostics: AssemblyDiagnostic[] = [];

  for (const arc of [...track.arcs].sort((a, b) => a.number - b.number)) {
    const units: CreationUnit[] = [];
    for (const unitId of arc.unitIds) {
      const unit = map.get(unitId);
      if (!unit) {
        diagnostics.push({ code: "missing_unit", unitId, message: `Missing unit referenced by ${arc.title}: ${unitId}` });
        continue;
      }
      if (!seen.has(unit.id)) units.push(unit);
      seen.add(unit.id);
    }
    groups.push({ title: arc.title, units });
  }

  const unassigned = track.units.filter((unit) => !seen.has(unit.id)).sort((a, b) => a.number - b.number);
  if (unassigned.length) groups.push({ title: "", units: unassigned });

  const titleCounts = new Map<string, number>();
  for (const unit of track.units) {
    const key = unit.title.trim().toLowerCase();
    if (key) titleCounts.set(key, (titleCounts.get(key) || 0) + 1);
    if (unit.status === "draft") {
      diagnostics.push({ code: "draft_unit", unitId: unit.id, message: `Unit is still a draft: ${unit.title}` });
    }
  }
  for (const [title, count] of titleCounts) {
    if (count > 1) diagnostics.push({ code: "duplicate_title", message: `Duplicate unit title: ${title}` });
  }
  return { groups, diagnostics };
}

function removeGeneratedHeading(content: string, title: string) {
  const lines = content.trim().split("\n");
  const first = lines[0]?.replace(/^#+\s*/, "").trim().toLowerCase() || "";
  if (first && (first.includes(title.trim().toLowerCase()) || title.trim().toLowerCase().includes(first))) {
    lines.shift();
  }
  return lines.join("\n").trim();
}

function paragraphs(value: string) {
  return value.trim().split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
}

function bilingualBody(original: string, translated: string) {
  const originals = paragraphs(original);
  const translations = paragraphs(translated);
  return originals.map((paragraph, index) => {
    const translation = translations[index];
    return translation ? `${paragraph}\n\n> ${translation.replace(/\n/g, "\n> ")}` : paragraph;
  }).join("\n\n");
}

function novelUnitBody(unit: CreationUnit, variant: AssemblyVariant, diagnostics: AssemblyDiagnostic[]) {
  const original = removeGeneratedHeading(unit.localizedContent && variant === "localized" ? unit.localizedContent : unit.content, unit.title);
  const translated = removeGeneratedHeading(unit.translation, unit.title);
  if (variant === "translated") {
    if (!translated) diagnostics.push({ code: "missing_translation", unitId: unit.id, message: `Missing translation: ${unit.title}` });
    return translated;
  }
  if (variant === "bilingual") {
    if (!translated) diagnostics.push({ code: "missing_translation", unitId: unit.id, message: `Missing translation: ${unit.title}` });
    return bilingualBody(original, translated);
  }
  return original;
}

export function assembleNovel(
  workspace: CreationWorkspaceV2,
  variant: AssemblyVariant,
  title = "Creation Project",
): AssembledDocument {
  const { groups, diagnostics } = orderedUnits(workspace.novel);
  const sections: string[] = [`# ${title}`, "## Contents"];
  for (const group of groups) {
    if (group.title) sections.push(`- ${group.title}`);
    for (const unit of group.units) sections.push(`  - Chapter ${unit.number} ${unit.title}`);
  }
  for (const group of groups) {
    if (group.title) sections.push(`# ${group.title}`);
    for (const unit of group.units) {
      sections.push(`## Chapter ${unit.number} ${unit.title}`);
      sections.push(novelUnitBody(unit, variant, diagnostics));
    }
  }
  const language = variant === "translated" ? workspace.settings.translationLanguage : workspace.settings.sourceLanguage;
  return { title, language, markdown: sections.filter(Boolean).join("\n\n").trim(), diagnostics };
}

export function assembleScreenplay(
  workspace: CreationWorkspaceV2,
  variant: AssemblyVariant,
  format: ScreenplayFormat,
  title = "Creation Project",
): AssembledDocument {
  const { groups, diagnostics } = orderedUnits(workspace.screenplay);
  const sections: string[] = [`# ${title}`];
  let episodeNo = 0;
  for (const group of groups) {
    if (group.title) sections.push(`# ${group.title}`);
    for (const unit of group.units) {
      episodeNo += 1;
      if (variant === "translated") {
        if (!unit.translation.trim()) diagnostics.push({ code: "missing_translation", unitId: unit.id, message: `Missing translation: ${unit.title}` });
        sections.push(unit.translation.trim());
        continue;
      }
      if (variant === "localized" && unit.localizedContent.trim()) {
        sections.push(unit.localizedContent.trim());
        continue;
      }
      if (!unit.screenplay) {
        sections.push(unit.content.trim());
        continue;
      }
      const episode = {
        ...unit.screenplay,
        episodeNo,
        scenes: unit.screenplay.scenes.map((scene, index) => ({ ...scene, sceneNo: index + 1 })),
      };
      const rendered = renderScreenplayEpisode(episode, format, {
        screenplayLanguage: workspace.settings.screenplayLanguage,
        dialogueLanguage: workspace.settings.dialogueLanguage,
      });
      sections.push(variant === "bilingual" && unit.translation.trim() ? bilingualBody(rendered, unit.translation) : rendered);
    }
  }
  return {
    title,
    language: variant === "translated" ? workspace.settings.dialogueLanguage : workspace.settings.screenplayLanguage,
    markdown: sections.filter(Boolean).join("\n\n").trim(),
    diagnostics,
  };
}

function sharedDocument(title: string, content: string, language: string): AssembledDocument {
  return { title, language, markdown: content.trim(), diagnostics: [] };
}

export function buildDeliveryManifest(
  project: { title: string },
  workspace: CreationWorkspaceV2,
): DeliveryItem[] {
  const projectSlug = slug(project.title);
  const source = languageSlug(workspace.settings.activeMode === "screenplay"
    ? workspace.settings.screenplayLanguage
    : workspace.settings.sourceLanguage);
  const translation = languageSlug(workspace.settings.activeMode === "screenplay"
    ? workspace.settings.dialogueLanguage
    : workspace.settings.translationLanguage);
  const sharedLanguage = workspace.settings.sourceLanguage;
  const items: DeliveryItem[] = [
    {
      id: "background-world",
      label: "背景及世界观",
      baseFilename: `${projectSlug}-background-world`,
      document: sharedDocument("背景及世界观", workspace.documents.backgroundWorld.content, sharedLanguage),
    },
    {
      id: "character-bible",
      label: "角色圣经",
      baseFilename: `${projectSlug}-character-bible`,
      document: sharedDocument("角色圣经", workspace.documents.characterBible.content, sharedLanguage),
    },
    {
      id: "plot-outline",
      label: "剧情及大纲",
      baseFilename: `${projectSlug}-plot-outline`,
      document: sharedDocument("剧情及大纲", workspace.documents.plotOutline.content, sharedLanguage),
    },
  ];
  const mode: CreationMode = workspace.settings.activeMode;
  const assemble = (variant: AssemblyVariant) => mode === "novel"
    ? assembleNovel(workspace, variant, project.title)
    : assembleScreenplay(workspace, variant, workspace.settings.screenplayFormat, project.title);
  const hasOriginal = workspace[mode].units.some((unit) => Boolean(unit.content.trim() || unit.screenplay));
  const hasTranslation = workspace[mode].units.some((unit) => Boolean(unit.translation.trim()));
  if (hasOriginal) {
    items.push({ id: "manuscript-original", label: `${mode === "novel" ? "小说" : "剧本"}-${source}`, baseFilename: `${projectSlug}-${mode}-${source}`, document: assemble("original") });
  }
  if (hasTranslation) {
    items.push({ id: "manuscript-translation", label: `${mode === "novel" ? "小说" : "剧本"}-${translation}`, baseFilename: `${projectSlug}-${mode}-${translation}`, document: assemble("translated") });
    items.push({ id: "manuscript-bilingual", label: `${mode === "novel" ? "小说" : "剧本"}-双语`, baseFilename: `${projectSlug}-${mode}-${source}-${translation}`, document: assemble("bilingual") });
  }
  return items.filter((item) => Boolean(item.document.markdown.trim()));
}

