"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, Download, Loader2, Save, UploadCloud } from "lucide-react";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ViralAnalysis = {
  f1_hook?: {
    duration?: string;
    type?: string;
    emotion?: string;
    description?: string;
  };
  f2_body?: {
    rhythm?: string;
    emotion_curve?: string;
    description?: string;
  };
  f3_action?: {
    key_actions?: string[];
    turning_point?: string;
    description?: string;
  };
  f4_result?: {
    climax?: string;
    presentation?: string;
    description?: string;
  };
  f5_memory?: {
    formula?: string;
    tags?: string[];
    description?: string;
  };
  raw_storyboard?: string;
};

type ViralVersion = {
  id: string;
  version_type: string;
  title: string | null;
  content_markdown: string | null;
  created_at: string;
};

type TaskStatus = "idle" | "queued" | "running" | "completed" | "failed";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

export default function ViralWorkbenchPage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState("");
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<ViralAnalysis | null>(null);
  const [remakeResult, setRemakeResult] = useState<string | null>(null);
  const [rewriteInput, setRewriteInput] = useState("");
  const [attachmentSummary, setAttachmentSummary] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [remaking, setRemaking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<ViralVersion[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("idle");
  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState("本地自动保存");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession)) || {};

    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!videoFile) {
      setVideoPreviewUrl("");
      return;
    }

    const nextUrl = URL.createObjectURL(videoFile);
    setVideoPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [videoFile]);

  const markdown = useMemo(
    () => buildViralMarkdown(analysisResult, remakeResult),
    [analysisResult, remakeResult],
  );

  async function handleVideoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setError("");
    setVideoPath(null);
    setProjectId(null);
    setAnalysisResult(null);
    setRemakeResult(null);
    setTaskStatus("idle");

    if (!file) {
      setVideoFile(null);
      return;
    }

    if (!file.type.startsWith("video/")) {
      setError("请上传视频文件。");
      return;
    }

    if (file.size > MAX_VIDEO_SIZE) {
      setError("视频文件不能超过 100MB。");
      return;
    }

    setVideoFile(file);
    await uploadVideo(file);
  }

  async function uploadVideo(file: File) {
    if (!session?.access_token) {
      setError("请先登录后再上传视频。");
      return;
    }

    setUploading(true);
    setStatusText("上传视频中…");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/viral/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "视频上传失败。");
      setProjectId(payload.projectId);
      setVideoPath(payload.videoPath);
      setStatusText("视频已上传");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "视频上传失败。");
      setTaskStatus("failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    if (file.type.startsWith("image/")) {
      setAttachmentSummary(`图片附件：${file.name}`);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/files/parse", { method: "POST", body: formData });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      setError(payload.error || "附件解析失败。");
      return;
    }
    setAttachmentSummary(`文档附件：${payload.fileName}\n${payload.text}`);
  }

  async function analyzeVideo() {
    if (!session?.access_token) {
      setError("请先登录后再分析视频。");
      return;
    }
    if (!projectId || !videoPath) {
      setError("请先上传视频。");
      return;
    }

    setAnalyzing(true);
    setTaskStatus("running");
    setError("");
    setStatusText("分析中…");
    try {
      const response = await fetch("/api/viral/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ projectId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "分析失败。");
      setAnalysisResult(payload.analysis);
      setStatusText("结构分析完成");
      setTaskStatus("completed");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "分析失败。");
      setTaskStatus("failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function remakeStructure() {
    if (!session?.access_token) {
      setError("请先登录后再改写。");
      return;
    }
    if (!projectId || !analysisResult) {
      setError("请先完成爆款结构分析。");
      return;
    }
    const input = [rewriteInput.trim(), attachmentSummary.trim()].filter(Boolean).join("\n\n");
    if (!input) {
      setError("请先填写改写方向。");
      return;
    }

    setRemaking(true);
    setTaskStatus("running");
    setError("");
    setStatusText("改写中…");
    try {
      const response = await fetch("/api/viral/remake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ projectId, rewriteInput: input }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "改写失败。");
      setRemakeResult(payload.remakeMarkdown || payload.remake);
      setStatusText("同结构改写完成");
      setTaskStatus("completed");
    } catch (remakeError) {
      setError(remakeError instanceof Error ? remakeError.message : "改写失败。");
      setTaskStatus("failed");
    } finally {
      setRemaking(false);
    }
  }

  async function saveVersion() {
    if (!session?.access_token || !projectId) {
      setError("请先登录并创建爆款项目。");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/viral/save-version", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          projectId,
          versionType: remakeResult ? "remake" : "analysis",
          content: markdown,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "保存版本失败。");
      setStatusText("版本已保存");
      await loadVersions();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存版本失败。");
    } finally {
      setSaving(false);
    }
  }

  async function loadVersions() {
    if (!session?.access_token || !projectId) return;
    const response = await fetch(`/api/viral/save-version?projectId=${encodeURIComponent(projectId)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const payload = await response.json();
    if (response.ok && payload.success) setVersions(payload.versions || []);
  }

  function exportMarkdown() {
    downloadText(`kiikis-viral-${Date.now()}.md`, markdown || "暂无内容。");
  }

  return (
    <main className="workflow-shell viral-workbench-page">
      <header className="workflow-header">
        <div className="workflow-brand">
          <Link className="icon-button" href="/dashboard" title="返回工作台">
            <ArrowLeft size={18} />
          </Link>
          <KiikisLogo compact />
        </div>
        <div className="viral-title-block">
          <span>Viral Creation</span>
          <h1>爆款创作</h1>
        </div>
        <div className="header-actions">
          <span className="save-state"><Save size={15} /> {statusText}</span>
        </div>
      </header>

      <section className="song-workbench-shell">
        {error ? <div className="notice error">{error}</div> : null}

        <section className="dashboard-panel song-setup-panel">
          <div className="dashboard-panel-head">
            <div>
              <span>视频输入</span>
              <h2>爆款样本</h2>
            </div>
          </div>

          <label className="viral-upload-box">
            <UploadCloud size={22} />
            <strong>{uploading ? "上传中…" : "上传视频"}</strong>
            <span>支持 video/*，单个文件不超过 100MB</span>
            <input type="file" accept="video/*" onChange={handleVideoChange} disabled={uploading} />
          </label>

          {videoFile ? (
            <div className="viral-file-card">
              <strong>{videoFile.name}</strong>
              <span>{videoFile.type || "video"} / {formatBytes(videoFile.size)}</span>
              {videoPreviewUrl ? <video src={videoPreviewUrl} controls /> : null}
            </div>
          ) : null}

          <div className="song-tool-section">
            <span>改写要求</span>
            <textarea
              className="song-revision-textarea"
              value={rewriteInput}
              onChange={(event) => setRewriteInput(event.target.value)}
              placeholder="描述你的改写方向，例如：保留结构，换成宠物赛道，主角是一只会拆家的柯基..."
            />
            <label>
              改写附件
              <input type="file" accept="image/*,.txt,.md,.pdf,.doc,.docx" onChange={handleAttachmentChange} />
            </label>
            {attachmentSummary ? <p className="subtle">{attachmentSummary.slice(0, 240)}</p> : null}
          </div>
        </section>

        <section className="dashboard-panel song-output-panel">
          <div className="dashboard-panel-head">
            <div>
              <span>结构分析</span>
              <h2>F1-F6 输出</h2>
            </div>
          </div>

          {!analysisResult ? (
            <div className="empty-state viral-empty-state">
              <h2>上传视频后点击「分析爆款结构」开始</h2>
              <p>系统会先拆解开场钩子、主体节奏、动作节点、结果呈现和记忆点，再生成同结构改写。</p>
            </div>
          ) : (
            <div className="viral-output-stack">
              <ViralSection title="F1 开场钩子" items={[
                ["前3秒结构", analysisResult.f1_hook?.duration],
                ["钩子类型", analysisResult.f1_hook?.type],
                ["情绪触发", analysisResult.f1_hook?.emotion],
                ["描述", analysisResult.f1_hook?.description],
              ]} />
              <ViralSection title="F2 主体结构" items={[
                ["内容节奏", analysisResult.f2_body?.rhythm],
                ["情绪推进曲线", analysisResult.f2_body?.emotion_curve],
                ["描述", analysisResult.f2_body?.description],
              ]} />
              <ViralSection title="F3 动作节点" items={[
                ["关键动作", analysisResult.f3_action?.key_actions?.join(" / ")],
                ["转折点", analysisResult.f3_action?.turning_point],
                ["描述", analysisResult.f3_action?.description],
              ]} />
              <ViralSection title="F4 结果呈现" items={[
                ["高潮", analysisResult.f4_result?.climax],
                ["结果展示方式", analysisResult.f4_result?.presentation],
                ["描述", analysisResult.f4_result?.description],
              ]} />
              <ViralSection title="F5 记忆点" items={[
                ["可复用结构公式", analysisResult.f5_memory?.formula],
                ["标签", analysisResult.f5_memory?.tags?.join(" / ")],
                ["描述", analysisResult.f5_memory?.description],
                ["原视频分镜拆解", analysisResult.raw_storyboard],
              ]} />
              <details className="song-control-group" open={Boolean(remakeResult)}>
                <summary>F6 同结构改写</summary>
                <div className="song-details-body">
                  <pre className="viral-remake-output">{remakeResult || "改写完成后会显示完整分镜脚本。"}</pre>
                </div>
              </details>
            </div>
          )}
        </section>

        <aside className="dashboard-panel song-ai-panel">
          <div className="dashboard-panel-head">
            <div>
              <span>AI 工具</span>
              <h2>任务控制</h2>
            </div>
          </div>

          <div className="song-field-stack">
            <button className="primary-button full" type="button" disabled={!videoPath || !session || analyzing} onClick={analyzeVideo}>
              {analyzing ? <Loader2 className="spin" size={17} /> : null}
              {analyzing ? "分析中…" : "分析爆款结构"}
            </button>
            <button className="secondary-button full" type="button" disabled={!analysisResult || !rewriteInput.trim() || !session || remaking} onClick={remakeStructure}>
              {remaking ? <Loader2 className="spin" size={17} /> : null}
              {remaking ? "改写中…" : "同结构改写"}
            </button>
            <button className="secondary-button full" type="button" disabled={!markdown} onClick={exportMarkdown}>
              <Download size={17} /> 导出 Markdown
            </button>
            <button className="secondary-button full" type="button" disabled={!projectId || saving} onClick={saveVersion}>
              {saving ? "保存中…" : "保存版本"}
            </button>
            <button
              className="secondary-button full"
              type="button"
              disabled={!projectId}
              onClick={() => {
                const nextOpen = !historyOpen;
                setHistoryOpen(nextOpen);
                if (nextOpen) void loadVersions();
              }}
            >
              查看历史
            </button>
          </div>

          <div className="song-tool-section">
            <span>AI 任务状态</span>
            <p className={taskStatus === "failed" ? "error" : "subtle"}>{taskStatus}</p>
            {taskStatus === "failed" ? (
              <button className="secondary-button" type="button" onClick={analysisResult ? remakeStructure : analyzeVideo}>重试</button>
            ) : null}
          </div>

          {historyOpen ? (
            <div className="song-tool-section">
              <span>版本历史</span>
              <div className="settings-list song-history-list">
                {versions.length === 0 ? <p className="subtle">暂无历史版本。</p> : null}
                {versions.map((version) => (
                  <button
                    className="settings-card song-version-card"
                    type="button"
                    key={version.id}
                    onClick={() => {
                      setRemakeResult(version.content_markdown || "");
                      setStatusText(`已载入 ${version.version_type}`);
                    }}
                  >
                    <span>{version.version_type}</span>
                    <h3>{version.title || "未命名版本"}</h3>
                    <p>{new Date(version.created_at).toLocaleString()}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

function ViralSection({ title, items }: { title: string; items: Array<[string, string | undefined]> }) {
  return (
    <details className="song-control-group" open>
      <summary>{title}</summary>
      <div className="song-details-body viral-section-body">
        {items.map(([label, value]) => (
          <div key={label}>
            <strong>{label}</strong>
            <p>{value || "待分析"}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function buildViralMarkdown(analysis: ViralAnalysis | null, remake: string | null) {
  if (!analysis && !remake) return "";
  return [
    "# 爆款创作",
    "",
    "## F1 开场钩子",
    `- 前3秒结构：${analysis?.f1_hook?.duration || ""}`,
    `- 钩子类型：${analysis?.f1_hook?.type || ""}`,
    `- 情绪触发：${analysis?.f1_hook?.emotion || ""}`,
    `- 描述：${analysis?.f1_hook?.description || ""}`,
    "",
    "## F2 主体结构",
    `- 内容节奏：${analysis?.f2_body?.rhythm || ""}`,
    `- 情绪推进曲线：${analysis?.f2_body?.emotion_curve || ""}`,
    `- 描述：${analysis?.f2_body?.description || ""}`,
    "",
    "## F3 动作节点",
    `- 关键动作：${analysis?.f3_action?.key_actions?.join(" / ") || ""}`,
    `- 转折点：${analysis?.f3_action?.turning_point || ""}`,
    `- 描述：${analysis?.f3_action?.description || ""}`,
    "",
    "## F4 结果呈现",
    `- 高潮：${analysis?.f4_result?.climax || ""}`,
    `- 结果展示方式：${analysis?.f4_result?.presentation || ""}`,
    `- 描述：${analysis?.f4_result?.description || ""}`,
    "",
    "## F5 记忆点",
    `- 可复用结构公式：${analysis?.f5_memory?.formula || ""}`,
    `- 标签：${analysis?.f5_memory?.tags?.join(" / ") || ""}`,
    `- 记忆点描述：${analysis?.f5_memory?.description || ""}`,
    "",
    "## 原视频分镜拆解",
    analysis?.raw_storyboard || "",
    "",
    "## F6 同结构改写分镜",
    remake || "",
  ].join("\n");
}

function downloadText(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
