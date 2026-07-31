export type CreationMode = "novel" | "screenplay";
export type CreationView = "background" | "characters" | "outline" | "episodePlan" | "unit" | "export";

/** PRD V1.0：所有创作内容只有草稿和定稿两种状态 */
export type CreationStatus = "draft" | "finalized";

/** 旧状态值兼容映射用 */
export type CreationUnitStatus = "draft" | "reviewed" | "locked" | "finalized";

export type ScreenplayFormat = "international_production" | "hollywood_spec" | "asian_production";

export type CreationDocument = {
  content: string;
  updatedAt: string;
  /** PRD V1.0：草稿 / 定稿 */
  status?: CreationStatus;
};

export type CreationVersion = {
  id: string;
  content: string;
  screenplay: ScreenplayEpisode | null;
  instruction: string;
  model: string;
  scope: string;
  createdAt: string;
};

export type ScreenplayBlock = {
  id: string;
  type: "action" | "dialogue" | "parenthetical" | "transition" | "note";
  character: string;
  text: string;
  translation: string;
};

export type ScreenplayScene = {
  id: string;
  sceneNo: number;
  interiorExterior: "INT" | "EXT" | "INT/EXT";
  location: string;
  timeOfDay: string;
  characters: string[];
  blocks: ScreenplayBlock[];
  /** PRD V1.0：场次草稿 / 定稿 */
  status?: CreationStatus;
};

export type ScreenplayEpisode = {
  id: string;
  episodeNo: number;
  title: string;
  logline: string;
  scenes: ScreenplayScene[];
};

/** PRD V1.0 §7.6：分集规划 */
export type EpisodePlanItem = {
  episodeNo: number;
  title: string;
  coreEvent: string;
  mainGoal: string;
  conflict: string;
  sceneCount: number;
  sceneOutlines: string[];
};

export type EpisodePlan = {
  totalEpisodes: number;
  items: EpisodePlanItem[];
  status: CreationStatus;
  updatedAt: string;
};

export type CreationUnit = {
  id: string;
  number: number;
  title: string;
  outline: string;
  content: string;
  screenplay: ScreenplayEpisode | null;
  continuityNotes: string;
  status: CreationUnitStatus;
  versions: CreationVersion[];
  translation: string;
  localizedContent: string;
  localizationChanges: string;
  similarityReport: string;
  createdAt: string;
  updatedAt: string;
};

export type CreationArc = {
  id: string;
  number: number;
  title: string;
  outline: string;
  unitIds: string[];
};

export type CreationTrack = {
  arcs: CreationArc[];
  units: CreationUnit[];
  /** PRD V1.0 §7.6：剧本版分集规划 */
  episodePlan?: EpisodePlan | null;
};

export type CreationWorkspaceV2 = {
  version: 2;
  documents: {
    backgroundWorld: CreationDocument;
    characterBible: CreationDocument;
    plotOutline: CreationDocument;
  };
  novel: CreationTrack;
  screenplay: CreationTrack;
  settings: {
    activeMode: CreationMode;
    interfaceLanguage: string;
    targetMarket: string;
    genre: string;
    sourceLanguage: string;
    translationLanguage: string;
    translationEnabled: boolean;
    screenplayLanguage: string;
    dialogueLanguage: string;
    screenplayFormat: ScreenplayFormat;
    generationScope: "unit" | "arc";
    lastMode?: CreationMode;
    lastView?: CreationView;
    lastUnitId?: string;
    lastUnitUpdatedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
};
