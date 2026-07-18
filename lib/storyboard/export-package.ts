/**
 * Production Package Export — PRD §10 TRAE-PW-P0-006.
 *
 * 构建完整生产包 ZIP（服务端）：
 *
 *   <project>-<episode>-production-package.zip
 *   ├─ script.txt              — 原始剧本文本
 *   ├─ storyboard.json         — Scene/Shot/revision/稳定 ID/asset version 引用
 *   ├─ shot-list.csv           — 一行一个 Shot
 *   ├─ jimeng-prompts.md       — 按 Shot 排列的提示词
 *   ├─ manifest.json           — 每个文件的路径/类型/来源 ID/SHA-256/状态
 *   ├─ README.md               — 项目名/集/revision/时间/计数
 *   ├─ assets/
 *   │  ├─ characters/
 *   │  ├─ locations/
 *   │  └─ props/
 *   ├─ storyboard-images/
 *   └─ videos/
 *
 * PRD §10.3 fail-closed：
 *   - 任一资产下载失败 → manifest 标记 partial_failure，不写 .failed.txt
 *   - 禁止把 Provider URL / 下载失败 URL 写入 ZIP
 *   - 所有文件由服务端从 storage_path 直接拉取（service role key），不依赖客户端签名 URL
 *   - manifest 含 SHA-256，ZIP 下载后可重新校验
 *   - 不能把 HTTP 404/403 响应体当文件写进 ZIP
 */

import JSZip from "jszip";
import { createHash } from "node:crypto";
import type { StoryboardScene } from "@/lib/storyboard/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFileEntry = {
  path: string;
  type: "script" | "storyboard" | "shot_list" | "prompts" | "manifest" | "readme" | "asset" | "storyboard_image" | "video";
  sourceId: string;
  sha256: string | null;
  status: "ok" | "missing" | "fetch_failed";
  errorCode?: string;
};

export type ExportManifest = {
  projectId: string;
  sourceUnitId: string;
  revision: number;
  exportedAt: string;
  overallStatus: "ok" | "partial_failure";
  entries: ExportFileEntry[];
  counts: {
    scenes: number;
    shots: number;
    assets: number;
    storyboardImages: number;
    videos: number;
    failed: number;
  };
};

export type ExportPackageInput = {
  userId: string;
  projectId: string;
  sourceUnitId: string;
  projectTitle: string;
  manuscript: string;
  revision: number;
  scenes: StoryboardScene[];
  /** Art assets grouped by type, each with storagePath + stable id. */
  assets: Array<{
    id: string;
    assetType: "character" | "location" | "prop";
    storagePath: string | null;
    displayName: string;
  }>;
  /** Completed storyboard image jobs for the episode. */
  storyboardImages: Array<{
    jobId: string;
    shotId: string;
    storagePath: string | null;
    resultUrl: string | null;
    contentType: string;
  }>;
  /** Completed + transferred video jobs for the episode. */
  videos: Array<{
    jobId: string;
    shotId: string;
    storagePath: string | null;
    contentType: string;
  }>;
  /** Storage fetcher — injectable for testing. Returns bytes or throws. */
  fetchStorageBytes: (bucket: string, storagePath: string) => Promise<Uint8Array>;
};

