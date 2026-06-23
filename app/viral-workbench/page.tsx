"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, Download, Loader2, Save, UploadCloud } from "lucide-react";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { useI18n } from "@/lib/i18n/useI18n";
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
const copy = {
  zh: {
    back: "返回工作台",
    kicker: "爆款创作",
    title: "爆款创作",
    localSaved: "本地自动保存",
    uploadVideo: "上传视频",
    uploading: "上传中…",
    uploadHint: "支持 video/*，单个文件不超过 100MB",
    leftKicker: "视频输入",
    leftTitle: "爆款样本",
    rewriteLabel: "改写要求",
    rewritePlaceholder: "描述你的改写方向，例如：保留结构，换成宠物赛道，主角是一只会拆家的柯基...",
    attachmentLabel: "改写附件",
    outputKicker: "结构分析",
    outputTitle: "F1-F6 输出",
    emptyTitle: "上传视频后点击「分析爆款结构」开始",
    emptyBody: "系统会先拆解开场钩子、主体节奏、动作节点、结果呈现和记忆点，再生成同结构改写。",
    aiKicker: "AI 工具",
    aiTitle: "任务控制",
    analyze: "分析爆款结构",
    analyzing: "分析中…",
    remake: "同结构改写",
    remaking: "改写中…",
    exportMarkdown: "导出 Markdown",
    saveVersion: "保存版本",
    saving: "保存中…",
    viewHistory: "查看历史",
    taskStatus: "AI 任务状态",
    retry: "重试",
    history: "版本历史",
    emptyHistory: "暂无历史版本。",
    unnamedVersion: "未命名版本",
    pending: "待分析",
    remakePending: "改写完成后会显示完整分镜脚本。",
    noContent: "暂无内容。",
    uploaded: "视频已上传",
    uploadProgress: "上传视频中…",
    analysisDone: "结构分析完成",
    remakeDone: "同结构改写完成",
    versionSaved: "版本已保存",
    loaded: "已载入",
    imageAttachment: "图片附件",
    documentAttachment: "文档附件",
    labels: {
      f1: "F1 开场钩子",
      f2: "F2 主体结构",
      f3: "F3 动作节点",
      f4: "F4 结果呈现",
      f5: "F5 记忆点",
      f6: "F6 同结构改写",
      hookDuration: "前3秒结构",
      hookType: "钩子类型",
      emotion: "情绪触发",
      description: "描述",
      rhythm: "内容节奏",
      emotionCurve: "情绪推进曲线",
      keyActions: "关键动作",
      turningPoint: "转折点",
      climax: "高潮",
      presentation: "结果展示方式",
      formula: "可复用结构公式",
      tags: "标签",
      rawStoryboard: "原视频分镜拆解",
      memoryDescription: "记忆点描述",
    },
  },
  en: {
    back: "Back to dashboard",
    kicker: "Viral Creation",
    title: "Viral Creation",
    localSaved: "Local autosave",
    uploadVideo: "Upload video",
    uploading: "Uploading…",
    uploadHint: "Supports video/*, up to 100MB per file",
    leftKicker: "Video input",
    leftTitle: "Viral sample",
    rewriteLabel: "Remake direction",
    rewritePlaceholder: "Describe the remake direction, e.g. keep the structure but switch to the pet niche...",
    attachmentLabel: "Remake attachment",
    outputKicker: "Structure analysis",
    outputTitle: "F1-F6 Output",
    emptyTitle: "Upload a video, then click “Analyze viral structure” to begin",
    emptyBody: "Kiikis will break down the hook, rhythm, action nodes, result reveal, and memory points before generating a same-structure remake.",
    aiKicker: "AI Tools",
    aiTitle: "Task control",
    analyze: "Analyze viral structure",
    analyzing: "Analyzing…",
    remake: "Same-structure remake",
    remaking: "Remaking…",
    exportMarkdown: "Export Markdown",
    saveVersion: "Save version",
    saving: "Saving…",
    viewHistory: "View history",
    taskStatus: "AI task status",
    retry: "Retry",
    history: "Version history",
    emptyHistory: "No saved versions yet.",
    unnamedVersion: "Untitled version",
    pending: "Pending analysis",
    remakePending: "The full storyboard remake will appear here after generation.",
    noContent: "No content yet.",
    uploaded: "Video uploaded",
    uploadProgress: "Uploading video…",
    analysisDone: "Structure analysis complete",
    remakeDone: "Same-structure remake complete",
    versionSaved: "Version saved",
    loaded: "Loaded",
    imageAttachment: "Image attachment",
    documentAttachment: "Document attachment",
    labels: {
      f1: "F1 Opening Hook",
      f2: "F2 Body Structure",
      f3: "F3 Action Nodes",
      f4: "F4 Result Reveal",
      f5: "F5 Memory Points",
      f6: "F6 Same-Structure Remake",
      hookDuration: "First-three-second structure",
      hookType: "Hook type",
      emotion: "Emotion trigger",
      description: "Description",
      rhythm: "Content rhythm",
      emotionCurve: "Emotion curve",
      keyActions: "Key actions",
      turningPoint: "Turning point",
      climax: "Climax",
      presentation: "Result presentation",
      formula: "Reusable structure formula",
      tags: "Tags",
      rawStoryboard: "Original storyboard breakdown",
      memoryDescription: "Memory point description",
    },
  },
} as const;

