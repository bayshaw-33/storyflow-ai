/**
 * StoryboardExportMenu — 任务 3 (KIIKIS-P2-TRAE-002)
 *
 * 分镜包 ZIP 升级：
 *   storyboard.json           — 完整 scenes + assets + revision
 *   jimeng-prompts.md         — 每个 Shot 的即梦提示词 + 视频文件名引用
 *   video-list.csv            — Shot, 时长, 画幅, 生成时间, 成本估算, 状态
 *   videos/shot-001.mp4       — 视频文件（仅 completed 状态）
 *   shots.csv                 — 分镜表（Scene/Shot/VisualDescription/...）
 *
 * 仅在前端打包，不调用服务端。视频文件通过 fetch 拉取后塞入 ZIP。
 */

import { useState } from "react";
import JSZip from "jszip";
import { ChevronDown, Download, FileArchive, Loader2, ShieldCheck } from "lucide-react";
import type { StoryboardScene, StoryboardShot } from "@/lib/storyboard/contracts";
import { requestEvidencePackageDownload } from "@/lib/evidence/download";
import type { VideoJobMap } from "./ShotVideoPanel";

type Props = {
  projectId: string;
  sourceUnitId: string;
  projectTitle: string;
  scenes: StoryboardScene[];
  revision: number;
  videoJobs: VideoJobMap;
  accessToken?: string;
};

export function StoryboardExportMenu(props: Props) {
  const { projectId, sourceUnitId, projectTitle, scenes, revision, videoJobs, accessToken = "" } = props;
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<string>("");

  async function handleEvidencePackageDownload() {
    setOpen(false);
    setExporting(true);
    setProgress("正在整理制作留痕…");
    try {
      const result = await requestEvidencePackageDownload({ accessToken, projectId, sourceUnitId });
      const safeTitle = (projectTitle || "kiikis").replace(/[^\w\u4e00-\u9fa5-]/g, "_");
      const link = document.createElement("a");
      link.href = result.downloadUrl;
      link.download = `${safeTitle}-制作证据包.zip`;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setProgress("制作证据包已开始下载");
    } catch (error) {
      setProgress(error instanceof Error ? error.message : "制作证据包下载失败。");
    } finally {
      setExporting(false);
    }
  }

  async function handleExportZip() {
    setExporting(true);
    setProgress("准备打包…");
    try {
      const zip = new JSZip();
      const safeTitle = (projectTitle || "storyboard").replace(/[^\w\u4e00-\u9fa5-]/g, "_");

      // 1. storyboard.json
      setProgress("写入 storyboard.json…");
      zip.file("storyboard.json", JSON.stringify({
        projectId,
        sourceUnitId,
        revision,
        exportedAt: new Date().toISOString(),
        scenes,
      }, null, 2));

      // 2. shots.csv
      setProgress("写入 shots.csv…");
      zip.file("shots.csv", buildShotsCsv(scenes));

      // 3. jimeng-prompts.md（每个 Shot 追加视频文件名引用）
      setProgress("写入 jimeng-prompts.md…");
      zip.file("jimeng-prompts.md", buildJimengPromptsMd(scenes, videoJobs));

      // 4. video-list.csv
      setProgress("写入 video-list.csv…");
      zip.file("video-list.csv", buildVideoListCsv(scenes, videoJobs));

      // 5. videos/ 目录（仅 completed 状态，fetch 拉取后塞入）
      const videosFolder = zip.folder("videos");
      if (videosFolder) {
        const completedShots = scenes.flatMap((s) => s.shots).map((sh, i) => ({ shot: sh, index: i + 1 })).filter(({ shot }) => {
          const id = shot.id ?? shot.clientId ?? "";
          return videoJobs[id]?.status === "completed" && videoJobs[id]?.videoUrl;
        });
        for (const { shot, index } of completedShots) {
          const id = shot.id ?? shot.clientId ?? "";
          const url = videoJobs[id]?.videoUrl;
          if (!url) continue;
          const filename = `shot-${String(index).padStart(3, "0")}.mp4`;
          setProgress(`下载视频 ${filename}…`);
          try {
            const resp = await fetch(url);
            const blob = await resp.blob();
            videosFolder.file(filename, blob);
          } catch {
            // 单个视频下载失败不阻塞整个 ZIP
            videosFolder.file(`${filename}.failed.txt`, `下载失败: ${url}\n时间: ${new Date().toISOString()}`);
          }
        }
      }

      // 6. README.md
      zip.file("README.md", buildReadme(projectTitle, sourceUnitId, revision, scenes.length));

      setProgress("压缩中…");
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeTitle}-storyboard.zip`;
      link.click();
      URL.revokeObjectURL(url);
      setProgress("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProgress(`导出失败: ${message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={exporting}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "8px 16px", borderRadius: 8,
          border: "1px solid #75dbc6", background: "rgba(117,219,198,0.12)",
          color: "#75dbc6", fontSize: 13, fontWeight: 600,
          cursor: exporting ? "not-allowed" : "pointer",
        }}
      >
        {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        {exporting ? "导出中…" : "导出"}
        <ChevronDown size={12} style={{ opacity: 0.6 }} />
      </button>

      {open && !exporting ? (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 998 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", top: "100%", right: 0, marginTop: 6,
            minWidth: 260, background: "#0d0f10", border: "1px solid #2a2d30",
            borderRadius: 10, padding: 4, zIndex: 999,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}>
            <button
              type="button"
              onClick={handleExportZip}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "10px 12px", border: "none", background: "transparent",
                borderRadius: 6, cursor: "pointer", textAlign: "left", color: "#e0e0e0",
              }}
            >
              <FileArchive size={16} color="#75dbc6" />
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>分镜包 ZIP</span>
                <span style={{ fontSize: 11, color: "#888" }}>
                  storyboard.json + jimeng-prompts.md + video-list.csv + videos/
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={handleEvidencePackageDownload}
              disabled={!accessToken || !projectId || !sourceUnitId || projectId.startsWith("draft-")}
              title={!accessToken ? "请先登录" : projectId.startsWith("draft-") ? "请先将草稿归档为项目" : undefined}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "10px 12px", border: "none", background: "transparent",
                borderRadius: 6, cursor: accessToken && projectId && sourceUnitId && !projectId.startsWith("draft-") ? "pointer" : "not-allowed",
                textAlign: "left", color: "#e0e0e0", opacity: accessToken && projectId && sourceUnitId && !projectId.startsWith("draft-") ? 1 : 0.5,
              }}
            >
              <ShieldCheck size={16} color="#75dbc6" />
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>下载制作证据包</span>
                <span style={{ fontSize: 11, color: "#888" }}>
                  时间线 + 哈希清单 + 已上传授权材料（5 分钟私密链接）
                </span>
              </span>
            </button>
            <p style={{ margin: "4px 12px 8px 38px", color: "#666", fontSize: 10, lineHeight: 1.4 }}>
              用于制作过程核验，不替代法律确权结论。
            </p>
          </div>
        </>
      ) : null}

      {progress ? (
        <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, padding: "8px 12px", background: "#0d0f10", border: "1px solid #2a2d30", borderRadius: 8, fontSize: 12, color: "#75dbc6", zIndex: 999, whiteSpace: "nowrap" }}>
          {progress}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildShotsCsv(scenes: StoryboardScene[]): string {
  const headers = ["SceneOrder", "ShotOrder", "Location", "TimeOfDay", "ShotSize", "Camera", "Angle", "Duration", "Dialogue", "VisualDescription", "StoryBeat", "Emotion", "Confirmed", "Locked"];
  const rows: string[] = [headers.join(",")];
  for (const scene of scenes) {
    for (const shot of scene.shots) {
      const cells = [
        scene.order,
        shot.order,
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
      ];
      rows.push(cells.join(","));
    }
  }
  return rows.join("\n");
}

