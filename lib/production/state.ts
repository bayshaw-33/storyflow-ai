import type { DramaProject, StoryboardEpisode, WorkflowType } from "@/lib/projects"
import { getSelectedFinalScript } from "@/lib/projects";;
import { defaultProductionProviders, parseShotDurationSeconds } from "./providers";
import type {
  KeyframeCandidate,
  KeyframeSet,
  KeyframeSlot,
  KeyframeSlotRole,
  ProductionAspectRatio,
  ProductionChatMessage,
  ProductionHistoryItem,
  ProductionHistoryType,
  ProductionMode,
  ProductionProjectState,
  ProductionProviderSettings,
  ProductionShot,
  ProductionShotStatus,
  ProductionShotType,
  ProductionSourceFile,
  ProductionStoryBrief,
  ProductionTimelineItem,
  ProductionVisualBible,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const defaultVisualBible: ProductionVisualBible = {
  visualStyle: "cinematic vertical short drama, realistic lighting, clear emotional blocking",
  colorPalette: "natural contrast, controlled highlights, production-ready skin tones",
  cameraRules: "prioritize readable 9:16 composition, close-ups for emotion, stable continuity between shots",
  characterRules: "keep character face, wardrobe, age, body shape and key props consistent across shots",
  sceneRules: "keep location geography, lighting direction and important props consistent",
  negativePrompt: "watermark, logo, unreadable text, distorted hands, inconsistent faces, low quality, collage artifacts",
};

const defaultStoryBrief: ProductionStoryBrief = {
  logline: "",
  targetPlatform: "TikTok / Reels / Shorts",
  targetAudience: "overseas short drama viewers",
  storySummary: "",
  notes: "",
};

export function createProductionId(prefix: string) {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${randomId}`;
}

export function createProductionShot(overrides: Partial<ProductionShot> = {}): ProductionShot {
  const now = new Date().toISOString();
  const index = Number.isFinite(Number(overrides.index)) && Number(overrides.index) > 0 ? Number(overrides.index) : 1;
  const description = overrides.description || "";
  const imagePrompt = overrides.imagePrompt || description;
  return {
    id: overrides.id || createProductionId("shot"),
    index,
    sceneTitle: overrides.sceneTitle || `Scene ${index}`,
    shotType: normalizeShotType(overrides.shotType),
    duration: overrides.duration || "5s",
    description,
    composition: overrides.composition || "",
    cameraMovement: overrides.cameraMovement || "",
    imagePrompt,
    videoPrompt: overrides.videoPrompt || imagePrompt,
    dialogue: overrides.dialogue || "",
    sound: overrides.sound || "",
    continuity: overrides.continuity || "",
    characterRefs: Array.isArray(overrides.characterRefs) ? overrides.characterRefs : [],
    sceneRefs: Array.isArray(overrides.sceneRefs) ? overrides.sceneRefs : [],
    imageUrl: overrides.imageUrl || "",
    videoUrl: overrides.videoUrl || "",
    imageTaskId: overrides.imageTaskId || "",
    videoTaskId: overrides.videoTaskId || "",
    imageProvider: overrides.imageProvider || "minimax",
    videoProvider: overrides.videoProvider || "minimax",
    status: normalizeShotStatus(overrides.status, overrides.imageUrl, overrides.videoUrl),
    error: overrides.error || "",
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
  };
}

export function createEmptyProductionState(overrides: Partial<ProductionProjectState> = {}): ProductionProjectState {
  const now = new Date().toISOString();
  const shots = normalizeProductionShots(overrides.shots || []);
  const selectedShotId = overrides.selectedShotId || shots[0]?.id || "";
  return {
    id: overrides.id || createProductionId("production"),
    projectId: overrides.projectId || "",
    title: overrides.title || "未命名制片项目",
    workflowType: overrides.workflowType || "production",
    contentType: overrides.contentType || "short_drama",
    aspectRatio: normalizeAspectRatio(overrides.aspectRatio),
    language: overrides.language || "zh",
    universeId: typeof overrides.universeId === "string" ? overrides.universeId : null,
    sourceFiles: normalizeSourceFiles(overrides.sourceFiles || []),
    sourceSummary: overrides.sourceSummary || "",
    storyBrief: { ...defaultStoryBrief, ...(overrides.storyBrief || {}) },
    visualBible: { ...defaultVisualBible, ...(overrides.visualBible || {}) },
    shots,
    selectedShotId,
    mode: overrides.mode || "planning",
    providers: normalizeProviders(overrides.providers),
    chatMessages: normalizeChatMessages(overrides.chatMessages || []),
    history: normalizeHistory(overrides.history || []),
    casting: overrides.casting || {},
    updatedAt: overrides.updatedAt || now,
  };
}

export function productionStateFromProject(project: DramaProject, mode: ProductionMode = "planning"): ProductionProjectState {
  const deliveryPayload = parseJson(project.deliveryPackage);
  const savedState = isRecord(deliveryPayload.productionState) ? deliveryPayload.productionState : null;

  if (savedState) {
    return createEmptyProductionState({
      ...(savedState as Partial<ProductionProjectState>),
      projectId: project.id,
      id: stringValue(savedState.id) || project.id,
      title: stringValue(savedState.title) || project.title,
      universeId: stringValue(savedState.universeId) || project.universeId || null,
      mode,
    });
  }

  const aspectRatio = normalizeAspectRatio(deliveryPayload.aspectRatio || parseJson(project.storyboardScript).aspectRatio);
  const videoShots = videoPayloadToShots(deliveryPayload, aspectRatio);
  const storyboardShots = storyboardPayloadToShots(parseJson(project.storyboardScript), aspectRatio);
  const episodeShots = storyboardEpisodesToShots(project.storyboardEpisodes || [], aspectRatio);
  const fallbackText = getSelectedFinalScript(project) || project.importedScript || project.finalScriptForeign || project.finalScriptChinese || project.finalScriptBilingual || project.finalScript || project.chineseScript || project.idea || project.storyboardScript || "";
  const shots =
    videoShots.length > 0
      ? videoShots
      : storyboardShots.length > 0
        ? storyboardShots
        : episodeShots.length > 0
          ? episodeShots
          : fallbackText
            ? [createProductionShot({ index: 1, sceneTitle: project.title || "Scene 1", description: fallbackText.slice(0, 600), imagePrompt: fallbackText.slice(0, 600) })]
            : [];

  return createEmptyProductionState({
    id: project.id,
    projectId: project.id,
    title: project.title || "未命名制片项目",
    workflowType: project.workflowType === "video" ? "video" : "storyboard",
    contentType: inferContentType(project),
    aspectRatio,
    language: inferProductionLanguage(project.targetLanguage),
    universeId: project.universeId || null,
    sourceSummary: fallbackText.slice(0, 1200),
    storyBrief: {
      ...defaultStoryBrief,
      logline: project.storyBible.logline || "",
      targetPlatform: project.market || defaultStoryBrief.targetPlatform,
      targetAudience: project.storyBible.targetMarket || defaultStoryBrief.targetAudience,
      storySummary: project.brief || project.outline || project.idea || "",
      notes: project.storyBible.lockedCanon || "",
    },
    visualBible: {
      ...defaultVisualBible,
      visualStyle: project.storyBible.languageStyle || defaultVisualBible.visualStyle,
      characterRules: project.characters || defaultVisualBible.characterRules,
    },
    shots,
    mode,
    providers: {
      ...defaultProductionProviders,
      ...(isRecord(deliveryPayload.providers) ? deliveryPayload.providers : {}),
    } as ProductionProviderSettings,
  });
}

export function productionStateToMarkdown(state: ProductionProjectState) {
  return [
    `# ${state.title || "未命名制片项目"}`,
    "",
    `- 内容类型：${state.contentType === "mv" ? "MV" : "短剧"}`,
    `- 画幅：${state.aspectRatio}`,
    `- 镜头数：${state.shots.length}`,
    `- 预计时长：${formatSeconds(totalTimelineSeconds(state))}`,
    state.universeId ? `- Universe：${state.universeId}` : "",
    "",
    "## 故事概况",
    state.storyBrief.logline ? `- Logline：${state.storyBrief.logline}` : "",
    state.storyBrief.storySummary ? state.storyBrief.storySummary : "",
    "",
    "## 视觉规则",
    `- 视觉风格：${state.visualBible.visualStyle}`,
    `- 运镜规则：${state.visualBible.cameraRules}`,
    `- 人物一致性：${state.visualBible.characterRules}`,
    "",
    "## 分镜脚本",
    ...state.shots.map((shot) =>
      [
        `### 分镜 ${shot.index}: ${shot.sceneTitle || "Untitled"}`,
        `- 画面类型：${shot.shotType}`,
        `- 分镜时长：${shot.duration}`,
        shot.description ? `- 画面描述：${shot.description}` : "",
        shot.composition ? `- 构图设计：${shot.composition}` : "",
        shot.cameraMovement ? `- 运镜调度：${shot.cameraMovement}` : "",
        shot.dialogue ? `- 对白：${shot.dialogue}` : "",
        shot.sound ? `- 声音：${shot.sound}` : "",
        shot.imagePrompt ? `- 图片提示词：${shot.imagePrompt}` : "",
        shot.videoPrompt ? `- 视频提示词：${shot.videoPrompt}` : "",
        shot.imageUrl ? `- 图片：${shot.imageUrl}` : "",
        shot.videoUrl ? `- 视频：${shot.videoUrl}` : "",
      ].filter(Boolean).join("\n"),
    ),
  ].filter(Boolean).join("\n");
}