export default function ViralWorkbenchPage() {
  const { locale } = useI18n();
  const language = locale === "zh-CN" ? "zh" : "en";
  const ui = copy[language];
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
  const [statusText, setStatusText] = useState<string>(ui.localSaved);

  useEffect(() => {
    setStatusText((current) =>
      current === copy.zh.localSaved || current === copy.en.localSaved ? ui.localSaved : current,
    );
  }, [ui.localSaved]);

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
    () => buildViralMarkdown(analysisResult, remakeResult, ui),
    [analysisResult, remakeResult, ui],
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
      setError(language === "zh" ? "请上传视频文件。" : "Please upload a video file.");
      return;
    }

    if (file.size > MAX_VIDEO_SIZE) {
      setError(language === "zh" ? "视频文件不能超过 100MB。" : "Video files must be 100MB or smaller.");
      return;
    }

    setVideoFile(file);
    await uploadVideo(file);
  }

  async function uploadVideo(file: File) {
    if (!session?.access_token) {
      setError(language === "zh" ? "请先登录后再上传视频。" : "Please sign in before uploading a video.");
      return;
    }

    setUploading(true);
    setStatusText(ui.uploadProgress);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/viral/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || (language === "zh" ? "视频上传失败。" : "Video upload failed."));
      setProjectId(payload.projectId);
      setVideoPath(payload.videoPath);
      setStatusText(ui.uploaded);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : language === "zh" ? "视频上传失败。" : "Video upload failed.");
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
      setAttachmentSummary(`${ui.imageAttachment}: ${file.name}`);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/files/parse", { method: "POST", body: formData });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      setError(payload.error || (language === "zh" ? "附件解析失败。" : "Attachment parsing failed."));
      return;
    }
    setAttachmentSummary(`${ui.documentAttachment}: ${payload.fileName}\n${payload.text}`);
  }

  async function analyzeVideo() {
    if (!session?.access_token) {
      setError(language === "zh" ? "请先登录后再分析视频。" : "Please sign in before analyzing a video.");
      return;
    }
    if (!projectId || !videoPath) {
      setError(language === "zh" ? "请先上传视频。" : "Please upload a video first.");
      return;
    }

    setAnalyzing(true);
    setTaskStatus("running");
    setError("");
    setStatusText(ui.analyzing);
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
      if (!response.ok || !payload.success) throw new Error(payload.error || (language === "zh" ? "分析失败。" : "Analysis failed."));
      setAnalysisResult(payload.analysis);
      setStatusText(ui.analysisDone);
      setTaskStatus("completed");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : language === "zh" ? "分析失败。" : "Analysis failed.");
      setTaskStatus("failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function remakeStructure() {
    if (!session?.access_token) {
      setError(language === "zh" ? "请先登录后再改写。" : "Please sign in before remaking.");
      return;
    }
    if (!projectId || !analysisResult) {
      setError(language === "zh" ? "请先完成爆款结构分析。" : "Please complete viral structure analysis first.");
      return;
    }
    const input = [rewriteInput.trim(), attachmentSummary.trim()].filter(Boolean).join("\n\n");
    if (!input) {
      setError(language === "zh" ? "请先填写改写方向。" : "Please enter a remake direction first.");
      return;
    }

    setRemaking(true);
    setTaskStatus("running");
    setError("");
    setStatusText(ui.remaking);
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
      if (!response.ok || !payload.success) throw new Error(payload.error || (language === "zh" ? "改写失败。" : "Remake failed."));
      setRemakeResult(payload.remakeMarkdown || payload.remake);
      setStatusText(ui.remakeDone);
      setTaskStatus("completed");
    } catch (remakeError) {
      setError(remakeError instanceof Error ? remakeError.message : language === "zh" ? "改写失败。" : "Remake failed.");
      setTaskStatus("failed");
    } finally {
      setRemaking(false);
    }
  }

  async function saveVersion() {
    if (!session?.access_token || !projectId) {
      setError(language === "zh" ? "请先登录并创建爆款项目。" : "Please sign in and create a viral project first.");
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
      if (!response.ok || !payload.success) throw new Error(payload.error || (language === "zh" ? "保存版本失败。" : "Failed to save version."));
      setStatusText(ui.versionSaved);
      await loadVersions();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : language === "zh" ? "保存版本失败。" : "Failed to save version.");
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
    downloadText(`kiikis-viral-${Date.now()}.md`, markdown || ui.noContent);
  }

  return (
    <main className="workflow-shell viral-workbench-page">
      <header className="workflow-header">
        <div className="workflow-brand">
          <Link className="icon-button" href="/dashboard" title={ui.back}>
            <ArrowLeft size={18} />
          </Link>
          <KiikisLogo compact />
        </div>
        <div className="viral-title-block">
          <span>{ui.kicker}</span>
          <h1>{ui.title}</h1>
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
              <span>{ui.leftKicker}</span>
              <h2>{ui.leftTitle}</h2>
            </div>
          </div>

          <label className="viral-upload-box">
            <UploadCloud size={22} />
            <strong>{uploading ? ui.uploading : ui.uploadVideo}</strong>
            <span>{ui.uploadHint}</span>
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
            <span>{ui.rewriteLabel}</span>
            <textarea
              className="song-revision-textarea"
              value={rewriteInput}
              onChange={(event) => setRewriteInput(event.target.value)}
              placeholder={ui.rewritePlaceholder}
            />
            <label>
              {ui.attachmentLabel}
              <input type="file" accept="image/*,.txt,.md,.pdf,.doc,.docx" onChange={handleAttachmentChange} />
            </label>
            {attachmentSummary ? <p className="subtle">{attachmentSummary.slice(0, 240)}</p> : null}
          </div>
        </section>

        <section className="dashboard-panel song-output-panel">
          <div className="dashboard-panel-head">
            <div>
              <span>{ui.outputKicker}</span>
              <h2>{ui.outputTitle}</h2>
            </div>
          </div>

          {!analysisResult ? (
            <div className="empty-state viral-empty-state">
              <h2>{ui.emptyTitle}</h2>
              <p>{ui.emptyBody}</p>
            </div>
          ) : (
            <div className="viral-output-stack">
              <ViralSection pendingLabel={ui.pending} title={ui.labels.f1} items={[
                [ui.labels.hookDuration, analysisResult.f1_hook?.duration],
                [ui.labels.hookType, analysisResult.f1_hook?.type],
                [ui.labels.emotion, analysisResult.f1_hook?.emotion],
                [ui.labels.description, analysisResult.f1_hook?.description],
              ]} />
              <ViralSection pendingLabel={ui.pending} title={ui.labels.f2} items={[
                [ui.labels.rhythm, analysisResult.f2_body?.rhythm],
                [ui.labels.emotionCurve, analysisResult.f2_body?.emotion_curve],
                [ui.labels.description, analysisResult.f2_body?.description],
              ]} />
              <ViralSection pendingLabel={ui.pending} title={ui.labels.f3} items={[
                [ui.labels.keyActions, analysisResult.f3_action?.key_actions?.join(" / ")],
                [ui.labels.turningPoint, analysisResult.f3_action?.turning_point],
                [ui.labels.description, analysisResult.f3_action?.description],
              ]} />
              <ViralSection pendingLabel={ui.pending} title={ui.labels.f4} items={[
                [ui.labels.climax, analysisResult.f4_result?.climax],
                [ui.labels.presentation, analysisResult.f4_result?.presentation],
                [ui.labels.description, analysisResult.f4_result?.description],
              ]} />
              <ViralSection pendingLabel={ui.pending} title={ui.labels.f5} items={[
                [ui.labels.formula, analysisResult.f5_memory?.formula],
                [ui.labels.tags, analysisResult.f5_memory?.tags?.join(" / ")],
                [ui.labels.description, analysisResult.f5_memory?.description],
                [ui.labels.rawStoryboard, analysisResult.raw_storyboard],
              ]} />
              <details className="song-control-group" open={Boolean(remakeResult)}>
                <summary>{ui.labels.f6}</summary>
                <div className="song-details-body">
                  <pre className="viral-remake-output">{remakeResult || ui.remakePending}</pre>
                </div>
              </details>
            </div>
          )}
        </section>

        <aside className="dashboard-panel song-ai-panel">
          <div className="dashboard-panel-head">
            <div>
              <span>{ui.aiKicker}</span>
              <h2>{ui.aiTitle}</h2>
            </div>
          </div>

          <div className="song-field-stack">
            <button className="primary-button full" type="button" disabled={!videoPath || !session || analyzing} onClick={analyzeVideo}>
              {analyzing ? <Loader2 className="spin" size={17} /> : null}
              {analyzing ? ui.analyzing : ui.analyze}
            </button>
            <button className="secondary-button full" type="button" disabled={!analysisResult || !rewriteInput.trim() || !session || remaking} onClick={remakeStructure}>
              {remaking ? <Loader2 className="spin" size={17} /> : null}
              {remaking ? ui.remaking : ui.remake}
            </button>
            <button className="secondary-button full" type="button" disabled={!markdown} onClick={exportMarkdown}>
              <Download size={17} /> {ui.exportMarkdown}
            </button>
            <button className="secondary-button full" type="button" disabled={!projectId || saving} onClick={saveVersion}>
              {saving ? ui.saving : ui.saveVersion}
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
              {ui.viewHistory}
            </button>
          </div>

          <div className="song-tool-section">
            <span>{ui.taskStatus}</span>
            <p className={taskStatus === "failed" ? "error" : "subtle"}>{taskStatus}</p>
            {taskStatus === "failed" ? (
              <button className="secondary-button" type="button" onClick={analysisResult ? remakeStructure : analyzeVideo}>{ui.retry}</button>
            ) : null}
          </div>

          {historyOpen ? (
            <div className="song-tool-section">
              <span>{ui.history}</span>
              <div className="settings-list song-history-list">
                {versions.length === 0 ? <p className="subtle">{ui.emptyHistory}</p> : null}
                {versions.map((version) => (
                  <button
                    className="settings-card song-version-card"
                    type="button"
                    key={version.id}
                    onClick={() => {
                      setRemakeResult(version.content_markdown || "");
                      setStatusText(`${ui.loaded} ${version.version_type}`);
                    }}
                  >
                    <span>{version.version_type}</span>
                    <h3>{version.title || ui.unnamedVersion}</h3>
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

function ViralSection({
  title,
  items,
  pendingLabel,
}: {
  title: string;
  items: Array<[string, string | undefined]>;
  pendingLabel: string;
}) {
  return (
    <details className="song-control-group" open>
      <summary>{title}</summary>
      <div className="song-details-body viral-section-body">
        {items.map(([label, value]) => (
          <div key={label}>
            <strong>{label}</strong>
            <p>{value || pendingLabel}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function buildViralMarkdown(analysis: ViralAnalysis | null, remake: string | null, ui: typeof copy.zh | typeof copy.en) {
  if (!analysis && !remake) return "";
  return [
    `# ${ui.title}`,
    "",
    `## ${ui.labels.f1}`,
    `- ${ui.labels.hookDuration}: ${analysis?.f1_hook?.duration || ""}`,
    `- ${ui.labels.hookType}: ${analysis?.f1_hook?.type || ""}`,
    `- ${ui.labels.emotion}: ${analysis?.f1_hook?.emotion || ""}`,
    `- ${ui.labels.description}: ${analysis?.f1_hook?.description || ""}`,
    "",
    `## ${ui.labels.f2}`,
    `- ${ui.labels.rhythm}: ${analysis?.f2_body?.rhythm || ""}`,
    `- ${ui.labels.emotionCurve}: ${analysis?.f2_body?.emotion_curve || ""}`,
    `- ${ui.labels.description}: ${analysis?.f2_body?.description || ""}`,
    "",
    `## ${ui.labels.f3}`,
    `- ${ui.labels.keyActions}: ${analysis?.f3_action?.key_actions?.join(" / ") || ""}`,
    `- ${ui.labels.turningPoint}: ${analysis?.f3_action?.turning_point || ""}`,
    `- ${ui.labels.description}: ${analysis?.f3_action?.description || ""}`,
    "",
    `## ${ui.labels.f4}`,
    `- ${ui.labels.climax}: ${analysis?.f4_result?.climax || ""}`,
    `- ${ui.labels.presentation}: ${analysis?.f4_result?.presentation || ""}`,
    `- ${ui.labels.description}: ${analysis?.f4_result?.description || ""}`,
    "",
    `## ${ui.labels.f5}`,
    `- ${ui.labels.formula}: ${analysis?.f5_memory?.formula || ""}`,
    `- ${ui.labels.tags}: ${analysis?.f5_memory?.tags?.join(" / ") || ""}`,
    `- ${ui.labels.memoryDescription}: ${analysis?.f5_memory?.description || ""}`,
    "",
    `## ${ui.labels.rawStoryboard}`,
    analysis?.raw_storyboard || "",
    "",
    `## ${ui.labels.f6}`,
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