function buildJimengPromptsMd(scenes: StoryboardScene[], videoJobs: VideoJobMap): string {
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
      const shotId = shot.id ?? shot.clientId ?? "";
      const videoState = videoJobs[shotId];
      const videoFilename = videoState?.status === "completed" ? `videos/shot-${String(shotIndex).padStart(3, "0")}.mp4` : null;
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
      if (videoFilename) {
        lines.push(`**视频文件：** [\`${videoFilename}\`](${videoFilename})`);
        if (videoState.durationSeconds) lines.push(`- 时长：${videoState.durationSeconds}s`);
        if (videoState.costEstimate !== null) lines.push(`- 估算成本：${videoState.costEstimate} 积分`);
        lines.push("");
      } else {
        lines.push(`**视频文件：** 未生成或失败（状态：${videoState?.status ?? "idle"}）`);
        lines.push("");
      }
      lines.push("---");
      lines.push("");
    }
  }
  return lines.join("\n");
}

function buildVideoListCsv(scenes: StoryboardScene[], videoJobs: VideoJobMap): string {
  const headers = ["ShotIndex", "SceneOrder", "ShotOrder", "ShotId", "Duration", "AspectRatio", "GeneratedAt", "CostEstimate", "Status", "VideoFile", "Error"];
  const rows: string[] = [headers.join(",")];
  let shotIndex = 0;
  for (const scene of scenes) {
    for (const shot of scene.shots) {
      shotIndex += 1;
      const shotId = shot.id ?? shot.clientId ?? "";
      const v = videoJobs[shotId];
      const videoFile = v?.status === "completed" ? `videos/shot-${String(shotIndex).padStart(3, "0")}.mp4` : "";
      rows.push([
        shotIndex,
        scene.order,
        shot.order,
        csvEscape(shotId),
        v?.durationSeconds ?? "",
        v?.aspectRatio ?? "9:16",
        v?.finishedAt ? new Date(v.finishedAt).toISOString() : "",
        v?.costEstimate ?? "",
        v?.status ?? "idle",
        csvEscape(videoFile),
        csvEscape(v?.error ?? ""),
      ].join(","));
    }
  }
  return rows.join("\n");
}

function buildReadme(title: string, sourceUnitId: string, revision: number, sceneCount: number): string {
  return [
    `# ${title} — 分镜包`,
    "",
    `- 集源 ID：${sourceUnitId}`,
    `- Revision：${revision}`,
    `- 场景数：${sceneCount}`,
    `- 导出时间：${new Date().toISOString()}`,
    "",
    "## 内容",
    "",
    "- `storyboard.json` — 完整分镜数据（scenes + assets + revision）",
    "- `shots.csv` — 分镜表（含景别/机位/对白/视觉描述等）",
    "- `jimeng-prompts.md` — 即梦视频提示词（每个 Shot 追加视频文件名引用）",
    "- `video-list.csv` — 视频清单（Shot/时长/画幅/生成时间/成本估算/状态）",
    "- `videos/` — 视频文件（仅 completed 状态，按 shot-001.mp4 命名）",
    "",
  ].join("\n");
}

function csvEscape(value: string): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
