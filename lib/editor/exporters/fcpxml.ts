/**
 * TRAE-V2-06 Editor Framework — FCPXML 导出器
 *
 * 将 kiikis.timeline/1 DTO 导出为 Final Cut Pro XML（FCPXML 1.9）
 * 兼容 Final Cut Pro / DaVinci Resolve / Adobe Premiere Pro
 *
 * 设计约束：
 * - 时间线只引用稳定 ID，不含 Provider 临时 URL
 * - 素材文件路径用占位符（file://kiikis/asset/<assetId>.mp4），用户在剪辑软件中重连
 * - 默认 30fps（短剧常用），可通过参数覆盖
 * - 三轨独立输出：video-main / voice-main / captions-main
 *   - video → <asset-clip> 在主 spine 上
 *   - voice → <asset-clip> 在 audio lane 上
 *   - captions → <title> 在 captions lane 上
 */

import type { KiikisTimeline, TimelineClip } from "../types.ts";

export const FCPXML_VERSION = "1.9";
export const DEFAULT_FPS = 30;

// ============================================================
// 时间码工具：秒 → FCPXML 时码（"Ns" 或 "N/Ms" 分数形式）
// ============================================================

function secondsToRational(seconds: number, fps: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0s";
  // 转换为帧数，再用分数表示，避免浮点精度问题
  const totalFrames = Math.round(seconds * fps);
  if (totalFrames === 0) return "0s";
  // 约分
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(totalFrames, fps);
  const num = totalFrames / divisor;
  const den = fps / divisor;
  if (den === 1) return `${num}s`;
  return `${num}/${den}s`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ============================================================
// 分辨率映射
// ============================================================

function getResolution(aspectRatio: "9:16" | "16:9" | "1:1"): {
  width: number;
  height: number;
} {
  switch (aspectRatio) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "16:9":
      return { width: 1920, height: 1080 };
    case "1:1":
      return { width: 1080, height: 1080 };
  }
}

// ============================================================
// asset id 分配
// ============================================================

function buildAssetId(clip: TimelineClip, index: number): string {
  // FCPXML asset id 不能以数字开头，加前缀 r
  return `r${index + 2}`; // r1 留给 format
}

// ============================================================
// 主导出函数
// ============================================================

export type FCPXMLOptions = {
  fps?: number;
  projectName?: string;
  eventTitle?: string;
  libraryTitle?: string;
};

