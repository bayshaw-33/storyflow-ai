"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Download, Loader2, Play, Plus, RefreshCw, Save, Trash2, UploadCloud } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createProject, readProjectsFromStorage, upsertProject, type DramaProject } from "@/lib/projects";
import { readProjectFromSupabase, upsertProjectToSupabase } from "@/lib/supabase/projects";
import { buildProjectLink, listUniverses, saveInboxItems, upsertUniverseProjectLink, type Universe } from "@/lib/universe";
import type { CreativePackage } from "@/lib/universe/creative-package";

type VideoStatus = "draft" | "queued" | "running" | "done" | "error";

type VideoShot = {
  id: string;
  sceneTitle: string;
  sourceText: string;
  prompt: string;
  duration: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  status: VideoStatus;
  taskId?: string;
  fileId?: string;
  videoUrl?: string;
  error?: string;
};

type VideoState = {
  model: string;
  shots: VideoShot[];
};

type StoryboardExport = {
  id?: string;
  projectTitle?: string;
  universeId?: string | null;
  creativePackage?: CreativePackage;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  videoReadyShots?: Array<{
    id?: string;
    sceneTitle?: string;
    text?: string;
    prompt?: string;
    duration?: string;
  }>;
  scenes?: Array<{
    title?: string;
    shots?: Array<{
      id?: string;
      text?: string;
      visualPrompt?: string;
      duration?: string;
    }>;
  }>;
};

type WorkspaceEntryDraft = {
  workflowId?: string;
  projectTitle?: string;
  prompt?: string;
  file?: {
    name?: string;
    type?: string;
    textPreview?: string;
  } | null;
};

type MiniMaxResponse = {
  success?: boolean;
  error?: string;
  taskId?: string;
  status?: VideoStatus;
  fileId?: string;
  videoUrl?: string;
  model?: string;
};

const defaultModel = "MiniMax-Hailuo-02";

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createShot(prompt = "", sceneTitle = ""): VideoShot {
  return {
    id: createId("video-shot"),
    sceneTitle,
    sourceText: prompt,
    prompt,
    duration: "5s",
    aspectRatio: "9:16",
    status: "draft",
  };
}

function shotsFromStoryboard(raw: string | null): VideoShot[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoryboardExport;
    const aspectRatio = parsed.aspectRatio || "9:16";
    const readyShots = parsed.videoReadyShots || [];
    if (readyShots.length) {
      return readyShots
        .filter((shot) => (shot.prompt || shot.text || "").trim())
        .map((shot, index) => ({
          id: shot.id || `storyboard-shot-${index + 1}`,
          sceneTitle: shot.sceneTitle || `Scene ${index + 1}`,
          sourceText: shot.text || "",
          prompt: shot.prompt || shot.text || "",
          duration: shot.duration || "5s",
          aspectRatio,
          status: "draft" as const,
        }));
    }

    return (parsed.scenes || [])
      .flatMap((scene) =>
        (scene.shots || []).map((shot) => ({
          sceneTitle: scene.title || "",
          prompt: shot.visualPrompt || shot.text || "",
          sourceText: shot.text || "",
          duration: shot.duration || "5s",
        })),
      )
      .filter((shot) => shot.prompt.trim())
      .map((shot, index) => ({
        id: `storyboard-shot-${index + 1}`,
        sceneTitle: shot.sceneTitle || `Scene ${index + 1}`,
        sourceText: shot.sourceText,
        prompt: shot.prompt,
        duration: shot.duration,
        aspectRatio,
        status: "draft" as const,
      }));
  } catch {
    return [];
  }
}

