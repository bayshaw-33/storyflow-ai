"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, BookOpen, Download, RefreshCcw, Save, Send, Sparkles } from "lucide-react";
import type { TaskType } from "@/lib/ai/prompts";
import {
  DEFAULT_PROJECT_GROUP,
  createNovelProject,
  exportProjectMarkdown,
  getStepContent,
  getWorkflowSteps,
  readProjectsFromStorage,
  saveStepVersion,
  setStepContent,
  upsertProject,
  type DramaProject,
  type NovelSettings,
} from "@/lib/projects";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { syncProjectsWithSupabase, upsertProjectToSupabase } from "@/lib/supabase/projects";
import { useI18n } from "@/lib/i18n/useI18n";

const settingOptions = {
  type: ["狼人Alpha", "逆袭复仇", "奇幻冒险", "都市甜宠", "悬疑惊悚", "科幻末世", "其他"],
  platform: ["WebNovel / Dreame", "GoodNovel", "Radish", "中文网文", "多平台"],
  language: ["英文", "中文", "西班牙语", "法语", "日语", "韩语"],
};

const editableTasks: TaskType[] = [
  "novel_brief",
  "novel_bible",
  "novel_characters",
  "novel_volume_outline",
  "novel_chapter_outline",
  "novel_chapter_draft",
  "novel_export",
];

function createFreshNovelProject() {
  return createNovelProject({
    title: "未命名小说项目",
    projectGroup: DEFAULT_PROJECT_GROUP,
  });
}

export default function NovelWorkbenchPage() {
  return (
    <Suspense fallback={<main className="cosmic-page novel-workbench-page" />}>
      <NovelWorkbenchContent />
    </Suspense>
  );
}

function NovelWorkbenchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [session, setSession] = useState<Session | null>(null);
  const [project, setProject] = useState<DramaProject>(() => createFreshNovelProject());
  const [activeTask, setActiveTask] = useState<TaskType>("novel_brief");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState<TaskType | null>(null);
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [cloudWarning, setCloudWarning] = useState("");

  const steps = useMemo(() => getWorkflowSteps("novel"), []);
  const activeContent = getStepContent(project, activeTask);
  const latestChapter = project.novelChapters[project.novelChapters.length - 1];
  const completedCount = steps.filter((step) => getStepContent(project, step.key).trim()).length;

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const projectId = searchParams.get("projectId");
    const forceNew = searchParams.get("new") === "1";

    void supabase?.auth.getSession().then(async ({ data }) => {
      setSession(data.session || null);
      if (forceNew) return;

      const localProjects = readProjectsFromStorage();
      const localProject = projectId ? localProjects.find((item) => item.id === projectId) : null;
      if (localProject?.workflowType === "novel") {
        setProject(localProject);
        return;
      }

      const synced = await syncProjectsWithSupabase(localProjects, { accessToken: data.session?.access_token || null });
      const cloudProject = projectId ? synced.projects.find((item) => item.id === projectId) : null;
      if (cloudProject?.workflowType === "novel") setProject(cloudProject);
    });

    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession)) || {};

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [searchParams]);

  function updateProject(patch: Partial<DramaProject>) {
    setProject((current) => ({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateSettings(patch: Partial<NovelSettings>) {
    setProject((current) => ({
      ...current,
      genre: patch.type || current.genre,
      targetLanguage: patch.targetLanguage || current.targetLanguage,
      novelSettings: {
        ...current.novelSettings,
        ...patch,
      },
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateActiveContent(value: string) {
    setProject((current) => setStepContent(current, activeTask, value));
  }

  async function saveProject(nextProject = project) {
    setError("");
    setCloudWarning("");
    upsertProject(nextProject);

    if (!session?.access_token) {
      setStatus(isZh ? "已保存到本地项目列表。" : "Saved to local project list.");
      return;
    }

    try {
      await upsertProjectToSupabase(nextProject, { accessToken: session.access_token });
    } catch {
      setCloudWarning(isZh ? "已保存到本地，但同步到云端失败。" : "Saved locally, but cloud sync failed.");
    }
    setStatus(isZh ? "已保存到项目列表。" : "Saved to project list.");
  }

  async function generate(taskType: TaskType) {
    setError("");
    setStatus("");

    if (!session?.access_token) {
      setError(isZh ? "请先登录后再使用 AI 生成。" : "Sign in before using AI generation.");
      return;
    }

    setGenerating(taskType);
    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          taskType,
          projectId: project.id,
          projectTitle: project.title,
          market: project.market,
          genre: project.novelSettings.type || project.genre,
          idea: project.idea,
          input: buildTaskInput(project, taskType, revisionInstruction),
          context: buildNovelContext(project),
          options: {
            market: project.market,
            genre: project.novelSettings.type || project.genre,
            targetLanguage: project.novelSettings.targetLanguage,
            targetWordCount: project.novelSettings.targetWordCount,
            platform: project.novelSettings.targetPlatform,
            chapterNo: (latestChapter?.chapterNo || 0) + (taskType === "novel_chapter_outline" ? 1 : 0),
            optimizeInstruction: taskType === "novel_revision" ? revisionInstruction : "",
          },
          allSteps: {
            novel_brief: project.novelBrief,
            novel_bible: project.novelBible,
            novel_characters: project.novelCharacters,
            novel_volume_outline: project.novelVolumeOutline,
            novel_chapter_outline: project.novelChapterOutline,
            novel_chapter_draft: project.novelChapterDraft,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || "AI 生成失败");

      const nextProject = saveStepVersion(
        setStepContent(project, taskType, data.output),
        taskType,
        data.output,
        taskType === "novel_revision" ? "optimize" : "ai",
      );
      setProject(nextProject);
      setActiveTask(taskType === "novel_revision" ? "novel_chapter_draft" : taskType);
      await saveProject(nextProject);
      setStatus(isZh ? "生成完成，已保存版本。" : "Generated and versioned.");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : (isZh ? "生成失败。" : "Generation failed."));
    } finally {
      setGenerating(null);
    }
  }

  async function sendUniverseInbox() {
    setError("");
    setStatus("");
    if (!session?.access_token) {
      setError(isZh ? "请先登录后再发送 Universe Inbox。" : "Sign in before sending Universe Inbox.");
      return;
    }
    if (!project.universeId) {
      setError(isZh ? "当前小说还没有关联 Universe。请先从 Universe 页面关联或创建。" : "This novel is not linked to a Universe yet.");
      return;
    }

    const response = await fetch("/api/universe/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ universeId: project.universeId, project }),
    });
    const data = await response.json();
    if (!response.ok || !data?.success) {
      setError(data?.error || (isZh ? "发送失败。" : "Failed to send Universe Inbox."));
      return;
    }
    setStatus(isZh ? `已发送 ${data.items?.length || 0} 条候选项到 Universe Inbox。` : `Sent ${data.items?.length || 0} candidates to Universe Inbox.`);
  }

  function downloadMarkdown() {
    const blob = new Blob([exportProjectMarkdown(project)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.title || "novel-project"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="cosmic-page novel-workbench-page">
      <section className="cosmic-title-band">
        <button className="icon-button" type="button" onClick={() => router.push("/dashboard")} title={isZh ? "返回工作台" : "Back to dashboard"}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <span>{isZh ? "小说创作" : "Novel Creation"}</span>
          <h1>{project.title || (isZh ? "未命名小说项目" : "Untitled Novel")}</h1>
        </div>
        <div className="header-actions">
          <button className="secondary-button" type="button" onClick={downloadMarkdown}>
            <Download size={16} /> {isZh ? "导出" : "Export"}
          </button>
          <button className="primary-button" type="button" onClick={() => void saveProject()}>
            <Save size={16} /> {isZh ? "保存到项目列表" : "Save to projects"}
          </button>
        </div>
      </section>

      <section className="novel-workbench-shell">
        {(error || status || cloudWarning) ? (
          <div className={error ? "notice error" : cloudWarning ? "notice warning" : "notice success"}>
            {error || cloudWarning || status}
          </div>
        ) : null}

        <aside className="dashboard-panel novel-sidebar">
          <div className="dashboard-panel-head">
            <div>
              <span>{isZh ? "项目设定" : "SETUP"}</span>
              <h2>{isZh ? "连载参数" : "Serial Settings"}</h2>
            </div>
          </div>

          <label>
            {isZh ? "标题" : "Title"}
            <input value={project.title} onChange={(event) => updateProject({ title: event.target.value })} />
          </label>
          <label>
            {isZh ? "小说类型" : "Novel Type"}
            <select value={project.novelSettings.type} onChange={(event) => updateSettings({ type: event.target.value })}>
              {settingOptions.type.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            {isZh ? "目标平台" : "Platform"}
            <select value={project.novelSettings.targetPlatform} onChange={(event) => updateSettings({ targetPlatform: event.target.value })}>
              {settingOptions.platform.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            {isZh ? "目标语言" : "Language"}
            <select value={project.novelSettings.targetLanguage} onChange={(event) => updateSettings({ targetLanguage: event.target.value })}>
              {settingOptions.language.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            {isZh ? "目标字数" : "Target Words"}
            <input
              type="number"
              min={10000}
              step={10000}
              value={project.novelSettings.targetWordCount}
              onChange={(event) => updateSettings({ targetWordCount: Number(event.target.value) || 0 })}
            />
          </label>
          <label>
            {isZh ? "连载频率" : "Frequency"}
            <input value={project.novelSettings.serializationFrequency} onChange={(event) => updateSettings({ serializationFrequency: event.target.value })} />
          </label>
          <label>
            {isZh ? "故事创意" : "Story Idea"}
            <textarea value={project.idea} onChange={(event) => updateProject({ idea: event.target.value })} />
          </label>

          <div className="novel-step-list">
            {steps.map((step) => {
              const done = getStepContent(project, step.key).trim();
              return (
                <button
                  className={activeTask === step.key ? "novel-step-button active" : "novel-step-button"}
                  type="button"
                  key={step.key}
                  onClick={() => setActiveTask(step.key)}
                >
                  <span>{step.short}</span>
                  <strong>{step.label}</strong>
                  <i>{done ? (isZh ? "已生成" : "Done") : (isZh ? "待处理" : "Pending")}</i>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="dashboard-panel novel-editor-panel">
          <div className="dashboard-panel-head">
            <div>
              <span>{completedCount}/{steps.length} {isZh ? "已完成" : "complete"}</span>
              <h2>{steps.find((step) => step.key === activeTask)?.label}</h2>
            </div>
            <BookOpen size={20} />
          </div>

          <textarea
            className="novel-main-editor"
            value={activeContent}
            onChange={(event) => updateActiveContent(event.target.value)}
            placeholder={isZh ? "在这里编辑当前模块内容，或使用右侧 AI 工具生成。" : "Edit the active module here, or generate with AI tools on the right."}
          />

          <div className="novel-chapter-strip">
            {(project.novelChapters.length ? project.novelChapters : []).map((chapter) => (
              <button type="button" key={chapter.id} onClick={() => setActiveTask("novel_chapter_draft")}>
                <strong>#{chapter.chapterNo}</strong>
                <span>{chapter.title}</span>
                <i>{chapter.wordCount} {isZh ? "字" : "words"}</i>
              </button>
            ))}
            {!project.novelChapters.length ? (
              <div className="novel-empty-chapters">{isZh ? "生成章节正文后，会在这里形成章节列表。" : "Generated chapter drafts will appear here."}</div>
            ) : null}
          </div>
        </section>

        <aside className="dashboard-panel novel-ai-panel">
          <div className="dashboard-panel-head">
            <div>
              <span>{isZh ? "AI 工具" : "AI TOOLS"}</span>
              <h2>{isZh ? "生产动作" : "Actions"}</h2>
            </div>
          </div>

          <div className="novel-action-grid">
            {editableTasks.map((task) => (
              <button className="secondary-button" type="button" key={task} onClick={() => void generate(task)} disabled={Boolean(generating)}>
                <Sparkles size={15} />
                {generating === task ? (isZh ? "生成中" : "Generating") : steps.find((step) => step.key === task)?.short}
              </button>
            ))}
          </div>

          <div className="novel-tool-section">
            <strong>{isZh ? "按指令修改章节" : "Revise Chapter"}</strong>
            <textarea
              value={revisionInstruction}
              onChange={(event) => setRevisionInstruction(event.target.value)}
              placeholder={isZh ? "例如：增强狼人男主的危险感，结尾改成身份暴露。" : "Example: make the Alpha lead more dangerous and end with identity exposure."}
            />
            <button className="primary-button full" type="button" onClick={() => void generate("novel_revision")} disabled={Boolean(generating) || !revisionInstruction.trim()}>
              <RefreshCcw size={16} /> {isZh ? "应用修改" : "Apply Revision"}
            </button>
          </div>

          <div className="novel-tool-section">
            <strong>{isZh ? "连续性与 Universe" : "Continuity & Universe"}</strong>
            <p>{latestChapter?.continuityNotes || project.novelContinuityNotes || (isZh ? "暂无连续性备注。" : "No continuity notes yet.")}</p>
            <button className="secondary-button full" type="button" onClick={() => void sendUniverseInbox()}>
              <Send size={16} /> {isZh ? "发送 Universe Inbox" : "Send Universe Inbox"}
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}

function buildTaskInput(project: DramaProject, taskType: TaskType, revisionInstruction: string) {
  if (taskType === "novel_revision") {
    return [
      "【修改指令】",
      revisionInstruction,
      "",
      "【当前章节】",
      project.novelChapterDraft || project.novelChapters.at(-1)?.draft || "",
    ].join("\n");
  }

  if (taskType === "novel_chapter_draft") {
    return project.novelChapterOutline || project.novelBrief || project.idea;
  }

  if (taskType === "novel_chapter_outline") {
    return project.novelVolumeOutline || project.novelBrief || project.idea;
  }

  return getStepContent(project, taskType) || project.idea;
}

function buildNovelContext(project: DramaProject) {
  const settings = project.novelSettings;
  const latestChapter = project.novelChapters.at(-1);

  return [
    `小说类型：${settings.type}`,
    `目标平台：${settings.targetPlatform}`,
    `目标语言：${settings.targetLanguage}`,
    `目标字数：${settings.targetWordCount}`,
    `连载频率：${settings.serializationFrequency}`,
    `目标读者：${settings.targetReader}`,
    `留存钩子：${settings.retentionHook}`,
    project.universeId ? `关联 Universe：${project.universeId}` : "",
    project.novelBible ? `小说 Bible：\n${project.novelBible}` : "",
    project.novelCharacters ? `角色卡：\n${project.novelCharacters}` : "",
    project.novelVolumeOutline ? `分卷大纲：\n${project.novelVolumeOutline}` : "",
    latestChapter ? `上一章：第 ${latestChapter.chapterNo} 章 ${latestChapter.title}\n${latestChapter.continuityNotes || latestChapter.endingHook}` : "",
  ].filter(Boolean).join("\n\n");
}