export function serializeToFCPXML(
  timeline: KiikisTimeline,
  options: FCPXMLOptions = {},
): string {
  const fps = options.fps ?? DEFAULT_FPS;
  const projectName = options.projectName ?? `Kiikis-${timeline.projectId}`;
  const eventTitle = options.eventTitle ?? "Kiikis Export";
  const libraryTitle = options.libraryTitle ?? "Kiikis Storyflow";

  const { width, height } = getResolution(timeline.aspectRatio);
  const totalDuration = timeline.durationSeconds;

  // 收集所有 video + voice clips 作为 assets（captions 不需要 asset）
  const videoTrack = timeline.tracks.find((t) => t.kind === "video");
  const voiceTrack = timeline.tracks.find((t) => t.kind === "voice");
  const captionsTrack = timeline.tracks.find((t) => t.kind === "captions");

  const videoClips = videoTrack?.clips ?? [];
  const voiceClips = voiceTrack?.clips ?? [];
  const captionClips = captionsTrack?.clips ?? [];

  // 构建 assets 列表（video + voice）
  type AssetEntry = { id: string; clip: TimelineClip; kind: "video" | "audio" };
  const assets: AssetEntry[] = [
    ...videoClips.map((c, i) => ({
      id: buildAssetId(c, i),
      clip: c,
      kind: "video" as const,
    })),
    ...voiceClips.map((c, i) => ({
      id: buildAssetId(c, videoClips.length + i),
      clip: c,
      kind: "audio" as const,
    })),
  ];

  // ============================================================
  // 构建 XML
  // ============================================================

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<fcpxml version="${FCPXML_VERSION}">`,
  );

  // ----- resources -----
  lines.push(`  <resources>`);
  // format（r1）
  lines.push(
    `    <format id="r1" name="FFVideoFormat1080p${fps}" frameDuration="${secondsToRational(1 / fps, fps)}" width="${width}" height="${height}"/>`,
  );
  // assets
  for (const asset of assets) {
    const clip = asset.clip;
    const assetRef = asset.kind === "video" ? clip.assetId ?? clip.shotId : clip.voiceLineId ?? clip.id;
    const src = `file://kiikis/${asset.kind}/${escapeXml(assetRef)}.mp4`;
    const duration = secondsToRational(clip.duration, fps);
    const hasVideo = asset.kind === "video" ? "1" : "0";
    const hasAudio = asset.kind === "audio" ? "1" : "0";
    const name = escapeXml(clip.label ?? clip.shotId);
    lines.push(
      `    <asset id="${asset.id}" name="${name}" uid="${escapeXml(assetRef)}" src="${src}" duration="${duration}" hasVideo="${hasVideo}" hasAudio="${hasAudio}"/>`,
    );
  }
  lines.push(`  </resources>`);

  // ----- library > event > project > sequence -----
  lines.push(`  <library>`);
  lines.push(`    <event name="${escapeXml(eventTitle)}">`);
  lines.push(
    `      <project name="${escapeXml(projectName)}">`,
  );
  lines.push(
    `        <sequence format="r1" duration="${secondsToRational(totalDuration, fps)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">`,
  );
  lines.push(`          <spine>`);

  // video clips 直接在 spine 上（按 start 排序）
  const sortedVideoClips = [...videoClips].sort((a, b) => a.start - b.start);
  for (const clip of sortedVideoClips) {
    const assetIdx = assets.findIndex(
      (a) => a.clip.id === clip.id && a.kind === "video",
    );
    if (assetIdx < 0) continue;
    const asset = assets[assetIdx];
    const offset = secondsToRational(clip.start, fps);
    const duration = secondsToRational(clip.duration, fps);
    const name = escapeXml(clip.label ?? clip.shotId);
    // 使用 asset-clip 引用 asset
    const trimIn = clip.trimIn ?? 0;
    const trimOut = clip.trimOut ?? clip.duration;
    lines.push(
      `            <asset-clip ref="${asset.id}" name="${name}" offset="${offset}" duration="${duration}" start="${secondsToRational(trimIn, fps)}" end="${secondsToRational(trimOut, fps)}"/>`,
    );
  }

  // voice clips 在 audio lane 上（lane="A1"）
  const sortedVoiceClips = [...voiceClips].sort((a, b) => a.start - b.start);
  if (sortedVoiceClips.length > 0) {
    lines.push(`            <audio lane="A1">`);
    for (const clip of sortedVoiceClips) {
      const assetIdx = assets.findIndex(
        (a) => a.clip.id === clip.id && a.kind === "audio",
      );
      if (assetIdx < 0) continue;
      const asset = assets[assetIdx];
      const offset = secondsToRational(clip.start, fps);
      const duration = secondsToRational(clip.duration, fps);
      const name = escapeXml(clip.label ?? clip.voiceLineId ?? clip.id);
      lines.push(
        `              <asset-clip ref="${asset.id}" name="${name}" offset="${offset}" duration="${duration}"/>`,
      );
    }
    lines.push(`            </audio>`);
  }

  // captions 作为 title 在 captions lane 上
  const sortedCaptionClips = [...captionClips].sort((a, b) => a.start - b.start);
  if (sortedCaptionClips.length > 0) {
    lines.push(`            <spine lane="V2">`);
    for (const clip of sortedCaptionClips) {
      const offset = secondsToRational(clip.start, fps);
      const duration = secondsToRational(clip.duration, fps);
      const text = escapeXml(clip.text ?? clip.label ?? "");
      lines.push(
        `              <title name="${escapeXml(clip.label ?? "Caption")}" offset="${offset}" duration="${duration}">`,
      );
      lines.push(`                <text>`);
      lines.push(`                  <text-style ref="ts1">${text}</text-style>`);
      lines.push(`                </text>`);
      lines.push(
        `                <text-style-def id="ts1">`,
      );
      lines.push(`                  <text-style font="Helvetica" fontSize="48" fontColor="1 1 1 1"/>`);
      lines.push(`                </text-style-def>`);
      lines.push(`              </title>`);
    }
    lines.push(`            </spine>`);
  }

  lines.push(`          </spine>`);
  lines.push(`        </sequence>`);
  lines.push(`      </project>`);
  lines.push(`    </event>`);
  lines.push(`  </library>`);
  lines.push(`</fcpxml>`);

  return lines.join("\n");
}
