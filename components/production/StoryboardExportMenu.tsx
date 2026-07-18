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
    // PRD §10: 服务端构建完整生产包（script + storyboard + assets + images + videos + manifest）
    // 不再在前端 JSZip 拉取 Provider 临时 URL
    if (!projectId || !sourceUnitId) {
      setProgress("缺少项目作用域，无法导出。");
      return;
    }
    if (projectId.startsWith("draft-")) {
      setProgress("请先归档草稿为正式项目再导出生产包。");
      return;
    }
    setExporting(true);
    setProgress("服务端打包中…");
    try {
      const resp = await fetch("/api/storyboard/export-package", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ projectId, sourceUnitId }),
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({})) as { error?: string; code?: string };
        throw new Error(errBody.error || `导出失败（HTTP ${resp.status}）`);
      }
      const blob = await resp.blob();
      const exportStatus = resp.headers.get("X-Export-Status") || "ok";
      const failedCount = resp.headers.get("X-Export-Failed-Count") || "0";

      // 从 Content-Disposition 提取文件名
      const cd = resp.headers.get("Content-Disposition") || "";
      const fnameMatch = cd.match(/filename="([^"]+)"/);
      const filename = fnameMatch ? fnameMatch[1] : `${projectTitle || "production"}-production-package.zip`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);

      if (exportStatus === "partial_failure") {
        setProgress(`导出完成（部分失败：${failedCount} 个文件缺失，详见 ZIP 内 manifest.json）`);
      } else {
        setProgress("生产包已下载");
      }
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
