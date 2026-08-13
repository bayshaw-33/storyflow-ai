/**
 * KIIKIS 2.1 Phase 2 — 动态宫格分镜确定性导出 (Task 2.7)
 *
 * 输出格式：
 *   - JSON  (完整 storyboard 数据，字段顺序固定)
 *   - CSV   (一行一格 frame，列顺序固定)
 *   - Markdown (团队交付格式，调用 renderTeamMarkdown)
 *   - ZIP 生产包 (含 manifest.json + README.md + 上述三个文件)
 *
 * PRD §8：
 *   - 同一输入字节级输出相同 Markdown/JSON/CSV
 *   - 字段顺序固定：镜头编号、时间点、人物名、台词、情绪、动作、运镜说明
 *   - dialogue translation 保留为后期字段，不写入主 Markdown
 *   - 禁止把 Provider URL 写入 ZIP
 *
 * ZIP 中的 manifest 可包含时间戳（用于追溯），但 manifest 的 entries 顺序由入参决定。
 */

import { createHash } from "node:crypto";
import type { DynamicGridSceneV1, DynamicGridFrameV1 } from "./dynamic-grid-contract.ts";
import { renderTeamMarkdown } from "./render-team-markdown.ts";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface DynamicGridExportInput {
  /** 场景列表（按场顺序）。 */
  scenes: ReadonlyArray<DynamicGridSceneV1>;
  /** 项目标题（写入 README / manifest）。 */
  projectTitle: string;
  /** Handoff ID（写入 README / manifest，便于溯源）。 */
  handoffId: string;
  /** 导出时间戳 (ISO)，不传则用当前时间。仅写入 manifest，不影响 Markdown/JSON/CSV 字节。 */
  exportedAt?: string;
}

export interface DynamicGridExportBundle {
  /** team-markdown.md 内容（确定性）。 */
  markdown: string;
  /** storyboard.json 内容（确定性，字段顺序固定）。 */
  json: string;
  /** frames.csv 内容（确定性，列顺序固定）。 */
  csv: string;
  /** README.md 内容。 */
  readme: string;
  /** manifest.json 内容。 */
  manifest: string;
  /** 完整 ZIP 字节。 */
  zipBytes: Uint8Array;
  /** ZIP 内所有文件的 SHA-256 清单。 */
  entries: ReadonlyArray<DynamicGridExportEntry>;
}

export interface DynamicGridExportEntry {
  path: string;
  type: "markdown" | "storyboard_json" | "frames_csv" | "readme" | "manifest";
  sha256: string;
  bytes: number;
}

// ---------------------------------------------------------------------------
// CSV 列顺序（固定）
// ---------------------------------------------------------------------------

export const DYNAMIC_GRID_CSV_COLUMNS = [
  "SceneId",
  "ContinuityMode",
  "GridCount",
  "FrameOrder",
  "Timecode",
  "CharacterIds",
  "Dialogue",
  "Emotion",
  "Action",
  "CameraMovement",
  "ShotSize",
  "VisualDescription",
  "Locked",
  "UserEdited",
] as const;

// ---------------------------------------------------------------------------
// 确定性 JSON
// ---------------------------------------------------------------------------

/**
 * 渲染确定性 JSON（字段顺序固定，2 空格缩进，无 trailing newline）。
 * 同一输入 → 字节级相同输出。
 */
