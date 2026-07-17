import type {
  AnalyzeRequest,
  AnalyzeResponse,
  Scene,
  Shot,
  PromptRequest,
  PromptResponse,
  RevisionConflict,
  SaveRequest,
  SaveResponse,
  StoryboardAssetUsage,
  StoryboardScene,
  StoryboardShot,
} from "../lib/storyboard/contracts";

const persistedShot = {
  id: "5b0c9e39-a69b-4bcb-8e3e-65f6d7741adc",
  clientId: "client-shot-1",
  idSource: "server",
  sceneId: "5eb96ef9-61e0-46db-963d-57e047fe4810",
  order: 1,
  sourceText: "她推开门。",
  storyBeat: "女主发现秘密",
  visualDescription: "女主推门后停住。",
  characterAssetIds: [],
  sceneAssetId: null,
  propAssetIds: [],
  shotSize: "Medium Close-Up",
  cameraMovement: "Slow push-in",
  angle: "Eye level",
  durationSeconds: 4,
  dialogue: "",
  emotion: "震惊",
  continuity: "保持礼服一致",
  imagePrompt: "",
  jimengPromptZh: "",
  locked: false,
  userEdited: false,
  confirmed: false,
  revision: 1,
  analysisVersion: 1,
  sourceHash: "sha256:source",
} satisfies StoryboardShot;

const scene = {
  clientId: "client-scene-1",
  idSource: "client",
  order: 1,
  heading: "INT. VILLA - NIGHT",
  location: "Villa",
  timeOfDay: "Night",
  summary: "女主发现秘密。",
  sourceText: "她推开门。",
  characterAssetIds: [],
  propAssetIds: [],
  shots: [persistedShot],
  locked: false,
  userEdited: false,
  confirmed: false,
  revision: 1,
  analysisVersion: 1,
  sourceHash: "sha256:source",
} satisfies StoryboardScene;

const usage = {
  assetId: "asset-1",
  kind: "character",
  name: "Isa",
  scriptBasis: "Isa enters the room.",
  description: "Spanish woman in her late twenties",
  visualKeywords: ["realistic", "luxury melodrama"],
  prompt: "",
  selectedVersionId: "version-1",
} satisfies StoryboardAssetUsage;

const analyzeRequest = {
  projectId: "project-1",
  sourceUnitId: "episode-1",
  source: "script text",
  aspectRatio: "9:16",
  targetDurationSeconds: 90,
  visualStyle: "realistic Spanish-language luxury melodrama",
  outputLanguage: "zh-CN",
  mode: "full",
  sceneId: null,
  expectedRevision: 3,
  idempotencyKey: "request-1",
} satisfies AnalyzeRequest;

const analyzeResponse = {
  analysisId: "analysis-1",
  analysisVersion: 1,
  sourceHash: "sha256:source",
  revision: 4,
  scenes: [scene],
  assets: { characters: [usage], locations: [], props: [] },
} satisfies AnalyzeResponse;

const promptRequest = {
  projectId: "project-1",
  sourceUnitId: "episode-1",
  analysisVersion: 1,
  shotIds: [persistedShot.id],
  language: "zh",
  expectedRevision: 4,
  idempotencyKey: "prompt-1",
} satisfies PromptRequest;

const promptResponse = {
  revision: 5,
  prompts: [{
    shotId: persistedShot.id,
    imagePrompt: "画面提示词",
    jimengVideoPrompt: "即梦提示词",
    negativePrompt: "水印",
    referenceVersionIds: [usage.selectedVersionId],
    inputHash: "sha256:input",
  }],
} satisfies PromptResponse;

const saveRequest = {
  projectId: "project-1",
  sourceUnitId: "episode-1",
  expectedRevision: 4,
  scenes: [scene],
  deletedSceneIds: [],
  deletedShotIds: [],
} satisfies SaveRequest;

const saveResponse = {
  projectId: "project-1",
  sourceUnitId: "episode-1",
  revision: 5,
  scenes: [],
  idMap: { "client-shot-1": persistedShot.id },
} satisfies SaveResponse;

const conflict = {
  code: "REVISION_CONFLICT",
  currentRevision: 5,
} satisfies RevisionConflict;

// @ts-expect-error durationSeconds must never be a string.
const invalidDuration: StoryboardShot = { ...persistedShot, durationSeconds: "4" };

void analyzeRequest;
void analyzeResponse;
void promptRequest;
void promptResponse;
void saveRequest;
void saveResponse;
void conflict;
void invalidDuration;

const sceneAlias: Scene = scene;
const shotAlias: Shot = persistedShot;
void sceneAlias;
void shotAlias;
