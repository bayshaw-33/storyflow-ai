// 导出清单构建器（K2-T-08）。
//
// 交付物 5：剧本、镜头表、参考图、分镜图、视频镜头、字幕、提示词、制作证据包导出。
// 关键约束：partial failure 时不伪造完整包；导出包不依赖临时 URL。
//
// 全部为纯函数，便于 Node 测试直接导入。

import type {
  ExportPackage,
  ExportPackageKind,
  ShortDramaStages,
} from "./types.ts";

// 导出包种类定义（label 中文）。
export const EXPORT_PACKAGE_KINDS: { kind: ExportPackageKind; label: string }[] = [
  { kind: "script", label: "剧本" },
  { kind: "shot_list", label: "镜头表" },
  { kind: "reference_image", label: "参考图" },
  { kind: "storyboard_frame", label: "分镜图" },
  { kind: "video_shot", label: "视频镜头" },
  { kind: "subtitle", label: "字幕" },
  { kind: "prompt", label: "提示词" },
  { kind: "evidence", label: "制作证据包" },
];

// 判断字符串是否为临时 URL（含签名/过期参数，不应作为稳定导出引用）。
export function isTemporaryUrl(ref: string): boolean {
  // 临时签名 URL 通常含 expires / signature / X-Amz-Signature 等参数
  return (
    ref.includes("expires=") ||
    ref.includes("signature=") ||
    ref.includes("X-Amz-Signature=") ||
    ref.includes("temp=") ||
    ref.startsWith("blob:") ||
    ref.startsWith("data:")
  );
}

/**
 * 构建导出清单：根据各阶段数据生成导出包列表。
 * 缺失关键内容时标记为 missing/partial，不伪造为 ready。
 * contentRef 必须为稳定引用（相对路径或内联标识），拒绝临时 URL。
 */
export function buildExportPackages(stages: ShortDramaStages): ExportPackage[] {
  const packages: ExportPackage[] = [];

  // 1. 剧本
  const scriptText = stages.script.script.trim();
  if (scriptText.length > 0) {
    packages.push({
      id: "pkg-script",
      kind: "script",
      label: "剧本",
      status: "ready",
      contentRef: "inline://script/full-text",
    });
  } else {
    packages.push({
      id: "pkg-script",
      kind: "script",
      label: "剧本",
      status: "missing",
      missingReason: "剧本内容为空",
      contentRef: "inline://script/full-text",
    });
  }

  // 2. 镜头表（基于视频镜头）
  const shots = stages.video.shots;
  if (shots.length > 0) {
    packages.push({
      id: "pkg-shot-list",
      kind: "shot_list",
      label: "镜头表",
      status: "ready",
      contentRef: "inline://export/shot-list.json",
    });
  } else {
    packages.push({
      id: "pkg-shot-list",
      kind: "shot_list",
      label: "镜头表",
      status: "missing",
      missingReason: "无视频镜头",
      contentRef: "inline://export/shot-list.json",
    });
  }

  // 3. 参考图（基于美术资产主版本）
  const artAssets = stages.art.assets;
  const artWithMain = artAssets.filter((a) => a.mainVersionId !== null);
  if (artWithMain.length > 0) {
    packages.push({
      id: "pkg-reference-image",
      kind: "reference_image",
      label: "参考图",
      status: "ready",
      contentRef: "inline://export/reference-images.json",
    });
  } else {
    packages.push({
      id: "pkg-reference-image",
      kind: "reference_image",
      label: "参考图",
      status: "missing",
      missingReason: "无已锁定主版本的美术资产",
      contentRef: "inline://export/reference-images.json",
    });
  }

  // 4. 分镜图
  const frames = stages.storyboard.frames;
  if (frames.length > 0) {
    packages.push({
      id: "pkg-storyboard-frame",
      kind: "storyboard_frame",
      label: "分镜图",
      status: "ready",
      contentRef: "inline://export/storyboard-frames.json",
    });
  } else {
    packages.push({
      id: "pkg-storyboard-frame",
      kind: "storyboard_frame",
      label: "分镜图",
      status: "missing",
      missingReason: "无分镜帧",
      contentRef: "inline://export/storyboard-frames.json",
    });
  }

  // 5. 视频镜头：completed/pending/failed 混合 → partial；全 completed → ready
  const completedShots = shots.filter((s) => s.status === "completed");
  if (shots.length > 0 && completedShots.length === shots.length) {
    packages.push({
      id: "pkg-video-shot",
      kind: "video_shot",
      label: "视频镜头",
      status: "ready",
      contentRef: "inline://export/video-shots.json",
    });
  } else if (completedShots.length > 0) {
    packages.push({
      id: "pkg-video-shot",
      kind: "video_shot",
      label: "视频镜头",
      status: "partial",
      missingReason: `${shots.length - completedShots.length} 个镜头未完成或失败`,
      contentRef: "inline://export/video-shots.json",
    });
  } else {
    packages.push({
      id: "pkg-video-shot",
      kind: "video_shot",
      label: "视频镜头",
      status: "missing",
      missingReason: "无已完成镜头",
      contentRef: "inline://export/video-shots.json",
    });
  }

  // 6. 字幕（基于剧本 + 镜头表，有剧本即视为可生成）
  if (scriptText.length > 0 && shots.length > 0) {
    packages.push({
      id: "pkg-subtitle",
      kind: "subtitle",
      label: "字幕",
      status: "ready",
      contentRef: "inline://export/subtitles.srt",
    });
  } else {
    packages.push({
      id: "pkg-subtitle",
      kind: "subtitle",
      label: "字幕",
      status: "missing",
      missingReason: "剧本或镜头缺失，无法生成字幕",
      contentRef: "inline://export/subtitles.srt",
    });
  }

  // 7. 提示词（基于美术版本 + 分镜描述）
  const hasPrompts = artAssets.length > 0 || frames.length > 0;
  packages.push({
    id: "pkg-prompt",
    kind: "prompt",
    label: "提示词",
    status: hasPrompts ? "ready" : "missing",
    missingReason: hasPrompts ? undefined : "无美术资产或分镜描述",
    contentRef: "inline://export/prompts.json",
  });

  // 8. 制作证据包（基于全部上述包的状态：任一 missing/partial 则 partial）
  const hasMissing = packages.some((p) => p.status === "missing" || p.status === "partial");
  packages.push({
    id: "pkg-evidence",
    kind: "evidence",
    label: "制作证据包",
    status: hasMissing ? "partial" : "ready",
    missingReason: hasMissing ? "部分导出内容缺失，证据包标记为 partial，未伪造完整" : undefined,
    contentRef: "inline://export/evidence.json",
  });

  return packages;
}

// 判断导出清单是否全部 ready（导出阶段完成条件）。
export function isExportComplete(packages: ExportPackage[]): boolean {
  return packages.length > 0 && packages.every((p) => p.status === "ready");
}

// 统计导出包状态。
export function getExportStats(packages: ExportPackage[]): {
  total: number;
  ready: number;
  missing: number;
  partial: number;
} {
  return {
    total: packages.length,
    ready: packages.filter((p) => p.status === "ready").length,
    missing: packages.filter((p) => p.status === "missing").length,
    partial: packages.filter((p) => p.status === "partial").length,
  };
}
