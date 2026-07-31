import type {
  CreationArc,
  CreationDocument,
  CreationMode,
  CreationStatus,
  CreationTrack,
  CreationUnit,
  CreationUnitStatus,
  CreationWorkspaceV2,
  CreationView,
  EpisodePlan,
  ScreenplayBlock,
  ScreenplayEpisode,
  ScreenplayFormat,
  ScreenplayScene,
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
      // PRD V1.0 验收 P0-01：默认创作剧本
      activeMode: "screenplay",
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

/**
 * PRD V1.0 验收 P0-03：内容有效性校验。
 * 创作基座文档必须有有效内容才能定稿。
 * 有效内容 = 去除空白/markdown 装饰后仍有实质字符（>= 20 字）。
 */
const MIN_DOC_CONTENT_LEN = 20;
export function hasValidDocContent(content: string): boolean {
  const stripped = content.replace(/[#*>`\-\s]/g, "").trim();
  return stripped.length >= MIN_DOC_CONTENT_LEN;
}

/**
 * PRD V1.0 验收 P0-03：定稿创作文档前校验内容。
 * 内容无效时抛错，由调用方 catch 并提示用户。
 */
export function finalizeDocument(
  workspace: CreationWorkspaceV2,
  docKey: keyof CreationWorkspaceV2["documents"],
): CreationWorkspaceV2 {
  const doc = workspace.documents[docKey];
  if (!hasValidDocContent(doc.content)) {
    const label = docKey === "backgroundWorld" ? "背景及世界观" : docKey === "characterBible" ? "角色圣经" : "剧情及大纲";
    throw new Error(`${label} 内容为空或过短，请先通过 AI 生成或手动填写后再定稿。`);
  }
  const updatedAt = now();
  // PRD V1.0 验收 P0-06：大纲定稿时，若 screenplay track 还没有 episodePlan，
  // 不在此自动创建单元——分集规划定稿后才建集（见 finalizeEpisodePlan）。
  return {
    ...workspace,
    documents: {
      ...workspace.documents,
      [docKey]: { ...doc, status: "finalized", updatedAt },
    },
    updatedAt,
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
      lastMode: settings.lastMode === "screenplay" || settings.lastMode === "novel" ? settings.lastMode : undefined,
      lastView: ["background", "characters", "outline", "episodePlan", "unit", "export"].includes(settings.lastView as string)
        ? settings.lastView as CreationView
        : undefined,
      lastUnitId: text(settings.lastUnitId) || undefined,
      lastUnitUpdatedAt: text(settings.lastUnitUpdatedAt) || undefined,
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

export function recordCreationPosition(
  workspace: CreationWorkspaceV2,
  position: { mode: CreationMode; view: CreationView; unitId?: string; unitUpdatedAt?: string },
): CreationWorkspaceV2 {
  const updatedAt = now();
  return {
    ...workspace,
    settings: {
      ...workspace.settings,
      lastMode: position.mode,
      lastView: position.view,
      lastUnitId: position.unitId === undefined ? workspace.settings.lastUnitId : position.unitId || undefined,
      lastUnitUpdatedAt: position.unitUpdatedAt === undefined ? workspace.settings.lastUnitUpdatedAt : position.unitUpdatedAt || undefined,
    },
    updatedAt,
  };
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
// finalizeDocument 已移至文件上方（含内容校验）。

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

export function unfinalizeDocument(
  workspace: CreationWorkspaceV2,
  docKey: keyof CreationWorkspaceV2["documents"],
): CreationWorkspaceV2 {
  const doc = workspace.documents[docKey];
  if (doc.status !== "finalized") return workspace;
  const documents = {
    ...workspace.documents,
    [docKey]: { ...doc, status: "draft" as CreationStatus, updatedAt: now() },
  };
  if (docKey === "backgroundWorld") {
    documents.characterBible = { ...documents.characterBible, status: "draft" };
    documents.plotOutline = { ...documents.plotOutline, status: "draft" };
  } else if (docKey === "characterBible") {
    documents.plotOutline = { ...documents.plotOutline, status: "draft" };
  }
  return downgradeAllTracks({ ...workspace, documents, updatedAt: now() });
}

export function unfinalizeEpisodePlan(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
): CreationWorkspaceV2 {
  const track = workspace[mode];
  if (!track.episodePlan || track.episodePlan.status !== "finalized") return workspace;
  const updatedAt = now();
  return {
    ...workspace,
    [mode]: {
      ...track,
      episodePlan: { ...track.episodePlan, status: "draft", updatedAt },
      units: track.units.map((unit) => ({
        ...unit,
        status: "draft" as CreationUnitStatus,
        screenplay: unit.screenplay ? { ...unit.screenplay, scenes: unit.screenplay.scenes.map((scene) => ({ ...scene, status: "draft" as CreationStatus })) } : null,
      })),
    },
    updatedAt,
  };
}

export function unfinalizeUnit(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
): CreationWorkspaceV2 {
  const track = workspace[mode];
  const unit = track.units.find((candidate) => candidate.id === unitId);
  if (!unit || unit.status !== "finalized") return workspace;
  const updatedAt = now();
  return {
    ...workspace,
    [mode]: {
      ...track,
      units: track.units.map((candidate) => candidate.id === unitId ? { ...candidate, status: "draft", updatedAt } : candidate),
    },
    updatedAt,
  };
}

export function finalizeUnit(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
): CreationWorkspaceV2 {
  const track = workspace[mode];
  const unit = track.units.find((candidate) => candidate.id === unitId);
  if (!unit || !unit.content.trim() && !unit.screenplay?.scenes.some((scene) => scene.blocks.some((block) => block.text.trim()))) {
    throw new Error("正文为空，无法定稿。");
  }
  const updatedAt = now();
  return {
    ...workspace,
    [mode]: { ...track, units: track.units.map((candidate) => candidate.id === unitId ? { ...candidate, status: "finalized", updatedAt } : candidate) },
    updatedAt,
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

/**
 * PRD V1.0 验收 P0-05：制作门禁。
 * 只有「剧本版 + 该集已定稿 + 该集有结构化场次且非空」才能进入后期制作。
 * 返回 { ok, reason } 供调用方判断与提示。
 */
export function canEnterProduction(
  workspace: CreationWorkspaceV2,
  unitId: string | null | undefined,
): { ok: boolean; reason?: string } {
  if (workspace.settings.activeMode !== "screenplay") {
    return { ok: false, reason: "只有剧本版定稿集才能进入制作，请切换到剧本版。" };
  }
  if (!unitId) return { ok: false, reason: "请先选择一集剧本。" };
  const unit = workspace.screenplay.units.find((u) => u.id === unitId);
  if (!unit) return { ok: false, reason: "未找到该集剧本。" };
  if (unit.status !== "finalized") return { ok: false, reason: "该集尚未定稿，不能进入制作。" };
  if (!unit.screenplay || !unit.screenplay.scenes.length) {
    return { ok: false, reason: "该集没有结构化场次，不能进入制作。" };
  }
  const hasContent = unit.screenplay.scenes.some((sc) => sc.blocks.some((b) => b.text.trim().length > 0));
  if (!hasContent) return { ok: false, reason: "该集场次内容为空，不能进入制作。" };
  return { ok: true };
}

/**
 * PRD V1.0 验收 P0-04：是否允许在当前 track 创建正文单元。
 * - novel mode：大纲定稿后即可创建章（无分集规划约束）
 * - screenplay mode：必须分集规划定稿后才能创建集（由 finalizeEpisodePlan 自动建集，用户不应手动新建）
 */
export function canCreateUnit(workspace: CreationWorkspaceV2): { ok: boolean; reason?: string } {
  const mode = workspace.settings.activeMode;
  if (workspace.documents.plotOutline.status !== "finalized") {
    return { ok: false, reason: "请先完成并定稿剧情及大纲。" };
  }
  if (mode === "screenplay") {
    if (!workspace.screenplay.episodePlan || workspace.screenplay.episodePlan.status !== "finalized") {
      return { ok: false, reason: "剧本版需先完成并定稿分集规划，集会自动建立。" };
    }
  }
  return { ok: true };
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

/**
 * PRD V1.0 验收 P0-06：定稿分集规划。
 * 定稿后根据规划 items 自动建立对应集结构（保留已存在集的内容）。
 * - screenplay mode：必须先有 episodePlan 才能定稿；定稿后自动建集。
 * - novel mode：无分集规划概念，直接 return。
 */
export function finalizeEpisodePlan(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
): CreationWorkspaceV2 {
  const updatedAt = now();
  const track = workspace[mode];
  if (!track.episodePlan || !track.episodePlan.items.length) return workspace;
  const finalizedPlan = { ...track.episodePlan, status: "finalized" as CreationStatus, updatedAt };

  // PRD V1.0 验收 P0-06：根据规划 items 自动建立集结构
  // 保留所有已存在集（不丢失正文），仅补建规划中新增的集；
  // 规划中仍存在的集同步标题；规划中已删除的集保留在 units 中不静默丢弃（降级为草稿）。
  const existingByNo = new Map(track.units.map((u) => [u.number, u]));
  const plannedNos = new Set(track.episodePlan.items.map((it) => it.episodeNo));

  // 1. 同步/补建规划中的集
  const plannedUnits = track.episodePlan.items.map((item) => {
    const existing = existingByNo.get(item.episodeNo);
    if (existing) {
      // 同步标题（规划为源）；标题变更时降级为草稿（正文可能需要重写）
      const titleChanged = existing.title !== item.title;
      return titleChanged
        ? { ...existing, title: item.title, status: "draft" as CreationUnitStatus, updatedAt }
        : existing;
    }
    const newUnitId = `${mode}-unit-${crypto.randomUUID()}`;
    return {
      id: newUnitId,
      number: item.episodeNo,
      title: item.title || `${mode === "novel" ? "Chapter" : "Episode"} ${item.episodeNo}`,
      outline: item.coreEvent ? `${item.coreEvent}\n目标：${item.mainGoal}\n冲突：${item.conflict}` : "",
      content: "",
      screenplay: null,
      continuityNotes: "",
      status: "draft" as CreationUnitStatus,
      versions: [],
      translation: "",
      localizedContent: "",
      localizationChanges: "",
      similarityReport: "",
      createdAt: updatedAt,
      updatedAt,
    };
  });

  // 2. 保留规划中已删除但仍有正文的集（降级为草稿，标记为"规划外"——通过 number 不在 plannedNos 体现）
  //    这些集不静默丢弃，让用户能手动迁移或归档
  const orphanUnits = track.units
    .filter((u) => !plannedNos.has(u.number))
    .map((u) => u.status === "finalized" ? { ...u, status: "draft" as CreationUnitStatus, updatedAt } : u);

  const units = [...plannedUnits, ...orphanUnits];

  return {
    ...workspace,
    [mode]: {
      ...track,
      episodePlan: finalizedPlan,
      units,
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

// ===== PRD V1.0 §8.3/§9：场次与结构化 block 操作 =====

function mapUnitScenes(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
  mapFn: (scenes: ScreenplayScene[], unit: CreationUnit) => { scenes: ScreenplayScene[]; unitPatch?: Partial<CreationUnit> },
): CreationWorkspaceV2 {
  const updatedAt = now();
  const track = workspace[mode];
  const units = track.units.map((unit) => {
    if (unit.id !== unitId || !unit.screenplay) return unit;
    const result = mapFn(unit.screenplay.scenes, unit);
    const allFinalized = result.scenes.every((sc) => sc.status === "finalized");
    return {
      ...unit,
      ...result.unitPatch,
      status: (allFinalized ? "finalized" : "draft") as CreationUnitStatus,
      screenplay: { ...unit.screenplay, scenes: result.scenes },
      updatedAt,
    };
  });
  return { ...workspace, [mode]: { ...track, units }, updatedAt };
}

/** 修改场次 block（PRD §9 段落类型可编辑，修改触发场次降级） */
export function updateSceneBlock(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
  sceneId: string,
  blockId: string,
  patch: Partial<{ type: ScreenplayBlock["type"]; character: string; text: string; translation: string }>,
): CreationWorkspaceV2 {
  return mapUnitScenes(workspace, mode, unitId, (scenes) => ({
    scenes: scenes.map((sc) => sc.id === sceneId
      ? {
        ...sc,
        status: "draft" as CreationStatus,
        blocks: sc.blocks.map((b) => b.id === blockId ? { ...b, ...patch } : b),
      }
      : sc),
  }));
}

/** 新增 block 到场次末尾 */
export function addSceneBlock(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
  sceneId: string,
  block?: Partial<ScreenplayBlock>,
): CreationWorkspaceV2 {
  const newBlock: ScreenplayBlock = {
    id: `block-${crypto.randomUUID()}`,
    type: block?.type || "action",
    character: block?.character || "",
    text: block?.text || "",
    translation: block?.translation || "",
  };
  return mapUnitScenes(workspace, mode, unitId, (scenes) => ({
    scenes: scenes.map((sc) => sc.id === sceneId
      ? { ...sc, status: "draft" as CreationStatus, blocks: [...sc.blocks, newBlock] }
      : sc),
  }));
}

/** 删除 block */
export function deleteSceneBlock(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
  sceneId: string,
  blockId: string,
): CreationWorkspaceV2 {
  return mapUnitScenes(workspace, mode, unitId, (scenes) => ({
    scenes: scenes.map((sc) => sc.id === sceneId
      ? { ...sc, status: "draft" as CreationStatus, blocks: sc.blocks.filter((b) => b.id !== blockId) }
      : sc),
  }));
}

/** 新建场（PRD §8.3 新建场，新增时集降级为草稿） */
export function addScene(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
  afterSceneId?: string | null,
): CreationWorkspaceV2 {
  return mapUnitScenes(workspace, mode, unitId, (scenes) => {
    const sceneNo = scenes.length + 1;
    const newScene: ScreenplayScene = {
      id: `scene-${crypto.randomUUID()}`,
      sceneNo,
      interiorExterior: "INT",
      location: "",
      timeOfDay: "",
      characters: [],
      blocks: [{ id: `block-${crypto.randomUUID()}`, type: "action", character: "", text: "", translation: "" }],
      status: "draft",
    };
    if (!afterSceneId) return { scenes: [...scenes, newScene] };
    const idx = scenes.findIndex((sc) => sc.id === afterSceneId);
    if (idx < 0) return { scenes: [...scenes, newScene] };
    const next = [...scenes];
    next.splice(idx + 1, 0, newScene);
    // 重新编号
    return { scenes: next.map((sc, i) => ({ ...sc, sceneNo: i + 1 })) };
  });
}

/** 删除场（PRD §7.8 删除定稿场次时集降级） */
export function deleteScene(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
  sceneId: string,
): CreationWorkspaceV2 {
  return mapUnitScenes(workspace, mode, unitId, (scenes) => {
    const next = scenes.filter((sc) => sc.id !== sceneId);
    return { scenes: next.map((sc, i) => ({ ...sc, sceneNo: i + 1 })) };
  });
}

/** 拖拽重排场次（PRD §7.8 重排定稿场次时降级） */
export function reorderScenes(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
  fromSceneId: string,
  toSceneId: string,
): CreationWorkspaceV2 {
  return mapUnitScenes(workspace, mode, unitId, (scenes) => {
    const fromIdx = scenes.findIndex((sc) => sc.id === fromSceneId);
    const toIdx = scenes.findIndex((sc) => sc.id === toSceneId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return { scenes };
    const next = [...scenes];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    return { scenes: next.map((sc, i) => ({ ...sc, sceneNo: i + 1, status: "draft" as CreationStatus })) };
  });
}

/** 追加预览的新场（PRD §8.5 AI 新场先预览确认后插入） */
export function appendPreviewScene(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
  scene: ScreenplayScene,
): CreationWorkspaceV2 {
  return mapUnitScenes(workspace, mode, unitId, (scenes) => {
    const sceneNo = scenes.length + 1;
    return { scenes: [...scenes, { ...scene, sceneNo, status: "draft" }] };
  });
}

/** 用 AI 生成的 screenplay 整体替换当前集（PRD §7.7 整集生成） */
export function applyScreenplayToUnit(
  workspace: CreationWorkspaceV2,
  mode: CreationMode,
  unitId: string,
  screenplay: ScreenplayEpisode,
): CreationWorkspaceV2 {
  const updatedAt = now();
  const track = workspace[mode];
  const units = track.units.map((unit) => unit.id === unitId
    ? { ...unit, screenplay: { ...screenplay, id: unit.screenplay?.id || screenplay.id }, status: "draft" as CreationUnitStatus, updatedAt }
    : unit);
  return { ...workspace, [mode]: { ...track, units }, updatedAt };
}