export type ExportPackageResult = {
  zipBytes: Uint8Array;
  manifest: ExportManifest;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ART_BUCKET = "art-assets";
const VIDEO_BUCKET = "storyboard-videos";

// ---------------------------------------------------------------------------
// Builders (pure — testable without Supabase)
// ---------------------------------------------------------------------------

export function buildShotListCsv(scenes: StoryboardScene[]): string {
  const headers = ["SceneOrder", "ShotOrder", "ShotId", "Location", "TimeOfDay", "ShotSize", "Camera", "Angle", "Duration", "Dialogue", "VisualDescription", "StoryBeat", "Emotion", "Confirmed", "Locked"];
  const rows: string[] = [headers.join(",")];
  for (const scene of scenes) {
    for (const shot of scene.shots) {
      rows.push([
        scene.order,
        shot.order,
        csvEscape(shot.id ?? shot.clientId ?? ""),
        csvEscape(scene.location),
        csvEscape(scene.timeOfDay),
        csvEscape(shot.shotSize),
        csvEscape(shot.cameraMovement),
        csvEscape(shot.angle),
        shot.durationSeconds,
        csvEscape(shot.dialogue),
        csvEscape(shot.visualDescription),
        csvEscape(shot.storyBeat),
        csvEscape(shot.emotion),
        shot.confirmed ? "Y" : "N",
        shot.locked ? "Y" : "N",
      ].join(","));
    }
  }
  return rows.join("\n");
}

export function buildJimengPromptsMd(scenes: StoryboardScene[]): string {
  const lines: string[] = [
    `# 即梦视频提示词 — ${new Date().toISOString()}`,
    "",
    `共 ${scenes.length} 场，${scenes.reduce((n, s) => n + s.shots.length, 0)} 个 Shot。`,
    "",
  ];
  let shotIndex = 0;
  for (const scene of scenes) {
    lines.push(`## 第 ${scene.order} 场 — ${scene.heading || ""}`);
    lines.push("");
    lines.push(`- 场景：${scene.location || "—"}`);
    lines.push(`- 时间：${scene.timeOfDay || "—"}`);
    lines.push(`- 梗概：${scene.summary || "—"}`);
    lines.push("");
    for (const shot of scene.shots) {
      shotIndex += 1;
      lines.push(`### Shot ${shotIndex} (S${scene.order}-SHOT${shot.order})`);
      lines.push("");
      lines.push(`- 景别/机位：${shot.shotSize} / ${shot.cameraMovement} / ${shot.angle}`);
      lines.push(`- 时长：${shot.durationSeconds}s`);
      lines.push(`- 视觉描述：${shot.visualDescription || "—"}`);
      if (shot.dialogue) lines.push(`- 台词：${shot.dialogue}`);
      if (shot.emotion) lines.push(`- 表情情绪：${shot.emotion}`);
      lines.push("");
      lines.push("**即梦提示词：**");
      lines.push("```");
      lines.push(shot.jimengPromptZh || "（未生成）");
      lines.push("```");
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }
  return lines.join("\n");
}

export function buildReadme(input: {
  projectTitle: string;
  sourceUnitId: string;
  revision: number;
  sceneCount: number;
  shotCount: number;
  assetCount: number;
  imageCount: number;
  videoCount: number;
  failedCount: number;
  overallStatus: "ok" | "partial_failure";
}): string {
  return [
    `# ${input.projectTitle} — 生产包`,
    "",
    `- 集 ID：${input.sourceUnitId}`,
    `- Revision：${input.revision}`,
    `- 导出时间：${new Date().toISOString()}`,
    `- 整体状态：${input.overallStatus === "ok" ? "完整" : "部分失败（见 manifest.json）"}`,
    "",
    "## 计数",
    "",
    `- 场景：${input.sceneCount}`,
    `- 镜头：${input.shotCount}`,
    `- 资产：${input.assetCount}`,
    `- 分镜图：${input.imageCount}`,
    `- 视频：${input.videoCount}`,
    `- 失败：${input.failedCount}`,
    "",
    "## 目录结构",
    "",
    "- `script.txt` — 原始剧本文本",
    "- `storyboard.json` — 完整分镜数据（scenes + revision）",
    "- `shot-list.csv` — 分镜表",
    "- `jimeng-prompts.md` — 即梦视频提示词",
    "- `manifest.json` — 文件清单（路径/类型/来源 ID/SHA-256/状态）",
    "- `assets/characters/` — 人物资产（已选主参考版本）",
    "- `assets/locations/` — 场景资产",
    "- `assets/props/` — 道具资产",
    "- `storyboard-images/` — 已确认分镜图",
    "- `videos/` — completed 且已转存的视频",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// SHA-256 helper
// ---------------------------------------------------------------------------

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// ---------------------------------------------------------------------------
// Core: build production package ZIP
// ---------------------------------------------------------------------------

export async function buildProductionPackage(input: ExportPackageInput): Promise<ExportPackageResult> {
  const zip = new JSZip();
  const entries: ExportFileEntry[] = [];
  let failedCount = 0;

  // --- 1. script.txt ---
  const scriptBytes = new TextEncoder().encode(input.manuscript || "");
  zip.file("script.txt", scriptBytes);
  const hasScript = input.manuscript.trim().length > 0;
  entries.push({
    path: "script.txt",
    type: "script",
    sourceId: input.sourceUnitId,
    sha256: hasScript ? sha256Hex(scriptBytes) : null,
    status: hasScript ? "ok" : "missing",
    ...(hasScript ? {} : { errorCode: "SCRIPT_SOURCE_MISSING" }),
  });
  if (!hasScript) failedCount += 1;

  // --- 2. storyboard.json ---
  const storyboardJson = JSON.stringify({
    projectId: input.projectId,
    sourceUnitId: input.sourceUnitId,
    revision: input.revision,
    exportedAt: new Date().toISOString(),
    scenes: input.scenes,
  }, null, 2);
  const storyboardBytes = new TextEncoder().encode(storyboardJson);
  zip.file("storyboard.json", storyboardBytes);
  entries.push({
    path: "storyboard.json",
    type: "storyboard",
    sourceId: input.sourceUnitId,
    sha256: sha256Hex(storyboardBytes),
    status: "ok",
  });

  // --- 3. shot-list.csv ---
  const shotListCsv = buildShotListCsv(input.scenes);
  zip.file("shot-list.csv", shotListCsv);
  entries.push({
    path: "shot-list.csv",
    type: "shot_list",
    sourceId: input.sourceUnitId,
    sha256: sha256Hex(new TextEncoder().encode(shotListCsv)),
    status: "ok",
  });

  // --- 4. jimeng-prompts.md ---
  const promptsMd = buildJimengPromptsMd(input.scenes);
  zip.file("jimeng-prompts.md", promptsMd);
  entries.push({
    path: "jimeng-prompts.md",
    type: "prompts",
    sourceId: input.sourceUnitId,
    sha256: sha256Hex(new TextEncoder().encode(promptsMd)),
    status: "ok",
  });

  // --- 5. assets/{characters,locations,props}/ ---
  for (const asset of input.assets) {
    const folder = asset.assetType === "character" ? "characters" : asset.assetType === "location" ? "locations" : "props";
    const safeName = sanitizeFilename(asset.displayName || asset.id);
    if (!asset.storagePath) {
      // PRD §10.3：缺失 storage_path 标记 missing，不写 .failed.txt
      entries.push({
        path: `assets/${folder}/${safeName}`,
        type: "asset",
        sourceId: asset.id,
        sha256: null,
        status: "missing",
        errorCode: "NO_STORAGE_PATH",
      });
      failedCount += 1;
      continue;
    }
    try {
      const bytes = await input.fetchStorageBytes(ART_BUCKET, asset.storagePath);
      const ext = guessExtFromBytes(bytes);
      const filePath = `assets/${folder}/${safeName}.${ext}`;
      zip.file(filePath, bytes);
      entries.push({
        path: filePath,
        type: "asset",
        sourceId: asset.id,
        sha256: sha256Hex(bytes),
        status: "ok",
      });
    } catch (err) {
      const code = err instanceof Error ? err.message.slice(0, 80) : "FETCH_FAILED";
      entries.push({
        path: `assets/${folder}/${safeName}`,
        type: "asset",
        sourceId: asset.id,
        sha256: null,
        status: "fetch_failed",
        errorCode: code,
      });
      failedCount += 1;
    }
  }

  // --- 6. storyboard-images/ ---
  for (const img of input.storyboardImages) {
    const safeShotId = sanitizeFilename(img.shotId);
    if (!img.storagePath) {
      entries.push({
        path: `storyboard-images/${safeShotId}`,
        type: "storyboard_image",
        sourceId: img.jobId,
        sha256: null,
        status: "missing",
        errorCode: "NO_STORAGE_PATH",
      });
      failedCount += 1;
      continue;
    }
    try {
      const bytes = await input.fetchStorageBytes(ART_BUCKET, img.storagePath);
      const ext = guessExtFromBytes(bytes);
      const filePath = `storyboard-images/${safeShotId}.${ext}`;
      zip.file(filePath, bytes);
      entries.push({
        path: filePath,
        type: "storyboard_image",
        sourceId: img.jobId,
        sha256: sha256Hex(bytes),
        status: "ok",
      });
    } catch (err) {
      const code = err instanceof Error ? err.message.slice(0, 80) : "FETCH_FAILED";
      entries.push({
        path: `storyboard-images/${safeShotId}`,
        type: "storyboard_image",
        sourceId: img.jobId,
        sha256: null,
        status: "fetch_failed",
        errorCode: code,
      });
      failedCount += 1;
    }
  }

  // --- 7. videos/ ---
  for (const video of input.videos) {
    const safeShotId = sanitizeFilename(video.shotId);
    if (!video.storagePath) {
      entries.push({
        path: `videos/${safeShotId}`,
        type: "video",
        sourceId: video.jobId,
        sha256: null,
        status: "missing",
        errorCode: "NO_STORAGE_PATH",
      });
      failedCount += 1;
      continue;
    }
    try {
      const bytes = await input.fetchStorageBytes(VIDEO_BUCKET, video.storagePath);
      const ext = guessVideoExt(video.contentType);
      const filePath = `videos/${safeShotId}.${ext}`;
      zip.file(filePath, bytes);
      entries.push({
        path: filePath,
        type: "video",
        sourceId: video.jobId,
        sha256: sha256Hex(bytes),
        status: "ok",
      });
    } catch (err) {
      const code = err instanceof Error ? err.message.slice(0, 80) : "FETCH_FAILED";
      entries.push({
        path: `videos/${safeShotId}`,
        type: "video",
        sourceId: video.jobId,
        sha256: null,
        status: "fetch_failed",
        errorCode: code,
      });
      failedCount += 1;
    }
  }

  // --- 8. manifest.json ---
  const shotCount = input.scenes.reduce((n, s) => n + s.shots.length, 0);
  const manifest: ExportManifest = {
    projectId: input.projectId,
    sourceUnitId: input.sourceUnitId,
    revision: input.revision,
    exportedAt: new Date().toISOString(),
    overallStatus: failedCount > 0 ? "partial_failure" : "ok",
    entries,
    counts: {
      scenes: input.scenes.length,
      shots: shotCount,
      assets: input.assets.length,
      storyboardImages: input.storyboardImages.length,
      videos: input.videos.length,
      failed: failedCount,
    },
  };
  const manifestJson = JSON.stringify(manifest, null, 2);
  zip.file("manifest.json", manifestJson);
  entries.push({
    path: "manifest.json",
    type: "manifest",
    sourceId: input.sourceUnitId,
    sha256: sha256Hex(new TextEncoder().encode(manifestJson)),
    status: "ok",
  });

  // --- 9. README.md ---
  const readme = buildReadme({
    projectTitle: input.projectTitle,
    sourceUnitId: input.sourceUnitId,
    revision: input.revision,
    sceneCount: input.scenes.length,
    shotCount,
    assetCount: input.assets.length,
    imageCount: input.storyboardImages.length,
    videoCount: input.videos.length,
    failedCount,
    overallStatus: manifest.overallStatus,
  });
  zip.file("README.md", readme);
  entries.push({
    path: "README.md",
    type: "readme",
    sourceId: input.sourceUnitId,
    sha256: sha256Hex(new TextEncoder().encode(readme)),
    status: "ok",
  });

  const zipBytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return { zipBytes, manifest };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function csvEscape(value: string): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function sanitizeFilename(name: string): string {
  return (name || "unnamed").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "unnamed";
}

function guessExtFromBytes(bytes: Uint8Array): string {
  // PNG: 89 50 4E 47; JPEG: FF D8 FF; WebP: 52 49 46 46 ... 57 45 42 50
  if (bytes.length >= 4) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp";
  }
  return "png";
}

function guessVideoExt(contentType: string): string {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("webm")) return "webm";
  if (ct.includes("quicktime") || ct.includes("mov")) return "mov";
  return "mp4";
}