export function exportDynamicGridJson(scenes: ReadonlyArray<DynamicGridSceneV1>): string {
  const payload = {
    schemaVersion: "kiikis.dynamic-grid-storyboard/1",
    sceneCount: scenes.length,
    frameCount: scenes.reduce((n, s) => n + s.frames.length, 0),
    scenes: scenes.map((s) => ({
      schemaVersion: s.schemaVersion,
      handoffId: s.handoffId,
      sceneId: s.sceneId,
      continuityMode: s.continuityMode,
      gridCount: s.gridCount,
      gridRationale: s.gridRationale,
      spatialPlan: {
        axis: s.spatialPlan.axis,
        entrances: [...s.spatialPlan.entrances],
        screenDirections: [...s.spatialPlan.screenDirections],
      },
      sharedCinematography: s.sharedCinematography,
      negativePrompt: s.negativePrompt,
      frames: s.frames.map(serializeFrameForJson),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

function serializeFrameForJson(f: DynamicGridFrameV1) {
  // 字段顺序固定：与 PRD §8 一致（编号、时间点、人物、台词、情绪、动作、运镜）+ 元数据
  return {
    id: f.id,
    order: f.order,
    aspectRatio: f.aspectRatio,
    timecode: f.timecode,
    characterIds: [...f.characterIds],
    dialogue: f.dialogue,
    emotion: f.emotion,
    action: f.action,
    cameraMovement: f.cameraMovement,
    shotSize: f.shotSize,
    visualDescription: f.visualDescription,
    locked: f.locked,
    userEdited: f.userEdited,
  };
}

// ---------------------------------------------------------------------------
// 确定性 CSV
// ---------------------------------------------------------------------------

/**
 * 渲染确定性 CSV（一行一格 frame，列顺序固定，CRLF 行尾）。
 * 同一输入 → 字节级相同输出。
 */
export function exportDynamicGridCsv(scenes: ReadonlyArray<DynamicGridSceneV1>): string {
  const rows: string[] = [DYNAMIC_GRID_CSV_COLUMNS.join(",")];
  for (const scene of scenes) {
    for (const frame of scene.frames) {
      rows.push([
        csvEscape(scene.sceneId),
        csvEscape(scene.continuityMode),
        scene.gridCount,
        frame.order,
        csvEscape(frame.timecode),
        csvEscape(frame.characterIds.join("|")),
        csvEscape(frame.dialogue),
        csvEscape(frame.emotion),
        csvEscape(frame.action),
        csvEscape(frame.cameraMovement),
        csvEscape(frame.shotSize),
        csvEscape(frame.visualDescription),
        frame.locked ? "Y" : "N",
        frame.userEdited ? "Y" : "N",
      ].join(","));
    }
  }
  // CRLF 行尾保证跨平台确定性
  return rows.join("\r\n") + "\r\n";
}

function csvEscape(value: string): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// README
// ---------------------------------------------------------------------------

export function buildDynamicGridReadme(input: {
  projectTitle: string;
  handoffId: string;
  sceneCount: number;
  frameCount: number;
  exportedAt: string;
}): string {
  return [
    `# ${input.projectTitle} — 动态宫格分镜生产包`,
    "",
    `- Handoff ID：${input.handoffId}`,
    `- 导出时间：${input.exportedAt}`,
    `- 场景数：${input.sceneCount}`,
    `- 镜头总数：${input.frameCount}`,
    "",
    "## 文件清单",
    "",
    "- `team-markdown.md` — 团队交付 Markdown（确定性，字段顺序固定）",
    "- `storyboard.json` — 完整分镜数据（确定性 JSON）",
    "- `frames.csv` — 镜头表（确定性 CSV，CRLF 行尾）",
    "- `manifest.json` — 文件清单（路径 / 类型 / SHA-256 / 字节数）",
    "",
    "## 字段顺序 (PRD §8)",
    "",
    "镜头编号 → 时间点 → 人物名 → 台词 → 情绪 → 动作 → 运镜说明",
    "",
    "dialogue translation 保留为后期字段，不写入主 Markdown。",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// SHA-256
// ---------------------------------------------------------------------------

export function sha256Hex(bytes: Uint8Array | string): string {
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return createHash("sha256").update(data).digest("hex");
}

// ---------------------------------------------------------------------------
// ZIP 生产包
// ---------------------------------------------------------------------------

/**
 * 构建动态宫格分镜生产包 ZIP。
 *
 * Markdown / JSON / CSV 部分确定性；manifest.readme 含时间戳。
 * 同一 scenes 输入下，三个核心文件字节级相同。
 */
export async function buildDynamicGridPackage(
  input: DynamicGridExportInput,
): Promise<DynamicGridExportBundle> {
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const markdown = renderTeamMarkdown({
    scenes: input.scenes,
    projectTitle: input.projectTitle,
    handoffId: input.handoffId,
  });
  const json = exportDynamicGridJson(input.scenes);
  const csv = exportDynamicGridCsv(input.scenes);

  const sceneCount = input.scenes.length;
  const frameCount = input.scenes.reduce((n, s) => n + s.frames.length, 0);

  const readme = buildDynamicGridReadme({
    projectTitle: input.projectTitle,
    handoffId: input.handoffId,
    sceneCount,
    frameCount,
    exportedAt,
  });

  // 动态 import jszip，避免纯函数 (markdown/json/csv) 路径强依赖 jszip。
  // 在未安装 jszip 的环境 (如 CI 局部运行) 下，仍可使用确定性纯导出。
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const entries: DynamicGridExportEntry[] = [];

  function addFile(path: string, type: DynamicGridExportEntry["type"], content: string): void {
    const bytes = new TextEncoder().encode(content);
    zip.file(path, bytes);
    entries.push({
      path,
      type,
      sha256: sha256Hex(bytes),
      bytes: bytes.byteLength,
    });
  }

  addFile("team-markdown.md", "markdown", markdown);
  addFile("storyboard.json", "storyboard_json", json);
  addFile("frames.csv", "frames_csv", csv);
  addFile("README.md", "readme", readme);

  const manifest = JSON.stringify({
    projectTitle: input.projectTitle,
    handoffId: input.handoffId,
    schemaVersion: "kiikis.dynamic-grid-storyboard/1",
    exportedAt,
    sceneCount,
    frameCount,
    entries,
  }, null, 2);
  addFile("manifest.json", "manifest", manifest);

  const zipBytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

  return {
    markdown,
    json,
    csv,
    readme,
    manifest,
    zipBytes,
    entries,
  };
}
