export type ProductionMode = "planning" | "canvas" | "editor" | "assembly" | "casting";
export type ProductionContentType = "short_drama" | "mv";
export type ProductionAspectRatio = "9:16" | "16:9" | "1:1";
export type ProductionLanguage = "zh" | "en" | "bilingual";

export type ProductionShotType = "普通画面" | "对口型画面" | "空镜" | "转场" | "动作镜头";

export type ProductionShotStatus =
  | "draft"
  | "image_generating"
  | "image_ready"
  | "video_generating"
  | "video_ready"
  | "error";

export type ProductionImageProvider = "minimax" | "seedream" | "openai" | "local";
export type ProductionVideoProvider = "minimax" | "seedance" | "runway" | "kling";

export type ProductionProviderSettings = {
  imageProvider: ProductionImageProvider;
  videoProvider: ProductionVideoProvider;
  imageModel?: string;
  videoModel?: string;
};

export type ProductionSourceFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  textPreview?: string;
  extractedText?: string;
  storagePath?: string;
  uploadedAt: string;
};

export type ProductionStoryBrief = {
  logline: string;
  targetPlatform: string;
  targetAudience: string;
  storySummary: string;
  notes: string;
};

export type ProductionVisualBible = {
  visualStyle: string;
  colorPalette: string;
  cameraRules: string;
  characterRules: string;
  sceneRules: string;
  negativePrompt: string;
};

export type ProductionShot = {
  id: string;
  index: number;
  sceneTitle: string;
  shotType: ProductionShotType;
  duration: string;
  description: string;
  composition: string;
  cameraMovement: string;
  imagePrompt: string;
  videoPrompt: string;
  dialogue?: string;
  sound?: string;
  continuity?: string;
  characterRefs?: string[];
  sceneRefs?: string[];
  imageUrl?: string;
  videoUrl?: string;
  imageTaskId?: string;
  videoTaskId?: string;
  imageProvider?: ProductionImageProvider;
  videoProvider?: ProductionVideoProvider;
  status: ProductionShotStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductionHistoryType =
  | "chat"
  | "upload"
  | "edit"
  | "delete"
  | "image"
  | "video"
  | "save"
  | "universe"
  | "export";

export type ProductionHistoryItem = {
  id: string;
  type: ProductionHistoryType;
  title: string;
  detail: string;
  shotId?: string;
  createdAt: string;
};

export type ProductionChatRole = "user" | "assistant" | "system";

export type ProductionChatMessage = {
  id: string;
  role: ProductionChatRole;
  content: string;
  sourceFileIds?: string[];
  shotId?: string;
  createdAt: string;
};

export type ProductionProjectState = {
  id: string;
  projectId?: string;
  title: string;
  workflowType: "storyboard" | "video" | "production";
  contentType: ProductionContentType;
  aspectRatio: ProductionAspectRatio;
  language: ProductionLanguage;
  universeId?: string | null;
  sourceFiles: ProductionSourceFile[];
  sourceSummary: string;
  storyBrief: ProductionStoryBrief;
  visualBible: ProductionVisualBible;
  shots: ProductionShot[];
  selectedShotId?: string;
  mode: ProductionMode;
  providers: ProductionProviderSettings;
  chatMessages: ProductionChatMessage[];
  history: ProductionHistoryItem[];
  casting: Record<string, string>;
  updatedAt: string;
};

export type ProductionTimelineItem = {
  shotId: string;
  index: number;
  title: string;
  durationSeconds: number;
  imageUrl?: string;
  videoUrl?: string;
  status: ProductionShotStatus;
};

// Keyframe Slot 四层结构
export type KeyframeSlotRole = "single" | "start" | "intermediate" | "end";
export type KeyframeCandidateStatus = "draft" | "generating" | "ready" | "failed" | "archived";

export interface KeyframeCandidate {
  id: string;
  keyframe_slot_id: string;
  image_url?: string;
  prompt: string;
  negative_prompt: string;
  provider?: string;
  model?: string;
  generation_job_id?: string;
  status: KeyframeCandidateStatus;
  is_selected: boolean;
  sort_order: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KeyframeSlot {
  id: string;
  keyframe_set_id: string;
  shot_id: string;
  slot_role: KeyframeSlotRole;
  timestamp_ratio: number; // 0.0 - 1.0
  selected_candidate_id?: string;
  label: string;
  sort_order: number;
  candidates: KeyframeCandidate[];
  created_at: string;
  updated_at: string;
}

export interface KeyframeSet {
  id: string;
  project_id: string;
  shot_id: string;
  name: string;
  sort_order: number;
  slots: KeyframeSlot[];
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
