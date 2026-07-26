/**
 * TRAE-V2-06 Editor Framework — 导出器统一入口
 *
 * 支持格式：
 *   - fcpxml: Final Cut Pro XML 1.9（推荐，支持三轨）
 *   - edl: CMX 3600 EDL（最通用，仅 video 轨 + 音频/字幕注释）
 *
 * 使用示例：
 *   import { serializeToFormat, EXPORT_FORMATS } from "@/lib/editor/exporters";
 *   const content = serializeToFormat(timeline, "fcpxml");
 */

import type { KiikisTimeline } from "../types.ts";
import { serializeToFCPXML, FCPXML_VERSION, DEFAULT_FPS as FCPXML_FPS } from "./fcpxml.ts";
import { serializeToEDL, DEFAULT_FPS as EDL_FPS } from "./edl.ts";

export type ExportFormat = "fcpxml" | "edl";

export const EXPORT_FORMATS: ExportFormat[] = ["fcpxml", "edl"];

export type ExportOptions = {
  fps?: number;
  projectName?: string;
  title?: string;
};

export type ExportResult = {
  format: ExportFormat;
  content: string;
  mimeType: string;
  fileExtension: string;
  /** 供 Content-Disposition 使用 */
  suggestedFilename: string;
};

export function isSupportedFormat(format: string): format is ExportFormat {
  return format === "fcpxml" || format === "edl";
}

/**
 * 按指定格式序列化 timeline
 */
export function serializeToFormat(
  timeline: KiikisTimeline,
  format: ExportFormat,
  options: ExportOptions = {},
): ExportResult {
  const fps = options.fps ?? FCPXML_FPS;
  const projectName = options.projectName ?? `Kiikis-${timeline.projectId}`;

  switch (format) {
    case "fcpxml": {
      const content = serializeToFCPXML(timeline, {
        fps,
        projectName,
        eventTitle: options.title ?? "Kiikis Export",
      });
      return {
        format: "fcpxml",
        content,
        mimeType: "application/x-fcpxml+xml; charset=utf-8",
        fileExtension: "fcpxml",
        suggestedFilename: `${sanitizeFilename(projectName)}.fcpxml`,
      };
    }
    case "edl": {
      const content = serializeToEDL(timeline, {
        fps,
        title: projectName,
      });
      return {
        format: "edl",
        content,
        mimeType: "text/plain; charset=utf-8",
        fileExtension: "edl",
        suggestedFilename: `${sanitizeFilename(projectName)}.edl`,
      };
    }
    // 不使用 default 分支，让 TS 穷尽性检查生效
  }
  // 理论上不会到达这里
  throw new Error(`UNSUPPORTED_FORMAT:${format}`);
}

/**
 * 获取格式的描述信息（用于 UI 展示）
 */
export function getFormatInfo(format: ExportFormat): {
  displayName: string;
  description: string;
  extensions: string[];
  compatibleApps: string[];
} {
  switch (format) {
    case "fcpxml":
      return {
        displayName: "Final Cut XML",
        description: `FCPXML ${FCPXML_VERSION}，支持视频+音频+字幕三轨`,
        extensions: [".fcpxml"],
        compatibleApps: ["Final Cut Pro", "DaVinci Resolve", "Premiere Pro", "Avid Media Composer"],
      };
    case "edl":
      return {
        displayName: "EDL (CMX 3600)",
        description: "最通用的剪辑表格式，仅视频轨 + 音频/字幕注释",
        extensions: [".edl"],
        compatibleApps: ["所有专业剪辑软件"],
      };
  }
}

function sanitizeFilename(name: string): string {
  // 替换文件名非法字符
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 100);
}
