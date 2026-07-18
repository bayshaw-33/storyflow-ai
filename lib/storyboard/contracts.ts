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
  /** PRD §5.2: 非敏感诊断 —— provider/model/fallbackUsed。不含 key/baseURL/raw 响应。 */
  provider?: {
    provider: string;
    model: string;
    fallbackUsed: boolean;
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
   * CAS 期望 revision。必须为非负整数；CAS 失败抛 REVISION_CONFLICT 409。
   * "另存快照"语义由独立 snapshot API（createStoryboardSnapshot）承担，
   * 不通过此字段绕过 CAS（避免 current-state 数据丢失）。
   */
  expectedRevision: number;
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
  /**
   * 本地基线 revision（用户基于此 revision 做的本地修改正在被快照保留）。
   * 仅作为快照元数据写入 storyflow_versions.snapshot_json.baseRevision，
   * 不参与 CAS 校验、不读不写 current state。
   */
  expectedRevision: number;
  reason: "manual" | "before_reanalysis" | "restore";
  /**
   * 本地完整 Scene/Shot 数据，原样写入 storyflow_versions.snapshot_json.scenes。
   * 409 冲突 "另存快照" 出口：把本地未提交内容保留为不可变版本，绝不触碰当前工作态。
   * 后续可通过版本历史恢复（读取 snapshot_json.scenes 重建本地状态）。
   */
  scenes: StoryboardScene[];
  deletedSceneIds: string[];
  deletedShotIds: string[];
};

export type SnapshotResponse = {
  snapshotId: string;
  /** 快照保留的本地基线 revision（等于 request.expectedRevision） */
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