function readWorkspaceEntryDraft(workflowId: string): WorkspaceEntryDraft | null {
  try {
    const keyed = localStorage.getItem(`kiikis_workspace_entry_draft:${workflowId}`);
    const generic = localStorage.getItem("kiikis_workspace_entry_draft");
    const raw = keyed || generic;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceEntryDraft;
    if (parsed.workflowId && parsed.workflowId !== workflowId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapResolution(aspectRatio: VideoShot["aspectRatio"]) {
  if (aspectRatio === "16:9") return "1080P";
  if (aspectRatio === "1:1") return "768P";
  return "768P";
}

function videoProjectPayloadFromProject(project: DramaProject) {
  try {
    return JSON.parse(project.deliveryPackage || "{}") as {
      state?: VideoState;
      sourceStoryboardTitle?: string;
      sourceStoryboardId?: string;
      selectedUniverseId?: string;
      uploadedSourceName?: string;
    };
  } catch {
    return {};
  }
}

function videoStateFromProject(project: DramaProject): VideoState {
  const payload = videoProjectPayloadFromProject(project);
  if (payload.state?.shots?.length) {
    return {
      model: payload.state.model || defaultModel,
      shots: payload.state.shots.map((shot) => ({
        ...createShot(shot.prompt || "", shot.sceneTitle || ""),
        ...shot,
        status: shot.status || "draft",
      })),
    };
  }
  return {
    model: defaultModel,
    shots: [createShot(project.idea || project.storyboardScript || "", project.title || "")],
  };
}

function videoStateToMarkdown(state: VideoState, title: string) {
  return [
    `# ${title || "Untitled Video Project"}`,
    "",
    `Model: ${state.model}`,
    "",
    ...state.shots.map((shot, index) => [
      `## Shot ${index + 1}: ${shot.sceneTitle || "Untitled"}`,
      `Status: ${shot.status}`,
      shot.duration ? `Duration: ${shot.duration}` : "",
      shot.aspectRatio ? `Aspect ratio: ${shot.aspectRatio}` : "",
      shot.prompt ? `Prompt: ${shot.prompt}` : "",
      shot.videoUrl ? `Video: ${shot.videoUrl}` : "",
    ].filter(Boolean).join("\n")),
  ].filter(Boolean).join("\n");
}

export default function VideoWorkbenchPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [projectId, setProjectId] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [videoProjectId, setVideoProjectId] = useState(createId("video-project"));
  const [state, setState] = useState<VideoState>({ model: defaultModel, shots: [createShot()] });
  const [importedCount, setImportedCount] = useState(0);
  const [busyShotId, setBusyShotId] = useState("");
  const [error, setError] = useState("");
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [selectedUniverseId, setSelectedUniverseId] = useState("");
  const [sourceStoryboardTitle, setSourceStoryboardTitle] = useState("");
  const [sourceStoryboardId, setSourceStoryboardId] = useState("");
  const [universeBusy, setUniverseBusy] = useState(false);
  const [universeStatus, setUniverseStatus] = useState("");
  const [uploadedSourceName, setUploadedSourceName] = useState("");
  const [savingProject, setSavingProject] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  const completedCount = useMemo(() => state.shots.filter((shot) => shot.status === "done").length, [state.shots]);
  const pendingCount = state.shots.length - completedCount;

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession)) || {};

    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setProjectId(new URLSearchParams(window.location.search).get("projectId") || "");
  }, []);

  useEffect(() => {
    const importedShots = shotsFromStoryboard(localStorage.getItem("storyboard_export"));
    const raw = localStorage.getItem("storyboard_export");
    if (importedShots.length) {
      setImportedCount(importedShots.length);
      setState((current) => ({ ...current, shots: importedShots }));
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as StoryboardExport;
        setSelectedUniverseId(parsed.universeId || parsed.creativePackage?.universeId || "");
        setSourceStoryboardTitle(parsed.projectTitle || parsed.creativePackage?.title || "");
        setSourceStoryboardId(parsed.id || parsed.creativePackage?.id || "");
      } catch {
        // Ignore malformed local storyboard handoff.
      }
    }
  }, []);

  useEffect(() => {
    const draft = readWorkspaceEntryDraft("video");
    if (!draft) return;

    setUploadedSourceName(draft.file?.name || "");
    setSourceStoryboardTitle(draft.projectTitle || "");

    const importedShots = shotsFromStoryboard(draft.file?.textPreview || null);
    if (importedShots.length) {
      setImportedCount(importedShots.length);
      setState((current) => ({ ...current, shots: importedShots }));
      return;
    }

    const prompt = draft.prompt || draft.file?.name || "";
    if (prompt) {
      setState((current) => ({
        ...current,
        shots: [createShot(prompt, draft.projectTitle || "")],
      }));
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    async function loadProject() {
      const localProject = readProjectsFromStorage().find((project) => project.id === projectId);
      if (localProject && !cancelled) {
        applyVideoProject(localProject);
      }

      if (!session?.access_token) return;
      const cloudProject = await readProjectFromSupabase(projectId, { accessToken: session.access_token }).catch(() => null);
      if (cloudProject && !cancelled) applyVideoProject(cloudProject);
    }

    void loadProject();
    return () => {
      cancelled = true;
    };
  }, [projectId, session?.access_token]);

  useEffect(() => {
    void listUniverses({ accessToken: session?.access_token })
      .then((items) => {
        setUniverses(items);
        setSelectedUniverseId((current) => current || items[0]?.id || "");
      })
      .catch(() => null);
  }, [session?.access_token]);

  function updateShot(id: string, patch: Partial<VideoShot>) {
    setState((current) => ({
      ...current,
      shots: current.shots.map((shot) => (shot.id === id ? { ...shot, ...patch } : shot)),
    }));
  }

  function applyVideoProject(project: DramaProject) {
    const payload = videoProjectPayloadFromProject(project);
    setVideoProjectId(project.id);
    setState(videoStateFromProject(project));
    setSelectedUniverseId(project.universeId || payload.selectedUniverseId || "");
    setSourceStoryboardTitle(payload.sourceStoryboardTitle || project.title || "");
    setSourceStoryboardId(payload.sourceStoryboardId || "");
    setUploadedSourceName(payload.uploadedSourceName || "");
  }

  function addShot() {
    setState((current) => ({ ...current, shots: [...current.shots, createShot()] }));
  }

  function deleteShot(id: string) {
    setState((current) => {
      const shots = current.shots.filter((shot) => shot.id !== id);
      return { ...current, shots: shots.length ? shots : [createShot()] };
    });
  }

  function exportJson() {
    console.log(JSON.stringify(state));
  }

  async function importVideoSourceFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadedSourceName(file.name);

    if (file.type.startsWith("video/")) {
      const videoUrl = URL.createObjectURL(file);
      const shot = createShot(file.name, file.name);
      shot.status = "done";
      shot.videoUrl = videoUrl;
      shot.sourceText = file.name;
      setState((current) => ({ ...current, shots: [...current.shots.filter((item) => item.prompt.trim()), shot] }));
      return;
    }

    if (!file.type.startsWith("text/") && !/\.(txt|md|json|csv)$/i.test(file.name)) {
      setState((current) => ({ ...current, shots: [createShot(file.name, file.name)] }));
      return;
    }

    const text = await file.text();
    const importedShots = shotsFromStoryboard(text);
    if (importedShots.length) {
      setImportedCount(importedShots.length);
      setState((current) => ({ ...current, shots: importedShots }));
      return;
    }

    setState((current) => ({ ...current, shots: [createShot(text.slice(0, 4000), file.name)] }));
  }

  function buildVideoPackage(universeId = selectedUniverseId || null): CreativePackage {
    const title = sourceStoryboardTitle || (isZh ? "未命名视频项目" : "Untitled Video Project");
    const now = new Date().toISOString();
    return {
      id: `video-package-${sourceStoryboardId || "local"}-${state.shots.length}`,
      workflowType: "video",
      title,
      summary: state.shots.map((shot, index) => `Shot ${index + 1}: ${shot.prompt}`).join("\n").slice(0, 1200),
      language: isZh ? "zh-CN" : "en",
      universeId,
      sourceProjectId: sourceStoryboardId || null,
      sourceProjectTitle: sourceStoryboardTitle || null,
      scenes: state.shots.map((shot, index) => ({
        id: shot.id,
        title: shot.sceneTitle || `Shot ${index + 1}`,
        summary: shot.sourceText || shot.prompt,
        shots: [{
          id: shot.id,
          title: `Shot ${index + 1}`,
          prompt: shot.prompt,
          duration: shot.duration,
          assetUrl: shot.videoUrl,
        }],
      })),
      assets: state.shots.map((shot, index) => ({
        id: shot.fileId || shot.taskId || shot.id,
        type: "video",
        title: `${shot.sceneTitle || "Shot"} ${index + 1}`,
        url: shot.videoUrl,
        prompt: shot.prompt,
        sourceShotId: shot.id,
        metadata: {
          status: shot.status,
          taskId: shot.taskId || null,
          fileId: shot.fileId || null,
          model: state.model,
          aspectRatio: shot.aspectRatio,
          duration: shot.duration,
        },
      })),
      canonFacts: [
        `Video model for ${title}: ${state.model}`,
        ...state.shots.filter((shot) => shot.videoUrl).map((shot, index) => `Generated video asset for Shot ${index + 1}: ${shot.videoUrl}`),
      ],
      metadata: { model: state.model, sourceStoryboardId, completedCount, totalShots: state.shots.length },
      createdAt: now,
      updatedAt: now,
    };
  }

  function buildVideoProject(universeId = selectedUniverseId || null): DramaProject {
    const title = sourceStoryboardTitle || uploadedSourceName || (isZh ? "未命名视频项目" : "Untitled Video Project");
    const markdown = videoStateToMarkdown(state, title);
    return createProject({
      id: videoProjectId,
      workflowType: "video",
      title,
      genre: "视频创作",
      targetLanguage: isZh ? "中文" : "English",
      idea: state.shots.map((shot, index) => `Shot ${index + 1}: ${shot.prompt}`).join("\n\n").slice(0, 4000),
      importedScript: state.shots.map((shot) => shot.sourceText).filter(Boolean).join("\n\n"),
      storyboardScript: markdown,
      deliveryPackage: JSON.stringify({
        state,
        sourceStoryboardTitle,
        sourceStoryboardId,
        selectedUniverseId: universeId,
        uploadedSourceName,
      }, null, 2),
      universeId,
      projectRole: universeId ? "adaptation" : null,
      inheritanceSettings: universeId ? {
        sourceWorkflow: "video",
        sourceStoryboardId: sourceStoryboardId || null,
        model: state.model,
        completedCount,
        totalShots: state.shots.length,
      } : null,
      status: completedCount > 0 ? "ready" : "draft",
      updatedAt: new Date().toISOString(),
    });
  }

  async function saveVideoProjectToList(options: { universeId?: string | null; silent?: boolean } = {}) {
    const universeId = options.universeId === undefined ? selectedUniverseId || null : options.universeId;
    const project = buildVideoProject(universeId);
    setSavingProject(true);
    if (!options.silent) setSaveStatus(isZh ? "正在保存视频项目..." : "Saving video project...");
    try {
      upsertProject(project);
      if (session?.access_token) {
        await upsertProjectToSupabase(project, { accessToken: session.access_token });
        if (universeId) {
          await upsertUniverseProjectLink(
            buildProjectLink({
              universeId,
              projectId: project.id,
              userId: session.user.id,
              projectRole: "adaptation",
            }),
            { accessToken: session.access_token },
          );
        }
      }
      if (!options.silent) setSaveStatus(isZh ? "已保存到项目列表。" : "Saved to project list.");
      return project;
    } catch (nextError) {
      if (!options.silent) {
        setSaveStatus(nextError instanceof Error ? nextError.message : (isZh ? "云端保存失败，已保留本地项目。" : "Cloud save failed. Local project is preserved."));
      }
      return project;
    } finally {
      setSavingProject(false);
    }
  }

  async function sendVideoToUniverse() {
    if (!session?.access_token) {
      setUniverseStatus(isZh ? "请先登录后再发送 Universe Inbox。" : "Please sign in before sending to Universe Inbox.");
      return;
    }
    if (!selectedUniverseId) {
      setUniverseStatus(isZh ? "请先选择一个 Universe。" : "Select a Universe first.");
      return;
    }

    setUniverseBusy(true);
    setUniverseStatus(isZh ? "正在发送视频包到 Universe Inbox..." : "Sending video package to Universe Inbox...");
    try {
      await saveVideoProjectToList({ universeId: selectedUniverseId, silent: true });
      const response = await fetch("/api/universe/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ universeId: selectedUniverseId, creativePackage: buildVideoPackage(selectedUniverseId) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (isZh ? "发送失败。" : "Failed to send."));
      await saveInboxItems(data.items || [], { accessToken: session.access_token });
      setUniverseStatus(isZh ? `已发送 ${data.items?.length || 0} 条候选项到 Inbox。` : `Sent ${data.items?.length || 0} candidates to Inbox.`);
    } catch (nextError) {
      setUniverseStatus(nextError instanceof Error ? nextError.message : (isZh ? "发送失败。" : "Failed to send."));
    } finally {
      setUniverseBusy(false);
    }
  }

  async function callMiniMax(payload: Record<string, unknown>) {
    if (!session?.access_token) throw new Error(isZh ? "请先登录后再调用 MiniMax。" : "Please sign in before using MiniMax.");
    const response = await fetch("/api/video/minimax", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => ({}))) as MiniMaxResponse;
    if (!response.ok || data.success === false) throw new Error(data.error || "MiniMax request failed.");
    return data;
  }

  async function generateShot(shot: VideoShot) {
    const prompt = shot.prompt.trim();
    if (!prompt) {
      updateShot(shot.id, { status: "error", error: isZh ? "请先填写视频 prompt。" : "Prompt is required." });
      return;
    }

    setError("");
    setBusyShotId(shot.id);
    updateShot(shot.id, { status: "queued", error: "", videoUrl: "" });

    try {
      const created = await callMiniMax({
        action: "create",
        model: state.model,
        prompt,
        duration: shot.duration,
        resolution: mapResolution(shot.aspectRatio),
      });
      if (!created.taskId) throw new Error(isZh ? "MiniMax 没有返回 task_id。" : "MiniMax did not return task_id.");
      updateShot(shot.id, { taskId: created.taskId, status: "running" });

      for (let attempt = 0; attempt < 24; attempt += 1) {
        await sleep(attempt === 0 ? 1200 : 5000);
        const status = await callMiniMax({ action: "status", taskId: created.taskId });
        updateShot(shot.id, {
          status: status.status || "running",
          fileId: status.fileId,
          videoUrl: status.videoUrl,
        });
        if (status.videoUrl) {
          updateShot(shot.id, { status: "done", videoUrl: status.videoUrl, fileId: status.fileId });
          return;
        }
        if (status.status === "error") throw new Error(status.error || "MiniMax task failed.");
      }

      throw new Error(isZh ? "MiniMax 任务仍在处理中，请稍后刷新状态。" : "MiniMax task is still processing. Refresh later.");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "MiniMax request failed.";
      setError(message);
      updateShot(shot.id, { status: "error", error: message });
    } finally {
      setBusyShotId("");
    }
  }

  async function refreshShot(shot: VideoShot) {
    if (!shot.taskId) return;
    setBusyShotId(shot.id);
    try {
      const status = await callMiniMax({ action: "status", taskId: shot.taskId });
      updateShot(shot.id, {
        status: status.videoUrl ? "done" : status.status || shot.status,
        fileId: status.fileId,
        videoUrl: status.videoUrl,
        error: status.error || "",
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "MiniMax request failed.";
      updateShot(shot.id, { status: "error", error: message });
    } finally {
      setBusyShotId("");
    }
  }

  async function generateAll() {
    for (const shot of state.shots) {
      if (shot.status !== "done") {
        await generateShot(shot);
      }
    }
  }

  return (
    <main className="app-shell production-workbench-page simple-workbench-page studio-workbench-page">
      <header className="studio-workbench-header">
        <div>
          <span>{isZh ? "视频创作" : "Video Workbench"}</span>
          <h1>{isZh ? "分镜到 MiniMax 视频" : "Storyboard to MiniMax video"}</h1>
        </div>
        <div className="studio-flow-row">
          <span>{isZh ? "导入分镜" : "Import storyboard"}</span>
          <span>{isZh ? "镜头队列" : "Shot queue"}</span>
          <span>{isZh ? "生成预览" : "Preview"}</span>
          <span>{state.model}</span>
          <span>{completedCount}/{state.shots.length}</span>
        </div>
      </header>

      {importedCount > 0 ? (
        <section className="dashboard-panel simple-continuity-banner">
          <div>
            <strong>{isZh ? "继续自分镜工作台" : "Continue from Storyboard"}</strong>
            <span>{isZh ? "镜头已自动进入视频队列，可逐条修改 prompt 后生成。" : "Shots are ready in the video queue. Edit prompts before generation."}</span>
          </div>
          <span className="simple-count-pill">{importedCount} shots</span>
        </section>
      ) : (
        <section className="dashboard-panel simple-continuity-banner muted">
          <div>
            <strong>{isZh ? "可从分镜工作台导入" : "Ready for storyboard import"}</strong>
            <span>{isZh ? "上传分镜 JSON 或从分镜工作台发送后，镜头会进入队列。" : "Upload storyboard JSON or send from Storyboard Workbench to populate the queue."}</span>
          </div>
          <span className="simple-count-pill">{state.shots.length} shots</span>
        </section>
      )}

      {error ? <section className="dashboard-panel studio-error">{error}</section> : null}

      <section className="video-studio-grid">
        <aside className="dashboard-panel studio-panel">
          <div className="studio-section-head is-row">
            <div>
              <span>{isZh ? "01 镜头" : "01 Shots"}</span>
              <h2>{isZh ? "视频镜头列表" : "Video shot list"}</h2>
            </div>
            <button className="secondary-button" type="button" onClick={addShot}>
              <Plus size={16} />
              {isZh ? "新增" : "Add"}
            </button>
          </div>

          <label className="studio-file-drop">
            <input
              className="visually-hidden-input"
              type="file"
              accept=".txt,.md,.json,.csv,video/*"
              onChange={(event) => void importVideoSourceFile(event)}
            />
            <UploadCloud size={18} />
            <span>{isZh ? "上传分镜 / 视频文件" : "Upload storyboard / video file"}</span>
            <small>{uploadedSourceName || (isZh ? "支持分镜 JSON、文本和 video/*" : "Storyboard JSON, text, and video/* supported")}</small>
          </label>

          <div className="studio-shot-list">
            {state.shots.map((shot, index) => (
              <article className="studio-shot-card" key={shot.id}>
                <div className="studio-section-head is-row">
                  <span>Shot {index + 1}</span>
                  <button className="icon-button" type="button" onClick={() => deleteShot(shot.id)} aria-label="Delete shot">
                    <Trash2 size={16} />
                  </button>
                </div>
                <label className="studio-field">
                  {isZh ? "Scene" : "Scene"}
                  <input value={shot.sceneTitle} onChange={(event) => updateShot(shot.id, { sceneTitle: event.target.value })} />
                </label>
                <label className="studio-field">
                  {isZh ? "MiniMax Prompt" : "MiniMax prompt"}
                  <textarea value={shot.prompt} onChange={(event) => updateShot(shot.id, { prompt: event.target.value, status: "draft" })} />
                </label>
                <div className="studio-field-grid">
                  <label className="studio-field">
                    {isZh ? "时长" : "Duration"}
                    <select value={shot.duration} onChange={(event) => updateShot(shot.id, { duration: event.target.value })}>
                      <option value="5s">5s</option>
                      <option value="6s">6s</option>
                    </select>
                  </label>
                  <label className="studio-field">
                    {isZh ? "画幅" : "Aspect"}
                    <select value={shot.aspectRatio} onChange={(event) => updateShot(shot.id, { aspectRatio: event.target.value as VideoShot["aspectRatio"] })}>
                      <option value="9:16">9:16</option>
                      <option value="16:9">16:9</option>
                      <option value="1:1">1:1</option>
                    </select>
                  </label>
                </div>
              </article>
            ))}
          </div>
        </aside>

        <section className="dashboard-panel studio-panel">
          <div className="studio-section-head">
            <span>{isZh ? "02 模型" : "02 Model"}</span>
            <h2>{isZh ? "MiniMax 生成队列" : "MiniMax generation queue"}</h2>
          </div>
          <label className="studio-field">
            {isZh ? "模型" : "Model"}
            <input value={state.model} onChange={(event) => setState((current) => ({ ...current, model: event.target.value }))} />
          </label>
          <div className="studio-metric-row">
            <strong>{pendingCount}</strong>
            <span>{isZh ? "待生成" : "Pending"}</span>
            <strong>{completedCount}</strong>
            <span>{isZh ? "已完成" : "Done"}</span>
          </div>
          <div className="simple-action-row">
            <button className="primary-button" type="button" onClick={generateAll} disabled={Boolean(busyShotId)}>
              {busyShotId ? <Loader2 className="spin-icon" size={16} /> : <Play size={16} />}
              {isZh ? "批量生成" : "Generate all"}
            </button>
            <button className="secondary-button" type="button" onClick={() => void saveVideoProjectToList()} disabled={savingProject}>
              <Save size={16} />
              {savingProject ? (isZh ? "保存中" : "Saving") : (isZh ? "保存到项目列表" : "Save Project")}
            </button>
            <button className="secondary-button" type="button" onClick={exportJson}>
              <Download size={16} />
              {isZh ? "导出 JSON" : "Export JSON"}
            </button>
          </div>
          {saveStatus ? <small className="field-note">{saveStatus}</small> : null}

          <div className="studio-queue-list">
            {state.shots.map((shot, index) => (
              <article className="studio-queue-item" key={shot.id}>
                <div>
                  <strong>Shot {index + 1}</strong>
                  <small>{shot.taskId || (isZh ? "未提交" : "Not submitted")}</small>
                </div>
                <span data-status={shot.status}>{shot.status}</span>
                <button className="secondary-button" type="button" onClick={() => generateShot(shot)} disabled={busyShotId === shot.id}>
                  {busyShotId === shot.id ? <Loader2 className="spin-icon" size={16} /> : <Play size={16} />}
                  {isZh ? "生成" : "Generate"}
                </button>
                <button className="icon-button" type="button" onClick={() => refreshShot(shot)} disabled={!shot.taskId || busyShotId === shot.id} aria-label="Refresh status">
                  <RefreshCw size={16} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <aside className="dashboard-panel studio-panel">
          <div className="studio-section-head">
            <span>{isZh ? "03 输出" : "03 Output"}</span>
            <h2>{isZh ? "预览图鉴" : "Preview grid"}</h2>
          </div>
          <div className="studio-universe-box">
            <div className="studio-section-head">
              <span>Universe</span>
              <h3>{isZh ? "保存视频资产到 Inbox" : "Save video assets to Inbox"}</h3>
            </div>
            {universes.length ? (
              <label className="studio-field">
                {isZh ? "选择 Universe" : "Select Universe"}
                <select value={selectedUniverseId} onChange={(event) => setSelectedUniverseId(event.target.value)}>
                  {universes.map((universe) => (
                    <option key={universe.id} value={universe.id}>{universe.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <small className="field-note">{isZh ? "先从分镜工作台创建或关联 Universe。" : "Create or link a Universe from Storyboard first."}</small>
            )}
            <button className="primary-button" type="button" onClick={() => void sendVideoToUniverse()} disabled={universeBusy || !session || !selectedUniverseId}>
              {isZh ? "发送 Inbox" : "Send Inbox"}
            </button>
            {universeStatus ? <small className="field-note">{universeStatus}</small> : null}
          </div>
          <div className="studio-preview-grid">
            {state.shots.map((shot, index) => (
              <article className="studio-preview-card" key={shot.id}>
                {shot.videoUrl ? (
                  <video src={shot.videoUrl} controls playsInline />
                ) : (
                  <div className="studio-preview-empty">
                    <strong>Shot {index + 1}</strong>
                    <span>{shot.status}</span>
                  </div>
                )}
                <div>
                  <strong>{shot.sceneTitle || `Shot ${index + 1}`}</strong>
                  <p>{shot.error || shot.prompt || (isZh ? "等待生成" : "Waiting for generation")}</p>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
