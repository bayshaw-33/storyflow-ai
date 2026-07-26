/**
 * TRAE-V2-06 OpenCut-ready Editor Framework
 * kiikis.timeline/1 序列化/反序列化
 *
 * 序列化：DB 行 → KiikisTimeline DTO
 * 反序列化：KiikisTimeline DTO → DB 行（用于 PUT 保存）
 *
 * 禁止把 Provider 临时 URL 写入时间线
 */

import {
  TIMELINE_SCHEMA_VERSION,
  EDITOR_ENGINE_NONE,
  EDITOR_STATUS_FRAMEWORK,
} from "./types.ts";
import type {
  AssemblyItemRow,
  AssemblySequenceMeta,
  AssemblySequenceRow,
  KiikisTimeline,
  SelectedTakeRow,
  TimelineClip,
  TimelineTrack,
  VoiceLineSummary,
} from "./types.ts";

/**
 * 序列化：从 DB 行组装 KiikisTimeline DTO
 *
 * 三轨：
 *   - video-main: 来自 assembly_items + selected_takes（视频轨）
 *   - voice-main: 来自 voice_lines（已批准的音频轨）
 *   - captions-main: 来自 voice_lines.dialogue_text + assembly_items.shot_id（字幕占位轨）
 */
export function serializeTimeline(input: {
  sequence: AssemblySequenceRow;
  items: AssemblyItemRow[];
  selectedTakes: SelectedTakeRow[];
  voiceLines: VoiceLineSummary[];
  projectId: string;
  sourceUnitId: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
}): KiikisTimeline {
  const { sequence, items, selectedTakes, voiceLines, projectId, sourceUnitId, aspectRatio } = input;

  const takeById = new Map(selectedTakes.map((t) => [t.id, t]));
  const itemsSorted = [...items].sort((a, b) => a.sort_order - b.sort_order);

  // 视频：assembly_items + selected_takes（current 状态）
  // 使用 flatMap 避免返回 null 后的类型冲突
  const videoClips: TimelineClip[] = itemsSorted.flatMap((item, idx): TimelineClip[] => {
    const take = item.selected_take_id ? takeById.get(item.selected_take_id) : null;
    if (!take || take.status !== "current") return [];
    // 禁止把 Provider 临时 URL 写入时间线
    // video_url 可能是签名 URL（短期）或 storage_path
    // 时间线只引用稳定 ID，UI 渲染时再重签
    const start = item.start_time_seconds;
    const end = item.end_time_seconds;
    const duration = Math.max(0, end - start);
    return [{
      id: item.id,
      shotId: item.shot_id,
      selectedTakeId: take.id,
      start,
      duration,
      label: take.take_label || `Shot ${idx + 1}`,
    }];
  });

  // 语音：已批准的 voice_lines
  const voiceClips: TimelineClip[] = voiceLines
    .filter((vl) => vl.status === "approved" && vl.approved_asset_id)
    .map((vl, idx) => ({
      id: `voice-${vl.id}`,
      shotId: vl.shot_id ?? "",
      voiceLineId: vl.id,
      characterId: vl.character_id ?? undefined,
      // 默认按序排列，无精确时间码（首期框架）
      start: idx * 5,
      duration: 5,
      label: vl.dialogue_text.slice(0, 40) || `Voice ${idx + 1}`,
    }));

  // 字幕：所有 voice_lines 的对白文本
  const captionClips: TimelineClip[] = voiceLines
    .filter((vl) => vl.dialogue_text.trim())
    .map((vl, idx) => ({
      id: `caption-${vl.id}`,
      shotId: vl.shot_id ?? "",
      voiceLineId: vl.id,
      characterId: vl.character_id ?? undefined,
      start: idx * 5,
      duration: 5,
      text: vl.dialogue_text,
      label: `Caption ${idx + 1}`,
    }));

  const tracks: TimelineTrack[] = [
    { id: "video-main", kind: "video", clips: videoClips },
    { id: "voice-main", kind: "voice", clips: voiceClips },
    { id: "captions-main", kind: "captions", clips: captionClips },
  ];

  const durationSeconds = Math.max(
    sequence.total_duration_seconds,
    ...videoClips.map((c) => c.start + c.duration),
    ...voiceClips.map((c) => c.start + c.duration),
  );

  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION,
    projectId,
    sourceUnitId,
    aspectRatio,
    durationSeconds,
    tracks,
    serializedAt: new Date().toISOString(),
  };
}

/**
 * 反序列化：从 KiikisTimeline DTO 更新 DB 行（仅更新 assembly_items 的时间码）
 *
 * 注意：首期框架不实际写入 DB（只读 + 序列化展示）
 * 后续 OpenCut 接入后再实现写入逻辑
 */
export function deserializeTimeline(
  timeline: KiikisTimeline,
): {
  items: Array<{
    id: string;
    start_time_seconds: number;
    end_time_seconds: number;
  }>;
  total_duration_seconds: number;
} {
  const videoTrack = timeline.tracks.find((t) => t.kind === "video");
  const items = (videoTrack?.clips ?? []).map((clip) => ({
    id: clip.id,
    start_time_seconds: clip.start,
    end_time_seconds: clip.start + clip.duration,
  }));
  return {
    items,
    total_duration_seconds: timeline.durationSeconds,
  };
}

/**
 * 从 sequence.metadata 读取 editor 元信息
 */
export function parseSequenceMeta(
  metadata: Record<string, unknown>,
): AssemblySequenceMeta {
  return {
    timeline_schema_version:
      (metadata.timeline_schema_version as string) || TIMELINE_SCHEMA_VERSION,
    editor_engine:
      (metadata.editor_engine as AssemblySequenceMeta["editor_engine"]) ||
      EDITOR_ENGINE_NONE,
    external_project_id:
      (metadata.external_project_id as string | null) ?? null,
    external_project_version:
      (metadata.external_project_version as string | null) ?? null,
    editor_status:
      (metadata.editor_status as AssemblySequenceMeta["editor_status"]) ||
      EDITOR_STATUS_FRAMEWORK,
  };
}

/**
 * 校验 timeline DTO 合法性
 */
export function validateTimeline(timeline: unknown): KiikisTimeline {
  if (!timeline || typeof timeline !== "object") {
    throw new Error("TIMELINE_INVALID:not_an_object");
  }
  const t = timeline as Record<string, unknown>;
  if (t.schemaVersion !== TIMELINE_SCHEMA_VERSION) {
    throw new Error(
      `TIMELINE_INVALID:unsupported_schema_version:${String(t.schemaVersion)}`,
    );
  }
  if (typeof t.projectId !== "string" || !t.projectId) {
    throw new Error("TIMELINE_INVALID:missing_projectId");
  }
  if (!Array.isArray(t.tracks)) {
    throw new Error("TIMELINE_INVALID:missing_tracks");
  }
  return t as unknown as KiikisTimeline;
}