export function productionStateToProjectPatch(state: ProductionProjectState, workflowType: Extract<WorkflowType, "storyboard" | "video"> = "storyboard"): Partial<DramaProject> {
  const markdown = productionStateToMarkdown(state);
  return {
    workflowType,
    title: state.title,
    storyboardScript: markdown,
    storyboardEpisodes: productionStateToStoryboardEpisodes(state),
    deliveryPackage: JSON.stringify({ productionState: state, exportedAt: new Date().toISOString(), version: "production-workbench-v1" }, null, 2),
    universeId: state.universeId || null,
    status: "ready",
    updatedAt: new Date().toISOString(),
  };
}

export function productionStateToStoryboardEpisodes(state: ProductionProjectState): StoryboardEpisode[] {
  const sceneMap = new Map<string, ProductionShot[]>();
  state.shots.forEach((shot) => {
    const title = shot.sceneTitle || "Scene";
    sceneMap.set(title, [...(sceneMap.get(title) || []), shot]);
  });

  return Array.from(sceneMap.entries()).map(([title, shots], sceneIndex) => ({
    id: createProductionId("episode"),
    title: title || `第 ${sceneIndex + 1} 场`,
    content: shots
      .map((shot) =>
        [
          `分镜 ${shot.index}`,
          `画面类型：${shot.shotType}`,
          `时长：${shot.duration}`,
          shot.description ? `画面描述：${shot.description}` : "",
          shot.composition ? `构图：${shot.composition}` : "",
          shot.cameraMovement ? `运镜：${shot.cameraMovement}` : "",
          shot.imagePrompt ? `图片提示词：${shot.imagePrompt}` : "",
          shot.videoPrompt ? `视频提示词：${shot.videoPrompt}` : "",
        ].filter(Boolean).join("\n"),
      )
      .join("\n\n"),
  }));
}

