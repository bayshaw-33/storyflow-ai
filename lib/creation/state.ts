import type {
  CreationArc,
  CreationMode,
  CreationTrack,
  CreationUnit,
  CreationUnitStatus,
  CreationWorkspaceV2,
  ScreenplayEpisode,
  ScreenplayFormat,
} from "./types.ts";

type LegacyChapter = {
  id?: string;
  chapterNo?: number;
  title?: string;
  outline?: string;
  draft?: string;
  continuityNotes?: string;
  status?: CreationUnitStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type LegacyCreationSource = {
  title?: string;
  targetLanguage?: string;
  novelBrief?: string;
  novelCharacters?: string;
  novelBible?: string;
  novelChapters?: LegacyChapter[];
};

const now = () => new Date().toISOString();

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeStatus(value: unknown): CreationUnitStatus {
  return value === "reviewed" || value === "locked" ? value : "draft";
}

function normalizeFormat(value: unknown): ScreenplayFormat {
  return value === "hollywood_spec" || value === "asian_production" ? value : "international_production";
}

function normalizeEpisode(value: unknown): ScreenplayEpisode | null {
  const source = record(value);
  if (!Object.keys(source).length) return null;
  return {
    id: text(source.id),
    episodeNo: Number(source.episodeNo) || 1,
    title: text(source.title),
    logline: text(source.logline),
    scenes: Array.isArray(source.scenes) ? (source.scenes as ScreenplayEpisode["scenes"]) : [],
  };
}

function legacyNovelUnits(source: LegacyCreationSource, timestamp: string): CreationUnit[] {
  return (source.novelChapters || []).map((chapter, index) => ({
    id: chapter.id || `novel-unit-${index + 1}`,
    number: Number(chapter.chapterNo) || index + 1,
    title: chapter.title || `Chapter ${index + 1}`,
    outline: chapter.outline || "",
    content: chapter.draft || "",
    screenplay: null,
    continuityNotes: chapter.continuityNotes || "",
    status: normalizeStatus(chapter.status),
    versions: [],
    translation: "",
    localizedContent: "",
    localizationChanges: "",
    similarityReport: "",
    createdAt: chapter.createdAt || timestamp,
    updatedAt: chapter.updatedAt || timestamp,
  }));
}

function normalizeUnit(value: unknown, index: number, mode: CreationMode, timestamp: string): CreationUnit {
  const source = record(value);
  return {
    id: text(source.id) || `${mode}-unit-${index + 1}`,
    number: Number(source.number) || index + 1,
    title: text(source.title) || `${mode === "novel" ? "Chapter" : "Episode"} ${index + 1}`,
    outline: text(source.outline),
    content: text(source.content),
    screenplay: normalizeEpisode(source.screenplay),
    continuityNotes: text(source.continuityNotes),
    status: normalizeStatus(source.status),
    versions: Array.isArray(source.versions) ? (source.versions as CreationUnit["versions"]) : [],
    translation: text(source.translation),
    localizedContent: text(source.localizedContent),
    localizationChanges: text(source.localizationChanges),
    similarityReport: text(source.similarityReport),
    createdAt: text(source.createdAt) || timestamp,
    updatedAt: text(source.updatedAt) || timestamp,
  };
}

function normalizeArc(value: unknown, index: number): CreationArc {
  const source = record(value);
  return {
    id: text(source.id) || `arc-${index + 1}`,
    number: Number(source.number) || index + 1,
    title: text(source.title) || `Arc ${index + 1}`,
    outline: text(source.outline),
    unitIds: Array.isArray(source.unitIds) ? source.unitIds.filter((id): id is string => typeof id === "string") : [],
  };
}

function normalizeTrack(value: unknown, mode: CreationMode, fallbackUnits: CreationUnit[], timestamp: string): CreationTrack {
  const source = record(value);
  const units = Array.isArray(source.units)
    ? source.units.map((unit, index) => normalizeUnit(unit, index, mode, timestamp))
    : fallbackUnits;
  const arcs = Array.isArray(source.arcs) ? source.arcs.map(normalizeArc) : [];
  return { arcs, units };
}

export function createCreationWorkspace(source: LegacyCreationSource = {}): CreationWorkspaceV2 {
  const timestamp = now();
  return {
    version: 2,
    documents: {
      backgroundWorld: { content: source.novelBrief || "", updatedAt: timestamp },
      characterBible: { content: source.novelCharacters || "", updatedAt: timestamp },
      plotOutline: { content: source.novelBible || "", updatedAt: timestamp },
    },
    novel: { arcs: [], units: legacyNovelUnits(source, timestamp) },
    screenplay: { arcs: [], units: [] },
    settings: {
      activeMode: "novel",
      interfaceLanguage: "zh",
      targetMarket: "",
      genre: "",
      sourceLanguage: source.targetLanguage || "中文",
      translationLanguage: "",
      translationEnabled: false,
      screenplayLanguage: source.targetLanguage || "中文",
      dialogueLanguage: source.targetLanguage || "中文",
      screenplayFormat: "international_production",
      generationScope: "unit",
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeCreationWorkspace(value: unknown, source: LegacyCreationSource = {}): CreationWorkspaceV2 {
  const fallback = createCreationWorkspace(source);
  const workspace = record(value);
  if (workspace.version !== 2) return fallback;

  const documents = record(workspace.documents);
  const backgroundWorld = record(documents.backgroundWorld);
  const characterBible = record(documents.characterBible);
  const plotOutline = record(documents.plotOutline);
  const settings = record(workspace.settings);
  const timestamp = text(workspace.updatedAt) || fallback.updatedAt;

  return {
    version: 2,
    documents: {
      backgroundWorld: {
        content: text(backgroundWorld.content) || fallback.documents.backgroundWorld.content,
        updatedAt: text(backgroundWorld.updatedAt) || timestamp,
      },
      characterBible: {
        content: text(characterBible.content) || fallback.documents.characterBible.content,
        updatedAt: text(characterBible.updatedAt) || timestamp,
      },
      plotOutline: {
        content: text(plotOutline.content) || fallback.documents.plotOutline.content,
        updatedAt: text(plotOutline.updatedAt) || timestamp,
      },
    },
    novel: normalizeTrack(workspace.novel, "novel", fallback.novel.units, timestamp),
    screenplay: normalizeTrack(workspace.screenplay, "screenplay", [], timestamp),
    settings: {
      activeMode: settings.activeMode === "screenplay" ? "screenplay" : "novel",
      interfaceLanguage: text(settings.interfaceLanguage) || "zh",
      targetMarket: text(settings.targetMarket),
      genre: text(settings.genre),
      sourceLanguage: text(settings.sourceLanguage) || fallback.settings.sourceLanguage,
      translationLanguage: text(settings.translationLanguage),
      translationEnabled: settings.translationEnabled === true,
      screenplayLanguage: text(settings.screenplayLanguage) || fallback.settings.screenplayLanguage,
      dialogueLanguage: text(settings.dialogueLanguage) || fallback.settings.dialogueLanguage,
      screenplayFormat: normalizeFormat(settings.screenplayFormat),
      generationScope: settings.generationScope === "arc" ? "arc" : "unit",
    },
    createdAt: text(workspace.createdAt) || fallback.createdAt,
    updatedAt: timestamp,
  };
}

export function applyUnitTranslation(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
  translation: string,
  updatedAt = now(),
): CreationWorkspaceV2 {
  const track = workspace[mode];
  if (!track.units.some((unit) => unit.id === unitId)) {
    throw new Error(`Creation unit not found: ${unitId}`);
  }
  return {
    ...workspace,
    [mode]: {
      ...track,
      units: track.units.map((unit) => unit.id === unitId
        ? { ...unit, translation, updatedAt }
        : unit),
    },
    updatedAt,
  };
}

export function updateCreationUnit(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
  patch: Partial<Omit<CreationUnit, "id" | "versions" | "createdAt">>,
): CreationWorkspaceV2 {
  const track = workspace[mode];
  const current = track.units.find((unit) => unit.id === unitId);
  if (!current) throw new Error(`Creation unit not found: ${unitId}`);
  if (current.status === "locked") throw new Error(`Creation unit is locked: ${unitId}`);

  const updatedAt = now();
  const units = track.units.map((unit) => (unit.id === unitId ? { ...unit, ...patch, id: unit.id, updatedAt } : unit));
  return { ...workspace, [mode]: { ...track, units }, updatedAt };
}

export function reorderCreationStructure(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  arcs: CreationArc[],
): CreationWorkspaceV2 {
  const updatedAt = now();
  return {
    ...workspace,
    [mode]: {
      ...workspace[mode],
      arcs: arcs.map((arc, index) => ({ ...arc, number: index + 1 })),
    },
    updatedAt,
  };
}
