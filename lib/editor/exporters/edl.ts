/**
 * TRAE-V2-06 Editor Framework — EDL 导出器（CMX 3600）
 *
 * 将 kiikis.timeline/1 DTO 导出为 CMX 3600 EDL 格式
 * 兼容所有专业剪辑软件（达芬奇/Pr/Final Cut/Avid 等）
 *
 * 设计约束：
 * - 时间线只引用稳定 ID，不含 Provider 临时 URL
 * - 素材文件名用占位符（kiikis-<shotId>.mp4），用户在剪辑软件中重连
 * - 默认 30fps（短剧常用），可通过参数覆盖
 * - 仅导出 video 轨（EDL 标准只支持单视频轨 + 有限音频）
 *   voice/captions 作为注释行附加，便于人工对照
 */

import type { KiikisTimeline, TimelineClip } from "../types.ts";

export const DEFAULT_FPS = 30;

// ============================================================
// 时间码工具：秒 → HH:MM:SS:FF（CMX 3600 标准）
// ============================================================

function secondsToTimecode(seconds: number, fps: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const totalFrames = Math.round(seconds * fps);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  // HH:MM:SS:FF（2 位补零）
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}:${pad2(frames)}`;
}

// ============================================================
// 事件编号（3 位补零）
// ============================================================

function formatEventNumber(n: number): string {
  return String(n).padStart(3, "0");
}

// ============================================================
// 主导出函数
// ============================================================

export type EDLOptions = {
  fps?: number;
  title?: string;
};

export function serializeToEDL(
  timeline: KiikisTimeline,
  options: EDLOptions = {},
): string {
  const fps = options.fps ?? DEFAULT_FPS;
  const title = options.title ?? `Kiikis-${timeline.projectId}`;

  const lines: string[] = [];

  // 标题
  lines.push(`TITLE: ${title}`);
  lines.push("");

  const videoTrack = timeline.tracks.find((t) => t.kind === "video");
  const voiceTrack = timeline.tracks.find((t) => t.kind === "voice");
  const captionsTrack = timeline.tracks.find((t) => t.kind === "captions");

  const videoClips = [...(videoTrack?.clips ?? [])].sort(
    (a, b) => a.start - b.start,
  );
  const voiceClips = voiceTrack?.clips ?? [];
  const captionClips = captionsTrack?.clips ?? [];

  // 为每个 video clip 生成一条 EDL 事件
  // CMX 3600 格式：
  //   001  AX       V     C        00:00:00:00 00:00:05:00 00:00:00:00 00:00:05:00
  //   * FROM CLIP NAME:  Shot 1
  //   * FROM CLIP: kiikis-<shotId>.mp4
  //   * COMMENT: shotId=<...>
  let eventNum = 1;
  for (const clip of videoClips) {
    const num = formatEventNumber(eventNum);
    const sourceIn = secondsToTimecode(clip.trimIn ?? 0, fps);
    const sourceOut = secondsToTimecode(
      (clip.trimOut ?? clip.duration) + (clip.trimIn ?? 0),
      fps,
    );
    const recordIn = secondsToTimecode(clip.start, fps);
    const recordOut = secondsToTimecode(clip.start + clip.duration, fps);

    // 事件行：编号  源  V  C  srcIn srcOut recIn recOut
    // AX = Auxiliary Source（无磁带源），C = Cut
    lines.push(
      `${num}  AX       V     C        ${sourceIn} ${sourceOut} ${recordIn} ${recordOut}`,
    );
    // 注释行：FROM CLIP NAME
    const clipName = (clip.label ?? `Shot ${eventNum}`).slice(0, 70);
    lines.push(`* FROM CLIP NAME:  ${clipName}`);
    // 注释行：FROM CLIP（文件名）
    const fileName = `kiikis-${clip.shotId}.mp4`;
    lines.push(`* FROM CLIP: ${fileName}`);
    // 注释行：assetId/selectedTakeId 便于回溯
    if (clip.assetId) {
      lines.push(`* COMMENT: assetId=${clip.assetId}`);
    }
    if (clip.selectedTakeId) {
      lines.push(`* COMMENT: selectedTakeId=${clip.selectedTakeId}`);
    }
    lines.push("");
    eventNum++;
  }

  // 附加：voice + captions 作为注释块（EDL 标准不直接支持多轨音频/字幕）
  if (voiceClips.length > 0 || captionClips.length > 0) {
    lines.push(`M2: AUDIO FROM VOICE LINES`);
    for (const clip of voiceClips) {
      const tcIn = secondsToTimecode(clip.start, fps);
      const tcOut = secondsToTimecode(clip.start + clip.duration, fps);
      const label = (clip.label ?? clip.voiceLineId ?? "").slice(0, 60);
      lines.push(
        `* AUDIO: ${tcIn} ${tcOut} voiceLineId=${clip.voiceLineId ?? "?"} label=${label}`,
      );
    }
    lines.push("");
    lines.push(`M2: CAPTIONS FROM VOICE LINES`);
    for (const clip of captionClips) {
      const tcIn = secondsToTimecode(clip.start, fps);
      const tcOut = secondsToTimecode(clip.start + clip.duration, fps);
      // 把换行替换为空格，避免破坏 EDL 解析
      const text = (clip.text ?? "").replace(/\s+/g, " ").slice(0, 80);
      lines.push(
        `* CAPTION: ${tcIn} ${tcOut} ${text}`,
      );
    }
    lines.push("");
  }

  // 结束标记
  lines.push(`END`);

  return lines.join("\n");
}
