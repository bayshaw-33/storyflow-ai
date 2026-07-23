import type {
  CreationArc,
  CreationDocument,
  CreationMode,
  CreationStatus,
  CreationTrack,
  CreationUnit,
  CreationUnitStatus,
  CreationWorkspaceV2,
  EpisodePlan,
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
  // PRD V1.0：只保留 draft / finalized，旧值 reviewed/locked 映射为 finalized
  return value === "reviewed" || value === "locked" || value === "finalized" ? "finalized" : "draft";
}

function normalizeDocStatus(value: unknown): CreationStatus {
  return value === "finalized" ? "finalized" : "draft";
}

function normalizeSceneStatus(value: unknown): CreationStatus {
  return value === "finalized" ? "finalized" : "draft";
}

function normalizeFormat(value: unknown): ScreenplayFormat {
  return value === "hollywood_spec" || value === "asian_production" ? value : "international_production";
}

function normalizeEpisode(value: unknown): ScreenplayEpisode | null {
  const source = record(value);
  if (!Object.keys(source).length) return null;
  const rawScenes = Array.isArray(source.scenes) ? source.scenes : [];
  const scenes = rawScenes.map((sc: unknown) => {
    const scRecord = record(sc);
    return {
      id: text(scRecord.id),
      sceneNo: Number(scRecord.sceneNo) || 1,
      interiorExterior: (scRecord.interiorExterior === "EXT" || scRecord.interiorExterior === "INT/EXT" ? scRecord.interiorExterior : "INT") as ScreenplayEpisode["scenes"][number]["interiorExterior"],
      location: text(scRecord.location),
      timeOfDay: text(scRecord.timeOfDay),
      characters: Array.isArray(scRecord.characters) ? scRecord.characters.filter((c): c is string => typeof c === "string") : [],
      blocks: Array.isArray(scRecord.blocks) ? scRecord.blocks as ScreenplayEpisode["scenes"][number]["blocks"] : [],
      status: normalizeSceneStatus(scRecord.status),
    };
  });
  return {
    id: text(source.id),
    episodeNo: Number(source.episodeNo) || 1,
    title: text(source.title),
    logline: text(source.logline),
    scenes,
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

function normalizeEpisodePlan(value: unknown): EpisodePlan | null {
  const source = record(value);
  if (!source.items || !Array.isArray(source.items)) return null;
  return {
    totalEpisodes: Number(source.totalEpisodes) || source.items.length,
    items: source.items.map((item: unknown) => {
      const it = record(item);
      return {
        episodeNo: Number(it.episodeNo) || 1,
        title: text(it.title),
        coreEvent: text(it.coreEvent),
        mainGoal: text(it.mainGoal),
        conflict: text(it.conflict),
        sceneCount: Number(it.sceneCount) || 0,
        sceneOutlines: Array.isArray(it.sceneOutlines) ? it.sceneOutlines.filter((o): o is string => typeof o === "string") : [],
      };
    }),
    status: normalizeDocStatus(source.status),
    updatedAt: text(source.updatedAt) || now(),
  };
}

function normalizeTrack(value: unknown, mode: CreationMode, fallbackUnits: CreationUnit[], timestamp: string): CreationTrack {
  const source = record(value);
  const units = Array.isArray(source.units)
    ? source.units.map((unit, index) => normalizeUnit(unit, index, mode, timestamp))
    : fallbackUnits;
  const arcs = Array.isArray(source.arcs) ? source.arcs.map(normalizeArc) : [];
  const episodePlan = normalizeEpisodePlan(source.episodePlan);
  return { arcs, units, episodePlan };
}

export function createCreationWorkspace(source: LegacyCreationSource = {}): CreationWorkspaceV2 {
  const timestamp = now();
  return {
    version: 2,
    documents: {
      backgroundWorld: { content: source.novelBrief || "", updatedAt: timestamp, status: "draft" },
      characterBible: { content: source.novelCharacters || "", updatedAt: timestamp, status: "draft" },
      plotOutline: { content: source.novelBible || "", updatedAt: timestamp, status: "draft" },
    },
    novel: { arcs: [], units: legacyNovelUnits(source, timestamp), episodePlan: null },
    screenplay: { arcs: [], units: [], episodePlan: null },
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
        status: normalizeDocStatus(backgroundWorld.status),
      },
      characterBible: {
        content: text(characterBible.content) || fallback.documents.characterBible.content,
        updatedAt: text(characterBible.updatedAt) || timestamp,
        status: normalizeDocStatus(characterBible.status),
      },
      plotOutline: {
        content: text(plotOutline.content) || fallback.documents.plotOutline.content,
        updatedAt: text(plotOutline.updatedAt) || timestamp,
        status: normalizeDocStatus(plotOutline.status),
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
  // PRD V1.0：定稿内容修改后自动降级为草稿
  if (current.status === "finalized") {
    patch = { ...patch, status: "draft" };
  }

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

// ===== PRD V1.0 创作基座状态管理 =====

/** 定稿创作文档（背景/角色/大纲） */
export function finalizeDocument(
  workspace: CreationWorkspaceV2,
  docKey: keyof CreationWorkspaceV2["documents"],
): CreationWorkspaceV2 {
  const updatedAt = now();
  return {
    ...workspace,
    documents: {
      ...workspace.documents,
      [docKey]: { ...workspace.documents[docKey], status: "finalized", updatedAt },
    },
    updatedAt,
  };
}

/** 修改创作文档，触发下游降级（PRD §7.4） */
export function updateDocument(
  workspace: CreationWorkspaceV2,
  docKey: keyof CreationWorkspaceV2["documents"],
  content: string,
): CreationWorkspaceV2 {
  const updatedAt = now();
  const doc = workspace.documents[docKey];
  const wasFinalized = doc.status === "finalized";

  // 修改已定稿的内容时，该文档自身降级为草稿
  const newDocs = {
    ...workspace.documents,
    [docKey]: { ...doc, content, status: "draft" as CreationStatus, updatedAt },
  };

  // PRD §7.4 上游修改规则：上游修改后，下游全部降级为草稿
  if (wasFinalized) {
    if (docKey === "backgroundWorld") {
      // 修改背景：角色、大纲、成品全部降级
      newDocs.characterBible = { ...newDocs.characterBible, status: "draft" };
      newDocs.plotOutline = { ...newDocs.plotOutline, status: "draft" };
      return downgradeAllTracks({ ...workspace, documents: newDocs, updatedAt });
    }
    if (docKey === "characterBible") {
      // 修改角色：大纲、成品降级
      newDocs.plotOutline = { ...newDocs.plotOutline, status: "draft" };
      return downgradeAllTracks({ ...workspace, documents: newDocs, updatedAt });
    }
    if (docKey === "plotOutline") {
      // 修改大纲：成品降级
      return downgradeAllTracks({ ...workspace, documents: newDocs, updatedAt });
    }
  }

  return { ...workspace, documents: newDocs, updatedAt };
}

/** 所有 track 的 unit 和 scene 降级为草稿 */
function downgradeAllTracks(workspace: CreationWorkspaceV2): CreationWorkspaceV2 {
  const downgradeTrack = (track: CreationTrack): CreationTrack => ({
    ...track,
    units: track.units.map((u) => ({
      ...u,
      status: "draft" as CreationUnitStatus,
      screenplay: u.screenplay ? {
        ...u.screenplay,
        scenes: u.screenplay.scenes.map((sc) => ({ ...sc, status: "draft" as CreationStatus })),
      } : null,
    })),
    episodePlan: track.episodePlan ? { ...track.episodePlan, status: "draft" as CreationStatus } : null,
  });
  return {
    ...workspace,
    novel: downgradeTrack(workspace.novel),
    screenplay: downgradeTrack(workspace.screenplay),
  };
}

/** 检查创作基座是否可以进入下一阶段 */
export function canGenerateCharacters(workspace: CreationWorkspaceV2): boolean {
  return workspace.documents.backgroundWorld.status === "finalized";
}
export function canGenerateOutline(workspace: CreationWorkspaceV2): boolean {
  return workspace.documents.characterBible.status === "finalized";
}
export function canGenerateEpisodePlan(workspace: CreationWorkspaceV2): boolean {
  return workspace.documents.plotOutline.status === "finalized";
}
export function canGenerateScript(workspace: CreationWorkspaceV2): boolean {
  const track = workspace[workspace.settings.activeMode];
  return workspace.documents.plotOutline.status === "finalized" && track.episodePlan?.status === "finalized";
}

/** 定稿场次 */
export function finalizeScene(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
  sceneId: string,
): CreationWorkspaceV2 {
  const updatedAt = now();
  const track = workspace[mode];
  const units = track.units.map((unit) => {
    if (unit.id !== unitId || !unit.screenplay) return unit;
    const scenes = unit.screenplay.scenes.map((sc) =>
      sc.id === sceneId ? { ...sc, status: "finalized" as CreationStatus } : sc,
    );
    // PRD §7.8：一集内所有场均为定稿时，该集自动定稿
    const allFinalized = scenes.every((sc) => sc.status === "finalized");
    return {
      ...unit,
      status: (allFinalized ? "finalized" : "draft") as CreationUnitStatus,
      screenplay: { ...unit.screenplay, scenes },
      updatedAt,
    };
  });
  return { ...workspace, [mode]: { ...track, units }, updatedAt };
}

/** 场次降级为草稿（修改场次内容时） */
export function draftScene(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
  sceneId: string,
): CreationWorkspaceV2 {
  const updatedAt = now();
  const track = workspace[mode];
  const units = track.units.map((unit) => {
    if (unit.id !== unitId || !unit.screenplay) return unit;
    const scenes = unit.screenplay.scenes.map((sc) =>
      sc.id === sceneId ? { ...sc, status: "draft" as CreationStatus } : sc,
    );
    return {
      ...unit,
      status: "draft" as CreationUnitStatus,
      screenplay: { ...unit.screenplay, scenes },
      updatedAt,
    };
  });
  return { ...workspace, [mode]: { ...track, units }, updatedAt };
}

/** 定稿分集规划 */
export function finalizeEpisodePlan(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
): CreationWorkspaceV2 {
  const updatedAt = now();
  const track = workspace[mode];
  if (!track.episodePlan) return workspace;
  return {
    ...workspace,
    [mode]: {
      ...track,
      episodePlan: { ...track.episodePlan, status: "finalized", updatedAt },
    },
    updatedAt,
  };
}

/** 设置分集规划 */
export function setEpisodePlan(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  plan: EpisodePlan,
): CreationWorkspaceV2 {
  const updatedAt = now();
  const track = workspace[mode];
  return {
    ...workspace,
    [mode]: { ...track, episodePlan: { ...plan, updatedAt } },
    updatedAt,
  };
}
