/**
 * TRAE-V2-04 AI Director + Scene/Shot Breakdown
 * 类型定义：Director Scene/Shot Meta、Breakdown Preview、Apply Request
 *
 * 设计原则：
 * - 不修改 lib/storyboard/contracts.ts（Codex 契约）
 * - director_meta JSONB 承载所有 AI Director 维度字段
 * - 已锁定（locked=true）的 Scene/Shot 不被重新分析覆盖
 */

// ============================================================
// Scene Director Meta（场次导演维度）
// ============================================================

export type DirectorSceneMeta = {
  /** 场景功能：建立/推进/转折/高潮/收束 */
  scene_function?: string;
  /** 冲突描述 */
  conflict?: string;
  /** 情绪基调 */
  emotion?: string;
  /** 价值变化：从X到Y */
  value_shift?: string;
  /** 走位/调度（人物动线） */
  blocking?: string;
  /** 场景资产引用（地点资产 ID 列表） */
  scene_assets?: string[];
  /** 原文引用范围 {start, end} */
  source_quote_range?: { start: number; end: number };
  /** AI 生成标记 */
  ai_generated?: boolean;
  /** 用户确认状态 */
  user_confirmed?: boolean;
};

// ============================================================
// Shot Director Meta（镜头导演维度）
// ============================================================

export type DirectorShotMeta = {
  /** 焦段（如 35mm / 85mm） */
  focal_length?: string;
  /** 人物调度/走位 */
  blocking?: string;
  /** 运镜起幅（机位起点） */
  camera_start?: string;
  /** 运动路径（如 推/拉/摇/移/跟/升/降） */
  movement_path?: string;
  /** 速度曲线（如 匀速/先快后慢/缓推） */
  speed_curve?: string;
  /** 前后景视差 */
  parallax?: string;
  /** 焦点变化（如 焦点从A到B） */
  focus_change?: string;
  /** 落幅（结束帧画面） */
  end_frame?: string;
  /** 转场接口（如 硬切/叠化/匹配剪辑） */
  transition_interface?: string;
  /** 光影（如 逆光/侧光/顶光/低调） */
  lighting?: string;
  /** 色彩（如 暖色调/冷色调/低饱和） */
  color?: string;
  /** 音效层（独立于对白） */
  sound_effects?: string;
  /** Provider 生成参数（seed/guidance/steps 等） */
  provider_params?: Record<string, unknown>;
  /** AI 生成标记 */
  ai_generated?: boolean;
  /** 用户确认状态 */
  user_confirmed?: boolean;
};

// ============================================================
// AI Breakdown Output（AI 返回的导演分析结果 schema）
// ============================================================

export type AiSceneBreakdown = {
  heading: string;
  location: string;
  time_of_day: string;
  summary: string;
  source_text: string;
  characters: string[];
  props: string[];
  /** AI Director 维度 */
  scene_function: string;
  conflict: string;
  emotion: string;
  value_shift: string;
  blocking: string;
  source_quote_range: { start: number; end: number };
  shots: AiShotBreakdown[];
};

export type AiShotBreakdown = {
  source_text: string;
  story_beat: string;
  visual_description: string;
  characters: string[];
  location: string | null;
  props: string[];
  shot_size: string;
  camera_movement: string;
  angle: string;
  duration_seconds: number;
  dialogue: string;
  emotion: string;
  continuity: string;
  /** AI Director 维度 */
  focal_length: string;
  blocking: string;
  camera_start: string;
  movement_path: string;
  speed_curve: string;
  parallax: string;
  focus_change: string;
  end_frame: string;
  transition_interface: string;
  lighting: string;
  color: string;
  sound_effects: string;
};

export type AiBreakdownOutput = {
  scenes: AiSceneBreakdown[];
};

// ============================================================
// Breakdown Preview（预览结果，未写入 DB）
// ============================================================

export type SceneBreakdownPreview = {
  sceneId: string; // 客户端临时 ID 或已有 scene ID（重分析时）
  heading: string;
  location: string;
  timeOfDay: string;
  summary: string;
  sourceText: string;
  characterAssetIds: string[];
  propAssetIds: string[];
  directorMeta: DirectorSceneMeta;
  shots: ShotBreakdownPreview[];
};

export type ShotBreakdownPreview = {
  shotId: string; // 客户端临时 ID 或已有 shot ID（重分析时）
  sceneId: string;
  order: number;
  sourceText: string;
  storyBeat: string;
  visualDescription: string;
  shotSize: string;
  cameraMovement: string;
  angle: string;
  durationSeconds: number;
  dialogue: string;
  emotion: string;
  continuity: string;
  directorMeta: DirectorShotMeta;
};

// ============================================================
// Request / Response
// ============================================================

export type DirectorBreakdownRequest = {
  projectId: string;
  sourceUnitId: string;
  source: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  targetDurationSeconds: number;
  visualStyle: string;
  outputLanguage: "zh-CN" | "en";
  mode: "full" | "scene";
  sceneId: string | null;
  /** 已锁定的 scene/shot ID 列表（重新分析时不覆盖） */
  lockedSceneIds?: string[];
  lockedShotIds?: string[];
};

export type DirectorBreakdownResponse = {
  analysisId: string;
  scenes: SceneBreakdownPreview[];
  /** 非敏感诊断 */
  provider?: {
    provider: string;
    model: string;
    fallbackUsed: boolean;
  };
};

export type ApplyBreakdownRequest = {
  projectId: string;
  sourceUnitId: string;
  scenes: SceneBreakdownPreview[];
  /** 要删除的 scene/shot ID（用户确认废弃的） */
  deletedSceneIds?: string[];
  deletedShotIds?: string[];
};

export type ApplyBreakdownResponse = {
  applied: number;
  skipped: number;
  sceneIdMap: Record<string, string>;
  shotIdMap: Record<string, string>;
};

export type DirectorErrorCode =
  | "INVALID_INPUT"
  | "AI_CALL_FAILED"
  | "AI_OUTPUT_INVALID"
  | "SCENE_NOT_FOUND"
  | "SHOT_NOT_FOUND"
  | "LOCKED_NOT_OVERWRITABLE"
  | "PROVIDER_TIMEOUT";

export class DirectorError extends Error {
  code: DirectorErrorCode;
  details?: Record<string, unknown>;
  constructor(code: DirectorErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "DirectorError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function isDirectorError(error: unknown): error is DirectorError {
  return error instanceof DirectorError;
}
