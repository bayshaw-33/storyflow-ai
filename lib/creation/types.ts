export type CreationMode = "novel" | "screenplay";
export type CreationUnitStatus = "draft" | "reviewed" | "locked";
export type ScreenplayFormat = "international_production" | "hollywood_spec" | "asian_production";

export type CreationDocument = {
  content: string;
  updatedAt: string;
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
};

export type ScreenplayEpisode = {
  id: string;
  episodeNo: number;
  title: string;
  logline: string;
  scenes: ScreenplayScene[];
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
  };
  createdAt: string;
  updatedAt: string;
};