export function addProductionHistory(
  state: ProductionProjectState,
  input: Omit<ProductionHistoryItem, "id" | "createdAt"> & { id?: string; createdAt?: string },
): ProductionProjectState {
  return {
    ...state,
    history: [
      {
        id: input.id || createProductionId("history"),
        type: input.type,
        title: input.title,
        detail: input.detail,
        shotId: input.shotId,
        createdAt: input.createdAt || new Date().toISOString(),
      },
      ...state.history,
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function updateProductionShot(state: ProductionProjectState, shotId: string, patch: Partial<ProductionShot>): ProductionProjectState {
  const now = new Date().toISOString();
  return {
    ...state,
    shots: normalizeProductionShots(state.shots.map((shot) => (shot.id === shotId ? { ...shot, ...patch, updatedAt: now } : shot))),
    selectedShotId: state.selectedShotId || shotId,
    updatedAt: now,
  };
}

export function deleteProductionShot(state: ProductionProjectState, shotId: string): ProductionProjectState {
  const shots = normalizeProductionShots(state.shots.filter((shot) => shot.id !== shotId));
  return {
    ...state,
    shots,
    selectedShotId: state.selectedShotId === shotId ? shots[0]?.id || "" : state.selectedShotId,
    updatedAt: new Date().toISOString(),
  };
}

export function moveProductionShot(state: ProductionProjectState, shotId: string, direction: "up" | "down"): ProductionProjectState {
  const shots = [...state.shots];
  const index = shots.findIndex((shot) => shot.id === shotId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= shots.length) return state;
  [shots[index], shots[target]] = [shots[target], shots[index]];
  return {
    ...state,
    shots: normalizeProductionShots(shots),
    updatedAt: new Date().toISOString(),
  };
}

export function productionTimelineItems(state: ProductionProjectState): ProductionTimelineItem[] {
  return state.shots.map((shot) => ({
    shotId: shot.id,
    index: shot.index,
    title: shot.sceneTitle || `Shot ${shot.index}`,
    durationSeconds: parseShotDurationSeconds(shot.duration),
    imageUrl: shot.imageUrl,
    videoUrl: shot.videoUrl,
    status: shot.status,
  }));
}

export function totalTimelineSeconds(state: ProductionProjectState) {
  return productionTimelineItems(state).reduce((sum, item) => sum + item.durationSeconds, 0);
}

export function formatSeconds(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes > 0 ? `${minutes}:${String(rest).padStart(2, "0")}` : `${rest}s`;
}

function normalizeProductionShots(shots: Partial<ProductionShot>[]) {
  return shots.map((shot, index) => createProductionShot({ ...shot, index: index + 1 }));
}

function normalizeSourceFiles(files: Partial<ProductionSourceFile>[]) {
  return files
    .filter((file) => file.name)
    .map((file) => ({
      id: file.id || createProductionId("source"),
      name: file.name || "untitled",
      mimeType: file.mimeType || "text/plain",
      size: Number(file.size || 0),
      textPreview: file.textPreview || file.extractedText?.slice(0, 500) || "",
      extractedText: file.extractedText || "",
      storagePath: file.storagePath || "",
      uploadedAt: file.uploadedAt || new Date().toISOString(),
    }));
}

function normalizeChatMessages(messages: Partial<ProductionChatMessage>[]) {
  return messages
    .filter((message) => message.content)
    .map((message) => ({
      id: message.id || createProductionId("chat"),
      role: message.role || "assistant",
      content: message.content || "",
      sourceFileIds: Array.isArray(message.sourceFileIds) ? message.sourceFileIds : [],
      shotId: message.shotId || "",
      createdAt: message.createdAt || new Date().toISOString(),
    }));
}

function normalizeHistory(items: Partial<ProductionHistoryItem>[]) {
  return items
    .filter((item) => item.title || item.detail)
    .map((item) => ({
      id: item.id || createProductionId("history"),
      type: normalizeHistoryType(item.type),
      title: item.title || "Production update",
      detail: item.detail || "",
      shotId: item.shotId || "",
      createdAt: item.createdAt || new Date().toISOString(),
    }));
}

function normalizeProviders(providers?: Partial<ProductionProviderSettings>) {
  return {
    ...defaultProductionProviders,
    ...(providers || {}),
  };
}

function videoPayloadToShots(payload: UnknownRecord, aspectRatio: ProductionAspectRatio) {
  const state = isRecord(payload.state) ? payload.state : null;
  const shots = Array.isArray(state?.shots) ? state.shots : [];
  return shots.map((value, index) => {
    const shot = isRecord(value) ? value : {};
    const prompt = stringValue(shot.prompt) || stringValue(shot.sourceText);
    return createProductionShot({
      id: stringValue(shot.id) || undefined,
      index: index + 1,
      sceneTitle: stringValue(shot.sceneTitle) || `Shot ${index + 1}`,
      duration: stringValue(shot.duration) || "5s",
      description: stringValue(shot.sourceText) || prompt,
      imagePrompt: prompt,
      videoPrompt: prompt,
      videoUrl: stringValue(shot.videoUrl),
      videoTaskId: stringValue(shot.taskId),
      status: normalizeShotStatus(stringValue(shot.status), "", stringValue(shot.videoUrl)),
      imageProvider: "minimax",
      videoProvider: "minimax",
      sceneRefs: [aspectRatio],
    });
  });
}

function storyboardPayloadToShots(payload: UnknownRecord, aspectRatio: ProductionAspectRatio) {
  const scenes = Array.isArray(payload.scenes) ? payload.scenes : [];
  return scenes.flatMap((sceneValue, sceneIndex) => {
    const scene = isRecord(sceneValue) ? sceneValue : {};
    const shots = Array.isArray(scene.shots) ? scene.shots : [];
    return shots.map((shotValue, shotIndex) => {
      const shot = isRecord(shotValue) ? shotValue : {};
      const description = stringValue(shot.text) || stringValue(shot.description) || stringValue(shot.prompt);
      const visualPrompt = stringValue(shot.visualPrompt) || stringValue(shot.prompt) || description;
      return createProductionShot({
        id: stringValue(shot.id) || undefined,
        index: sceneIndex * 100 + shotIndex + 1,
        sceneTitle: stringValue(scene.title) || `Scene ${sceneIndex + 1}`,
        duration: stringValue(shot.duration) || "5s",
        description,
        composition: stringValue(shot.frame) || stringValue(shot.composition),
        cameraMovement: stringValue(shot.camera) || stringValue(shot.cameraMovement),
        imagePrompt: visualPrompt,
        videoPrompt: visualPrompt,
        continuity: stringValue(shot.continuity),
        shotType: inferShotType(description, visualPrompt),
        sceneRefs: [stringValue(scene.location), stringValue(scene.intention), aspectRatio].filter(Boolean),
      });
    });
  });
}

function storyboardEpisodesToShots(episodes: StoryboardEpisode[], aspectRatio: ProductionAspectRatio) {
  return episodes.flatMap((episode, episodeIndex) => {
    const blocks = episode.content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    const lines = blocks.length ? blocks : episode.content.split(/\n/).map((line) => line.trim()).filter(Boolean);
    return lines.slice(0, 40).map((line, shotIndex) =>
      createProductionShot({
        index: episodeIndex * 100 + shotIndex + 1,
        sceneTitle: episode.title || `Scene ${episodeIndex + 1}`,
        description: line,
        imagePrompt: line,
        videoPrompt: line,
        shotType: inferShotType(line, line),
        sceneRefs: [aspectRatio],
      }),
    );
  });
}

function inferContentType(project: DramaProject) {
  const text = [project.genre, project.idea, project.deliveryPackage, project.storyboardScript].join(" ").toLowerCase();
  return text.includes("mv") || text.includes("music video") || text.includes("歌曲") ? "mv" : "short_drama";
}

function inferProductionLanguage(targetLanguage = "") {
  const value = targetLanguage.toLowerCase();
  if (value.includes("english") || value.includes("英文")) return "en";
  if (value.includes("双语") || value.includes("bilingual")) return "bilingual";
  return "zh";
}

function normalizeAspectRatio(value: unknown): ProductionAspectRatio {
  return value === "16:9" || value === "1:1" ? value : "9:16";
}

function normalizeShotType(value: unknown): ProductionShotType {
  if (value === "对口型画面" || value === "空镜" || value === "转场" || value === "动作镜头" || value === "普通画面") return value;
  return "普通画面";
}

function inferShotType(description: string, prompt: string): ProductionShotType {
  const text = `${description} ${prompt}`.toLowerCase();
  if (text.includes("lip") || text.includes("dialogue") || text.includes("对口") || text.includes("唱")) return "对口型画面";
  if (text.includes("transition") || text.includes("转场")) return "转场";
  if (text.includes("empty") || text.includes("establishing") || text.includes("空镜")) return "空镜";
  if (text.includes("action") || text.includes("fight") || text.includes("追") || text.includes("打")) return "动作镜头";
  return "普通画面";
}

function normalizeShotStatus(value: unknown, imageUrl = "", videoUrl = ""): ProductionShotStatus {
  if (videoUrl) return "video_ready";
  if (imageUrl) return "image_ready";
  if (value === "image_generating" || value === "image_ready" || value === "video_generating" || value === "video_ready" || value === "error") return value;
  if (value === "done") return "video_ready";
  if (value === "running" || value === "queued") return "video_generating";
  return "draft";
}

function normalizeHistoryType(value: unknown): ProductionHistoryType {
  if (value === "chat" || value === "upload" || value === "edit" || value === "delete" || value === "image" || value === "video" || value === "save" || value === "universe" || value === "export") return value;
  return "edit";
}

function parseJson(value = ""): UnknownRecord {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}


/* ------------------------------------------------------------------ */
/* Archive Export Functions                                            */
/* ------------------------------------------------------------------ */

export type ProductionArchive = {
  format: "kiikis-production-archive-v1";
  exportedAt: string;
  project: {
    id: string;
    title: string;
    contentType: string;
    aspectRatio: string;
    language: string;
    universeId: string | null;
    mode: string;
  };
  storyBrief: unknown;
  visualBible: unknown;
  shots: unknown[];
  chatMessages: unknown[];
  sourceFiles: unknown[];
  history: unknown[];
  timeline: {
    totalSeconds: number;
    totalShots: number;
    formattedDuration: string;
  };
};

export function productionStateToJsonArchive(state: ProductionProjectState): string {
  const timeline = productionTimelineItems(state);
  const archive: ProductionArchive = {
    format: "kiikis-production-archive-v1",
    exportedAt: new Date().toISOString(),
    project: {
      id: state.projectId || state.id,
      title: state.title,
      contentType: state.contentType,
      aspectRatio: state.aspectRatio,
      language: state.language,
      universeId: state.universeId || null,
      mode: state.mode,
    },
    storyBrief: state.storyBrief,
    visualBible: state.visualBible,
    shots: state.shots,
    chatMessages: state.chatMessages,
    sourceFiles: state.sourceFiles,
    history: state.history,
    timeline: {
      totalSeconds: totalTimelineSeconds(state),
      totalShots: timeline.length,
      formattedDuration: formatSeconds(totalTimelineSeconds(state)),
    },
  };
  return JSON.stringify(archive, null, 2);
}

function formatSrtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function productionStateToSRT(state: ProductionProjectState): string {
  let currentTime = 0;
  const entries: string[] = [];

  state.shots.forEach((shot, index) => {
    const duration = parseShotDurationSeconds(shot.duration);
    const start = currentTime;
    const end = currentTime + duration;
    currentTime = end;

    const text = [shot.dialogue, shot.description, shot.sceneTitle]
      .filter(Boolean)
      .join("\n")
      .trim();

    if (text) {
      entries.push(
        [
          String(index + 1),
          `${formatSrtTime(start)} --> ${formatSrtTime(end)}`,
          text,
        ].join("\n"),
      );
    }
  });

  return entries.join("\n\n") + (entries.length > 0 ? "\n" : "");
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function productionStateToCSV(state: ProductionProjectState): string {
  const headers = [
    "Index",
    "Scene Title",
    "Shot Type",
    "Duration",
    "Description",
    "Composition",
    "Camera Movement",
    "Dialogue",
    "Sound",
    "Continuity",
    "Image Prompt",
    "Video Prompt",
    "Image URL",
    "Video URL",
    "Status",
  ];

  const rows = state.shots.map((shot) =>
    [
      String(shot.index),
      shot.sceneTitle,
      shot.shotType,
      shot.duration,
      shot.description,
      shot.composition,
      shot.cameraMovement,
      shot.dialogue || "",
      shot.sound || "",
      shot.continuity || "",
      shot.imagePrompt,
      shot.videoPrompt,
      shot.imageUrl || "",
      shot.videoUrl || "",
      shot.status,
    ]
      .map(csvEscape)
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

export type ExportFormat = "markdown" | "json" | "srt" | "csv";

export function productionStateToExport(state: ProductionProjectState, format: ExportFormat): { content: string; mimeType: string; extension: string } {
  switch (format) {
    case "json":
      return { content: productionStateToJsonArchive(state), mimeType: "application/json;charset=utf-8", extension: "json" };
    case "srt":
      return { content: productionStateToSRT(state), mimeType: "application/x-subrip;charset=utf-8", extension: "srt" };
    case "csv":
      return { content: productionStateToCSV(state), mimeType: "text/csv;charset=utf-8", extension: "csv" };
    case "markdown":
    default:
      return { content: productionStateToMarkdown(state), mimeType: "text/markdown;charset=utf-8", extension: "md" };
  }
}


/* ------------------------------------------------------------------ */
/* Auto Assembly / 顺片                                                */
/* ------------------------------------------------------------------ */

export type AssemblyTransition = "cut" | "crossfade" | "dissolve";

export type AssemblyClip = {
  shotId: string;
  index: number;
  title: string;
  durationSeconds: number;
  startTime: number;
  endTime: number;
  imageUrl: string | null;
  videoUrl: string | null;
  status: string;
  transition: AssemblyTransition;
};

export type AssemblyPlan = {
  clips: AssemblyClip[];
  totalDuration: number;
  totalClips: number;
  hasGaps: boolean;
  readyClips: number;
};

export function buildAssemblyPlan(
  state: ProductionProjectState,
  transition: AssemblyTransition = "cut",
): AssemblyPlan {
  let currentTime = 0;
  const items = productionTimelineItems(state);
  let readyClips = 0;

  const clips: AssemblyClip[] = items.map((item) => {
    const start = currentTime;
    const end = currentTime + Math.max(1, item.durationSeconds);
    currentTime = end;
    if (item.videoUrl || item.imageUrl) readyClips++;
    return {
      shotId: item.shotId,
      index: item.index,
      title: item.title,
      durationSeconds: item.durationSeconds,
      startTime: start,
      endTime: end,
      imageUrl: item.imageUrl ?? null,
      videoUrl: item.videoUrl ?? null,
      status: item.status,
      transition,
    };
  });

  return {
    clips,
    totalDuration: currentTime,
    totalClips: clips.length,
    hasGaps: clips.some((c) => !c.videoUrl && !c.imageUrl),
    readyClips,
  };
}

function formatEdlTimecode(seconds: number, fps = 24): string {
  const totalFrames = Math.round(seconds * fps);
  const hours = Math.floor(totalFrames / (fps * 3600));
  const minutes = Math.floor((totalFrames % (fps * 3600)) / (fps * 60));
  const secs = Math.floor((totalFrames % (fps * 60)) / fps);
  const frames = totalFrames % fps;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

export function productionStateToEDL(state: ProductionProjectState, fps = 24): string {
  const plan = buildAssemblyPlan(state);
  const title = (state.title || "UNTITLED").toUpperCase().replace(/[^A-Z0-9 ]/g, "");
  const lines: string[] = [`TITLE: ${title}`, ""];

  plan.clips.forEach((clip, i) => {
    const clipNum = String(i + 1).padStart(3, "0");
    const srcIn = formatEdlTimecode(0, fps);
    const srcOut = formatEdlTimecode(clip.durationSeconds, fps);
    const recIn = formatEdlTimecode(clip.startTime, fps);
    const recOut = formatEdlTimecode(clip.endTime, fps);
    const transitionCode = clip.transition === "crossfade" ? "D" : "C";

    lines.push(`${clipNum}  AX       V     ${transitionCode}        ${srcIn} ${srcOut} ${recIn} ${recOut}`);
    if (clip.videoUrl) {
      lines.push(`* FROM CLIP NAME: ${clip.title}`);
      lines.push(`* SOURCE FILE: ${clip.videoUrl}`);
    } else if (clip.imageUrl) {
      lines.push(`* FROM CLIP NAME: ${clip.title} (IMAGE)`);
      lines.push(`* SOURCE FILE: ${clip.imageUrl}`);
    } else {
      lines.push(`* FROM CLIP NAME: ${clip.title} (MISSING)`);
    }
    lines.push("");
  });

  return lines.join("\n");
}

export function productionStateToFCPXML(state: ProductionProjectState, fps = 24): string {
  const plan = buildAssemblyPlan(state);
  const totalDuration = formatEdlTimecode(plan.totalDuration, fps);
  const title = (state.title || "Untitled").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const clipEntries = plan.clips.map((clip) => {
    const duration = formatEdlTimecode(clip.durationSeconds, fps);
    const offset = formatEdlTimecode(clip.startTime, fps);
    const name = clip.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const ref = clip.videoUrl || clip.imageUrl || "";
    return `        <asset-clip name="${name}" offset="${offset}" duration="${duration}" ref="${ref}" start="0" />`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" frameDuration="1/${fps}s" width="1080" height="1920"/>
  </resources>
  <library>
    <event name="${title}">
      <project name="${title}">
        <sequence format="r1" duration="${totalDuration}" tcStart="0s">
          <spine>
${clipEntries}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
}


/* ------------------------------------------------------------------ */
/* Keyframe Slot 四层结构管理                                          */
/* Shot → KeyframeSet → KeyframeSlot → KeyframeCandidate              */
/* ------------------------------------------------------------------ */

export function createKeyframeSet(shotId: string, projectId: string): KeyframeSet {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const slot = createKeyframeSlot(id, shotId, "single", 0);
  return {
    id,
    project_id: projectId,
    shot_id: shotId,
    name: "",
    sort_order: 0,
    slots: [slot],
    metadata: {},
    created_at: now,
    updated_at: now,
  };
}

export function createKeyframeSlot(
  setId: string,
  shotId: string,
  role: KeyframeSlotRole,
  ratio: number,
): KeyframeSlot {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    keyframe_set_id: setId,
    shot_id: shotId,
    slot_role: role,
    timestamp_ratio: clampRatio(ratio),
    selected_candidate_id: undefined,
    label: "",
    sort_order: 0,
    candidates: [],
    created_at: now,
    updated_at: now,
  };
}

export function createKeyframeCandidate(slotId: string): KeyframeCandidate {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    keyframe_slot_id: slotId,
    image_url: undefined,
    prompt: "",
    negative_prompt: "",
    provider: undefined,
    model: undefined,
    generation_job_id: undefined,
    status: "draft",
    is_selected: false,
    sort_order: 0,
    metadata: {},
    created_at: now,
    updated_at: now,
  };
}

export function selectCandidate(slot: KeyframeSlot, candidateId: string): KeyframeSlot {
  const target = slot.candidates.find((c) => c.id === candidateId);
  if (!target) return slot;
  const now = new Date().toISOString();
  return {
    ...slot,
    selected_candidate_id: candidateId,
    candidates: slot.candidates.map((c) => ({
      ...c,
      is_selected: c.id === candidateId,
      updated_at: now,
    })),
    updated_at: now,
  };
}

export function keyframeSetToJSON(set: KeyframeSet): string {
  return JSON.stringify(set, null, 2);
}

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return Math.round(ratio * 10000) / 10000;
}
