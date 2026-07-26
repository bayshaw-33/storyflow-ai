/**
 * TRAE-V2-06 OpenCut-ready Editor Framework
 * 类型定义：kiikis.timeline/1 DTO + Assembly 读取
 *
 * 设计原则：
 * - 不安装 Twick，不合入 OpenCut Classic
 * - 复用现有 storyflow_assembly_sequences/items + selected_takes + voice_lines 表
 * - timeline_schema_version 等字段通过 metadata JSONB 承载（不做 migration）
 * - 禁止把 Provider 临时 URL 写入时间线
 */

// ============================================================
// kiikis.timeline/1 Schema
// ============================================================

export const TIMELINE_SCHEMA_VERSION = "kiikis.timeline/1" as const;
export const EDITOR_ENGINE_NONE = "none" as const;
export const EDITOR_STATUS_FRAMEWORK = "framework" as const;

export type TimelineTrackKind = "video" | "voice" | "captions";

export type TimelineClip = {
  /** 稳定 ID（assembly_item ID 或临时 client ID） */
  id: string;
  /** 关联的 Shot 稳定 ID */
  shotId: string;
  /** 关联的 Selected Take 稳定 ID（可选，字幕轨可空） */
  selectedTakeId?: string;
  /** 关联的 Asset 稳定 ID（视频/音频正式资产） */
  assetId?: string;
  /** 关联的 Voice Line 稳定 ID（voice 轨用） */
  voiceLineId?: string;
  /** 关联的 Character 稳定 ID（字幕/voice 轨用） */
  characterId?: string;
  /** 时间线起点（秒） */
  start: number;
  /** 时长（秒） */
  duration: number;
  /** Trim in（秒，相对于源素材） */
  trimIn?: number;
  /** Trim out（秒，相对于源素材） */
  trimOut?: number;
  /** 显示标签 */
  label?: string;
  /** 对白文本（字幕轨用） */
  text?: string;
};

export type TimelineTrack = {
  id: string;
  kind: TimelineTrackKind;
  clips: TimelineClip[];
};

export type KiikisTimeline = {
  schemaVersion: typeof TIMELINE_SCHEMA_VERSION;
  projectId: string;
  sourceUnitId: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  durationSeconds: number;
  tracks: TimelineTrack[];
  /** 序列化时间戳 */
  serializedAt?: string;
};

// ============================================================
// Editor Framework 元信息
// ============================================================

export type EditorEngine = "none" | "opencut" | "twick";

export type EditorStatus =
  | "framework" // 仅框架，未接入任何编辑器
  | "ready" // 已接入编辑器，可编辑
  | "deprecated"; // 编辑器已废弃

export type AssemblySequenceMeta = {
  timeline_schema_version?: string;
  editor_engine?: EditorEngine;
  external_project_id?: string | null;
  external_project_version?: string | null;
  editor_status?: EditorStatus;
};

// ============================================================
// 读取结果
// ============================================================

export type SelectedTakeRow = {
  id: string;
  project_id: string;
  shot_id: string;
  video_url: string;
  take_label: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AssemblyItemRow = {
  id: string;
  assembly_sequence_id: string;
  shot_id: string;
  selected_take_id: string | null;
  sort_order: number;
  start_time_seconds: number;
  end_time_seconds: number;
  transition_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AssemblySequenceRow = {
  id: string;
  project_id: string;
  name: string;
  transition_type: string;
  total_duration_seconds: number;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type VoiceLineSummary = {
  id: string;
  shot_id: string | null;
  character_id: string | null;
  dialogue_text: string;
  status: string;
  approved_asset_id: string | null;
  storage_path: string | null;
};

// ============================================================
// API 响应
// ============================================================

export type EditorTimelineResponse = {
  success: boolean;
  timeline: KiikisTimeline;
  sequence: {
    id: string;
    status: string;
    editorStatus: EditorStatus;
    editorEngine: EditorEngine;
  };
  /** OpenCut 接入状态描述 */
  opencutStatus: {
    available: boolean;
    reason: string;
  };
  /** Export 按钮是否可用 */
  exportAvailable: boolean;
  exportUnavailableReason?: string;
};

export type EditorSaveTimelineResponse = {
  success: boolean;
  sequenceId: string;
  serializedAt: string;
};

// ============================================================
// 错误
// ============================================================

export type EditorErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "SCOPE_NOT_FOUND"
  | "SEQUENCE_NOT_FOUND"
  | "FEATURE_DISABLED"
  | "TIMELINE_INVALID"
  | "OPENCUT_NOT_AVAILABLE";

export class EditorError extends Error {
  code: EditorErrorCode;
  details?: Record<string, unknown>;
  constructor(
    code: EditorErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "EditorError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function isEditorError(error: unknown): error is EditorError {
  return error instanceof EditorError;
}
