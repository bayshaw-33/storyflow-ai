export type StoryboardAspectRatio = "9:16" | "16:9";
export type StoryboardOutputLanguage = "zh-CN" | "en";
export type StoryboardPromptLanguage = "zh" | "en";
export type StoryboardAssetKind = "character" | "location" | "prop";

export type StoryboardServerIdentity = {
  /** UUID issued and trusted by the server. */
  id: string;
  /** Original temporary ID, returned only to reconcile the client state. */
  clientId?: string;
  idSource: "server";
};

export type StoryboardClientIdentity = {
  /** Unsaved entities cannot choose their future database UUID. */
  id?: never;
  clientId: string;
  idSource: "client";
};

export type StoryboardIdentity = StoryboardServerIdentity | StoryboardClientIdentity;

export type StoryboardPersistenceMetadata = {
  locked: boolean;
  userEdited: boolean;
  confirmed: boolean;
  revision: number;
  analysisVersion: number;
  sourceHash: string;
};

export type StoryboardShot<TIdentity extends StoryboardIdentity = StoryboardIdentity> = TIdentity &
  StoryboardPersistenceMetadata & {
    sceneId: string;
    order: number;
    sourceText: string;
    storyBeat: string;
    visualDescription: string;
    characterAssetIds: string[];
    sceneAssetId: string | null;
    propAssetIds: string[];
    shotSize: string;
    cameraMovement: string;
    angle: string;
    durationSeconds: number;
    dialogue: string;
    emotion: string;
    continuity: string;
    imagePrompt: string;
    jimengPromptZh: string;
    jimengPromptEn?: string;
    storyboardImageVersionId?: string | null;
  };

export type StoryboardScene<TIdentity extends StoryboardIdentity = StoryboardIdentity> = TIdentity &
  StoryboardPersistenceMetadata & {
    order: number;
    heading: string;
    location: string;
    timeOfDay: string;
    summary: string;
    sourceText: string;
    sourceRange?: { start: number; end: number };
    characterAssetIds: string[];
    propAssetIds: string[];
    shots: StoryboardShot[];
  };

export type PersistedStoryboardShot = StoryboardShot<StoryboardServerIdentity>;
export type PersistedStoryboardScene = Omit<StoryboardScene<StoryboardServerIdentity>, "shots"> & {
  shots: PersistedStoryboardShot[];
};
export type Scene = StoryboardScene;
export type Shot = StoryboardShot;

export type StoryboardAssetUsage = {
  assetId: string;
  kind: StoryboardAssetKind;
  name: string;
  scriptBasis: string;
  description: string;
  visualKeywords: string[];
  prompt: string;
  selectedVersionId: string | null;
};

export type AnalyzeRequest = {
  projectId: string;
  sourceUnitId: string;
  source: string;
  aspectRatio: StoryboardAspectRatio;
  targetDurationSeconds: number;
  visualStyle: string;
  outputLanguage: StoryboardOutputLanguage;
  mode: "full" | "scene";
  sceneId: string | null;
  expectedRevision: number;
  idempotencyKey: string;
};

export type AnalyzeResponse = {
  analysisId: string;
  analysisVersion: number;
  sourceHash: string;
  revision: number;
  scenes: StoryboardScene[];
  assets: {
    characters: StoryboardAssetUsage[];
    locations: StoryboardAssetUsage[];
    props: StoryboardAssetUsage[];
  };
};

export type PromptRequest = {
  projectId: string;
  sourceUnitId: string;
  analysisVersion: number;
  shotIds: string[];
  language: StoryboardPromptLanguage;
  expectedRevision: number;
  idempotencyKey: string;
};

export type StoryboardPromptResult = {
  shotId: string;
  imagePrompt: string;
  jimengVideoPrompt: string;
  negativePrompt: string;
  referenceVersionIds: string[];
  inputHash: string;
};

export type PromptResponse = {
  revision: number;
  prompts: StoryboardPromptResult[];
};

export type SaveRequest = {
  projectId: string;
  sourceUnitId: string;
  /**
   * CAS 期望 revision。null = "另存快照"语义：跳过 CAS 检查，把本地内容
   * 当作新版本直接写入（仅在用户明确选择"基于当前内容另存快照"时使用）。
   * 服务端 save_storyboard_state RPC 在 p_expected_revision IS NULL 时
   * 因 NULL 比较跳过 REVISION_CONFLICT 检查，天然支持此语义。
   */
  expectedRevision: number | null;
  scenes: StoryboardScene[];
  deletedSceneIds: string[];
  deletedShotIds: string[];
};

export type SaveResponse = {
  projectId: string;
  sourceUnitId: string;
  revision: number;
  scenes: PersistedStoryboardScene[];
  idMap: Record<string, string>;
};

export type SnapshotRequest = {
  projectId: string;
  sourceUnitId: string;
  expectedRevision: number;
  reason: "manual" | "before_reanalysis" | "restore";
};

export type SnapshotResponse = {
  snapshotId: string;
  revision: number;
};

export type MergeProposal = {
  projectId: string;
  sourceUnitId: string;
  baseRevision: number;
  proposedRevision: number;
  scenes: StoryboardScene[];
  retainedSceneIds: string[];
  retainedShotIds: string[];
};

export type RevisionConflict = {
  code: "REVISION_CONFLICT";
  currentRevision: number;
};
