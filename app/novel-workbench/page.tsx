"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, BookOpen, Download, Link2, Lock, Plus, RefreshCcw, Save, Send, Sparkles, Unlock } from "lucide-react";
import { AuthModal } from "@/components/layout/AuthModal";
import { readByoApiConfig } from "@/lib/ai/byoClient";
import type { TaskType } from "@/lib/ai/prompts";
import {
  DEFAULT_PROJECT_GROUP,
  createProject,
  createNovelProject,
  exportProjectMarkdown,
  getStepContent,
  getWorkflowSteps,
  readProjectsFromStorage,
  saveStepVersion,
  setStepContent,
  upsertProject,
  type DramaProject,
  type NovelChapter,
  type NovelSettings,
} from "@/lib/projects";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { syncProjectsWithSupabase, upsertProjectToSupabase } from "@/lib/supabase/projects";
import {
  createUniverseFromProject,
  DEFAULT_INHERITANCE_SETTINGS,
  listUniverses,
  saveInboxItems,
  upsertUniverseProjectLink,
  type Universe,
} from "@/lib/universe";
import { useI18n } from "@/lib/i18n/useI18n";

const settingOptions = {
  type: ["狼人Alpha", "逆袭复仇", "奇幻冒险", "都市甜宠", "悬疑惊悚", "科幻末世", "其他"],
  platform: ["WebNovel / Dreame", "GoodNovel", "Radish", "中文网文", "多平台"],
  language: ["英文", "中文", "西班牙语", "法语", "日语", "韩语"],
};
const AI_GENERATION_TIMEOUT_MS = 75_000;

type MobilePanel = "setup" | "editor" | "ai";
type Credits = { balance: number; monthlyLimit: number };
type AuthMode = "signin" | "signup";
type WorkspaceEntryDraft = {
  workflowId?: string;
  projectTitle?: string;
  prompt?: string;
  file?: {
    name?: string;
    type?: string;
    size?: number;
    textPreview?: string;
  } | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

const novelActionTasks: TaskType[] = [
  "novel_brief",
  "novel_bible",
  "novel_characters",
  "novel_chapter_draft",
  "translation",
  "localization",
  "novel_export",
];

const stepCopy: Record<TaskType, { zh: string; en: string; shortZh: string; shortEn: string }> = {
  market_analysis: { zh: "市场分析", en: "Market", shortZh: "市场", shortEn: "Market" },
  script_import: { zh: "剧本导入", en: "Import", shortZh: "导入", shortEn: "Import" },
  brief: { zh: "创意 Brief", en: "Brief", shortZh: "创意", shortEn: "Brief" },
  characters: { zh: "角色", en: "Characters", shortZh: "角色", shortEn: "Cast" },
  structure_model: { zh: "结构模型", en: "Structure", shortZh: "结构", shortEn: "Structure" },
  beat_cards: { zh: "节拍卡", en: "Beat Cards", shortZh: "节拍", shortEn: "Beats" },
  series_outline: { zh: "大纲", en: "Outline", shortZh: "大纲", shortEn: "Outline" },
  existing_script: { zh: "已有剧本", en: "Existing Script", shortZh: "已有", shortEn: "Existing" },
  chinese_script: { zh: "中文剧本", en: "Chinese Script", shortZh: "中文", shortEn: "Script" },
  continuation_script: { zh: "续写剧本", en: "Continuation", shortZh: "续写", shortEn: "Continue" },
  translation: { zh: "翻译", en: "Translation", shortZh: "翻译", shortEn: "Translate" },
  localization: { zh: "本土化", en: "Localization", shortZh: "本土化", shortEn: "Localize" },
  test_script: { zh: "测试剧本", en: "Test Script", shortZh: "测试", shortEn: "Test" },
  quality_evaluation: { zh: "诊断评估", en: "Evaluation", shortZh: "评估", shortEn: "Evaluate" },
  final_script: { zh: "最终剧本", en: "Final Script", shortZh: "最终", shortEn: "Final" },
  format_check: { zh: "格式检查", en: "Format Check", shortZh: "格式", shortEn: "Format" },
  storyboard_script: { zh: "分镜", en: "Storyboard", shortZh: "分镜", shortEn: "Storyboard" },
  final_delivery: { zh: "最终交付", en: "Delivery", shortZh: "交付", shortEn: "Deliver" },
  song_workbench: { zh: "歌曲创作", en: "Song Creation", shortZh: "歌曲", shortEn: "Song" },
  viral_video_analysis: { zh: "爆款分析", en: "Viral Analysis", shortZh: "分析", shortEn: "Analyze" },
  viral_structure_remake: { zh: "同结构改写", en: "Structure Remake", shortZh: "改写", shortEn: "Remake" },
  viral_export_package: { zh: "爆款交付", en: "Viral Export", shortZh: "交付", shortEn: "Export" },
  song_development_chat: { zh: "歌曲创作对话", en: "Song Development Chat", shortZh: "对话反馈", shortEn: "Chat feedback" },
  novel_development_chat: { zh: "小说创作对话", en: "Novel Development Chat", shortZh: "对话反馈", shortEn: "Chat feedback" },
  novel_brief: { zh: "小说背景", en: "Novel Background", shortZh: "生成背景", shortEn: "Generate background" },
  novel_bible: { zh: "小说世界观及大纲", en: "World & Outline", shortZh: "生成世界观", shortEn: "Generate world" },
  novel_characters: { zh: "角色 Bible", en: "Character Bible", shortZh: "生成角色", shortEn: "Generate bible" },
  novel_volume_outline: { zh: "分卷大纲", en: "Volume Outline", shortZh: "生成卷纲", shortEn: "Volume outline" },
  novel_chapter_outline: { zh: "章节大纲", en: "Chapter Outline", shortZh: "生成章纲", shortEn: "Chapter outline" },
  novel_chapter_draft: { zh: "小说正文", en: "Manuscript", shortZh: "生成正文", shortEn: "Generate manuscript" },
  novel_revision: { zh: "章节修改", en: "Chapter Revision", shortZh: "修改章节", shortEn: "Revise chapter" },
  novel_export: { zh: "小说导出", en: "Novel Export", shortZh: "生成导出包", shortEn: "Export package" },
};

function createFreshNovelProject() {
  return createNovelProject({
    title: "未命名小说项目",
    projectGroup: DEFAULT_PROJECT_GROUP,
  });
}

function createChatMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: `novel-chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function createAssistantMessage(content: string) {
  return createChatMessage("assistant", content);
}

function getNovelOpeningMessage(isZh: boolean) {
  if (!isZh) {
    return [
      "Dear creator, I am KK, your novel creation assistant.",
      "Before we begin, tell me what you have in mind:",
      "1. What genre do you want to write?",
      "2. Which platform are you preparing it for?",
      "3. What target language should we write toward?",
      "4. Who are your target readers?",
      "5. Have you chosen a title? If yes, tell me. If not, you can edit it later in project management.",
      "Creator, share your idea with me. Let us build it together.",
    ].join("\n");
  }

  return [
    "尊敬的创作者大人，我是您的小说创作小助理 KK。",
    "在开始创作前，请告诉我您的想法：",
    "1. 您想创作的小说题材是什么？",
    "2. 准备发布在什么平台呢？",
    "3. 目标语言是什么？",
    "4. 目标读者是哪些呢？",
    "5. 给小说想好名字了吗？如果想好了请告诉我；如果没想好，待会您可以自己在项目管理里面编辑小说名字哦！",
    "创作者大人，告诉我您的想法，让我们一起创作吧！",
  ].join("\n");
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
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("editor");
  const [credits, setCredits] = useState<Credits | null>(null);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [selectedUniverseId, setSelectedUniverseId] = useState("");
  const [universeBusy, setUniverseBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatHydrated, setChatHydrated] = useState(false);
  const [chatGenerating, setChatGenerating] = useState(false);

  const steps = useMemo(() => getWorkflowSteps("novel"), []);
  const activeChapter = useMemo(
    () => project.novelChapters.find((chapter) => chapter.id === activeChapterId) || project.novelChapters[project.novelChapters.length - 1] || null,
    [activeChapterId, project.novelChapters],
  );
  const activeContent = getActiveNovelContent(project, activeTask, activeChapter);
  const latestChapter = project.novelChapters[project.novelChapters.length - 1];
  const completedCount = steps.filter((step) => getStepContent(project, step.key).trim()).length;
  const isChapterTask = activeTask === "novel_chapter_outline" || activeTask === "novel_chapter_draft" || activeTask === "novel_revision";
  const secondaryTasks = novelActionTasks.filter((task) => task !== activeTask);
  const currentStepIndex = Math.max(0, novelActionTasks.indexOf(activeTask));
  const nextTask = novelActionTasks[currentStepIndex + 1] || null;
  const aiDisabledReason = !session?.access_token
    ? (isZh ? "登录后可使用 AI 生成。" : "Sign in to use AI generation.")
    : credits?.balance === 0
      ? (isZh ? "本月 AI 额度已用完。" : "Monthly AI credits are used up.")
      : "";
  const activeBlockedReason = getNovelTaskBlockedReason(activeTask, project, activeChapter, revisionInstruction, isZh);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const projectId = searchParams.get("projectId");
    const forceNew = searchParams.get("new") === "1";
    if (forceNew || !projectId) {
      const draft = readWorkspaceEntryDraft("novel");
      if (draft) {
        setProject((current) => ({
          ...current,
          title: draft.projectTitle?.trim() || current.title,
          idea: [draft.prompt?.trim(), draft.file?.textPreview ? `${draft.file.name || "Attached file"}\n${draft.file.textPreview}` : ""].filter(Boolean).join("\n\n") || current.idea,
          updatedAt: new Date().toISOString(),
        }));
      }
      setSettingsModalOpen(false);
    }

    void supabase?.auth.getSession().then(async ({ data }) => {
      setSession(data.session || null);
      if (forceNew) return;

      const localProjects = readProjectsFromStorage();
      const localProject = projectId ? localProjects.find((item) => item.id === projectId) : null;
      if (localProject?.workflowType === "novel") {
        setProject(localProject);
        setActiveChapterId(localProject.novelChapters.at(-1)?.id || null);
        return;
      }

      const synced = await syncProjectsWithSupabase(localProjects, { accessToken: data.session?.access_token || null });
      const cloudProject = projectId ? synced.projects.find((item) => item.id === projectId) : null;
      if (cloudProject?.workflowType === "novel") {
        setProject(cloudProject);
        setActiveChapterId(cloudProject.novelChapters.at(-1)?.id || null);
      }
    });

    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession)) || {};

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [searchParams]);

  useEffect(() => {
    if (chatHydrated) return;
    if (!project.novelDevelopmentNotes.trim()) {
      setChatMessages([createAssistantMessage(getNovelOpeningMessage(isZh))]);
      setChatHydrated(true);
      return;
    }

    setChatMessages([
      createAssistantMessage(isZh ? "我已读取这个项目之前保存的创作沟通记录。可以继续补充新想法，或直接基于记录生成当前阶段。" : "I loaded the saved development notes for this project. You can keep talking, or generate the active stage from the notes."),
      createAssistantMessage(project.novelDevelopmentNotes),
    ]);
    setChatHydrated(true);
  }, [chatHydrated, isZh, project.novelDevelopmentNotes]);

  useEffect(() => {
    if (!session?.access_token) {
      setCredits(null);
      setUniverses([]);
      return;
    }

    let cancelled = false;

    async function loadAccountContext() {
      const [creditsResult, universeRows] = await Promise.all([
        fetch("/api/account/credits", {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        }).then((response) => response.ok ? response.json() : null).catch(() => null),
        listUniverses({ accessToken: session?.access_token }).catch(() => []),
      ]);

      if (cancelled) return;
      if (creditsResult?.success && creditsResult.credits) {
        setCredits({
          balance: creditsResult.credits.balance,
          monthlyLimit: creditsResult.credits.monthlyLimit,
        });
      }
      setUniverses(universeRows);
      setSelectedUniverseId(project.universeId || universeRows[0]?.id || "");
    }

    void loadAccountContext();
    return () => {
      cancelled = true;
    };
  }, [project.universeId, session?.access_token]);

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
    if (activeTask === "novel_chapter_outline" || activeTask === "novel_chapter_draft" || activeTask === "novel_revision") {
      updateCurrentChapter(activeTask === "novel_chapter_outline" ? { outline: value } : { draft: value });
      return;
    }

    setProject((current) => setStepContent(current, activeTask, value));
  }

  function updateCurrentChapter(patch: Partial<NovelChapter>) {
    setProject((current) => {
      const now = new Date().toISOString();
      const chapters = current.novelChapters.length ? current.novelChapters : [createBlankChapter(1)];
      const targetId = activeChapterId || chapters[chapters.length - 1]?.id;
      const nextChapters = chapters.map((chapter) => {
        if (chapter.id !== targetId) return chapter;
        const nextDraft = patch.draft ?? chapter.draft;
        return {
          ...chapter,
          ...patch,
          wordCount: patch.draft !== undefined ? countNovelWords(nextDraft) : chapter.wordCount,
          updatedAt: now,
        };
      });
      const nextActive = nextChapters.find((chapter) => chapter.id === targetId) || nextChapters[nextChapters.length - 1];
      if (!activeChapterId && nextActive) setActiveChapterId(nextActive.id);

      return {
        ...current,
        novelChapterOutline: nextActive?.outline || current.novelChapterOutline,
        novelChapterDraft: nextActive?.draft || current.novelChapterDraft,
        novelContinuityNotes: nextActive?.continuityNotes || current.novelContinuityNotes,
        novelChapters: nextChapters,
        updatedAt: now,
      };
    });
  }

  function addChapter() {
    const chapter = createBlankChapter(project.novelChapters.length + 1);
    const nextProject = {
      ...project,
      novelChapters: [...project.novelChapters, chapter],
      novelChapterOutline: chapter.outline,
      novelChapterDraft: chapter.draft,
      updatedAt: new Date().toISOString(),
    };
    setProject(nextProject);
    setActiveChapterId(chapter.id);
    setActiveTask("novel_chapter_outline");
    setMobilePanel("editor");
  }

  function selectChapter(chapterId: string) {
    const chapter = project.novelChapters.find((item) => item.id === chapterId);
    if (!chapter) return;
    setActiveChapterId(chapter.id);
    setProject((current) => ({
      ...current,
      novelChapterOutline: chapter.outline,
      novelChapterDraft: chapter.draft,
      novelContinuityNotes: chapter.continuityNotes,
    }));
    setActiveTask(chapter.draft ? "novel_chapter_draft" : "novel_chapter_outline");
    setMobilePanel("editor");
  }

  function toggleChapterLock() {
    if (!activeChapter) return;
    updateCurrentChapter({ status: activeChapter.status === "locked" ? "draft" : "locked" });
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
      setCloudWarning(isZh ? "已保存到本地项目列表，云端同步待配置完成后自动可用。" : "Saved locally. Cloud sync will work after the Supabase setup is complete.");
    }
    setStatus(isZh ? "已保存到工作台。" : "Saved to Workspace.");
  }

  async function sendChatMessage() {
    const trimmed = chatInput.trim();
    if (!trimmed || chatGenerating) return;

    setError("");
    setStatus("");
    setChatInput("");

    const userMessage = createChatMessage("user", trimmed);
    setChatMessages((current) => [...current, userMessage]);

    const notesWithUser = appendDevelopmentNotes(project.novelDevelopmentNotes, "USER", trimmed);
    const projectWithUser: DramaProject = {
      ...project,
      idea: project.idea.trim() ? project.idea : trimmed,
      novelDevelopmentNotes: notesWithUser,
      updatedAt: new Date().toISOString(),
    };
    setProject(projectWithUser);
    upsertProject(projectWithUser);

    if (!session?.access_token) {
      const assistantMessage = createAssistantMessage(isZh
        ? "我已经先把这条想法记录进项目。登录后，我可以基于这些记录继续追问、归纳，并生成右侧阶段文档。"
        : "I saved this idea into the project notes. After sign-in, I can question, summarize, and generate the stage document from these notes.");
      setChatMessages((current) => [...current, assistantMessage]);
      const localProject = {
        ...projectWithUser,
        novelDevelopmentNotes: appendDevelopmentNotes(projectWithUser.novelDevelopmentNotes, "AI", assistantMessage.content),
        updatedAt: new Date().toISOString(),
      };
      setProject((current) => ({
        ...current,
        novelDevelopmentNotes: appendDevelopmentNotes(current.novelDevelopmentNotes, "AI", assistantMessage.content),
        updatedAt: new Date().toISOString(),
      }));
      upsertProject(localProject);
      return;
    }

    if (credits?.balance === 0) {
      setError(isZh ? "本月 AI 额度已用完。" : "Monthly AI credits are used up.");
      return;
    }

    setChatGenerating(true);
    setStatus(isZh ? "AI 正在读你的想法…" : "AI is reading your idea…");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), AI_GENERATION_TIMEOUT_MS);

    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          taskType: "novel_development_chat",
          projectId: projectWithUser.id,
          projectTitle: projectWithUser.title,
          market: projectWithUser.market,
          genre: projectWithUser.novelSettings.type || projectWithUser.genre,
          idea: projectWithUser.idea,
          input: trimmed,
          context: buildNovelChatContext(projectWithUser, activeChapter, activeTask, chatMessages),
          options: {
            market: projectWithUser.market,
            genre: projectWithUser.novelSettings.type || projectWithUser.genre,
            targetLanguage: projectWithUser.novelSettings.targetLanguage,
            targetWordCount: projectWithUser.novelSettings.targetWordCount,
            platform: projectWithUser.novelSettings.targetPlatform,
            optimizeInstruction: `当前正在沟通阶段：${getStepLabel(activeTask, isZh)}`,
          },
          allSteps: buildNovelAllSteps(projectWithUser),
          byoApi: readByoApiConfig("novel"),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || "AI 对话失败");

      const assistantMessage = createAssistantMessage(data.output);
      setChatMessages((current) => [...current, assistantMessage]);
      const notesWithAi = appendDevelopmentNotes(notesWithUser, "AI", data.output);
      const nextProject = saveStepVersion(
        { ...projectWithUser, novelDevelopmentNotes: notesWithAi, updatedAt: new Date().toISOString() },
        "novel_development_chat",
        data.output,
        "ai",
      );
      setProject(nextProject);
      await saveProject(nextProject);
      setStatus(isZh ? "对话已记录，可继续聊或生成当前阶段。" : "Chat saved. Keep talking or generate the active stage.");
      if (credits) setCredits({ ...credits, balance: Math.max(0, credits.balance - 1) });
    } catch (chatError) {
      if (chatError instanceof Error && chatError.name === "AbortError") {
        setError(isZh ? "AI 对话超时，请稍后重试。你的输入已记录。" : "AI chat timed out. Your input was saved.");
      } else {
        setError(chatError instanceof Error ? chatError.message : (isZh ? "AI 对话失败。" : "AI chat failed."));
      }
    } finally {
      window.clearTimeout(timeout);
      setChatGenerating(false);
    }
  }

  async function generate(taskType: TaskType) {
    setError("");
    setStatus("");

    if (aiDisabledReason) {
      setError(aiDisabledReason);
      return;
    }
    const blockedReason = getNovelTaskBlockedReason(taskType, project, activeChapter, revisionInstruction, isZh);
    if (blockedReason) {
      setError(blockedReason);
      return;
    }
    const accessToken = session?.access_token;
    if (!accessToken) return;

    if ((taskType === "novel_revision" || taskType === "novel_chapter_draft") && activeChapter?.status === "locked") {
      setError(isZh ? "当前章节已锁定，解锁后才能改写。" : "This chapter is locked. Unlock it before rewriting.");
      return;
    }

    setGenerating(taskType);
    setStatus(isZh ? "正在生成…" : "Generating…");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), AI_GENERATION_TIMEOUT_MS);
    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          taskType,
          projectId: project.id,
          projectTitle: project.title,
          market: project.market,
          genre: project.novelSettings.type || project.genre,
          idea: project.idea,
          input: buildTaskInput(project, taskType, revisionInstruction, activeChapter),
          context: buildNovelContext(project, activeChapter),
          options: {
            market: project.market,
            genre: project.novelSettings.type || project.genre,
            targetLanguage: project.novelSettings.targetLanguage,
            targetWordCount: project.novelSettings.targetWordCount,
            platform: project.novelSettings.targetPlatform,
            chapterNo: activeChapter?.chapterNo || (latestChapter?.chapterNo || 0) + 1,
            optimizeInstruction: taskType === "novel_revision" ? revisionInstruction : "",
          },
          allSteps: {
            ...buildNovelAllSteps(project),
          },
          byoApi: readByoApiConfig("novel"),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || "AI 生成失败");

      const nextProject = saveStepVersion(
        applyGeneratedOutput(project, taskType, data.output, activeChapter),
        taskType,
        data.output,
        taskType === "novel_revision" ? "optimize" : "ai",
      );
      setProject(nextProject);
      if ((taskType === "novel_chapter_outline" || taskType === "novel_chapter_draft" || taskType === "novel_revision") && nextProject.novelChapters.length) {
        setActiveChapterId(activeChapter?.id || nextProject.novelChapters[nextProject.novelChapters.length - 1].id);
      }
      setActiveTask(taskType === "novel_revision" ? "novel_chapter_draft" : taskType);
      await saveProject(nextProject);
      setStatus(isZh ? "生成完成，已保存版本。" : "Generated and versioned.");
      if (credits) {
        setCredits({ ...credits, balance: Math.max(0, credits.balance - (taskType === "novel_chapter_draft" || taskType === "novel_revision" ? 2 : taskType === "novel_export" ? 0 : 1)) });
      }
    } catch (generateError) {
      if (generateError instanceof Error && generateError.name === "AbortError") {
        setError(isZh ? "AI 生成超时，请稍后重试。当前内容已保留。" : "AI generation timed out. Current content is preserved.");
      } else {
        setError(generateError instanceof Error ? generateError.message : (isZh ? "生成失败。" : "Generation failed."));
      }
    } finally {
      window.clearTimeout(timeout);
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
    await saveInboxItems(data.items || [], { accessToken: session.access_token });
    setStatus(isZh ? `已发送 ${data.items?.length || 0} 条候选项到 Universe Inbox。` : `Sent ${data.items?.length || 0} candidates to Universe Inbox.`);
  }

  async function createAndLinkUniverse() {
    setError("");
    setStatus("");
    if (!session?.access_token) {
      setError(isZh ? "请先登录后再创建 Universe。" : "Sign in before creating a Universe.");
      return;
    }

    setUniverseBusy(true);
    try {
      const { universe } = await createUniverseFromProject({
        project,
        accessToken: session.access_token,
        form: {
          name: `${project.title || (isZh ? "未命名小说" : "Untitled Novel")} Universe`,
          description: project.novelBrief || project.idea || "",
          genre: project.novelSettings.type || project.genre,
          default_language: project.novelSettings.targetLanguage,
          target_markets: [project.market].filter(Boolean),
          tone: project.novelStyleGuide || project.novelSettings.retentionHook || "",
        },
      });
      const nextProject = { ...project, universeId: universe.id, updatedAt: new Date().toISOString() };
      setProject(nextProject);
      setSelectedUniverseId(universe.id);
      setUniverses((current) => [universe, ...current.filter((item) => item.id !== universe.id)]);
      await saveProject(nextProject);
      setStatus(isZh ? "Universe 已创建并关联到当前小说。" : "Universe created and linked to this novel.");
    } catch (universeError) {
      setError(universeError instanceof Error ? universeError.message : (isZh ? "创建 Universe 失败。" : "Universe creation failed."));
    } finally {
      setUniverseBusy(false);
    }
  }

  async function linkExistingUniverse() {
    setError("");
    setStatus("");
    if (!selectedUniverseId) {
      setError(isZh ? "请选择要关联的 Universe。" : "Select a Universe to link.");
      return;
    }
    if (!session?.access_token) {
      setError(isZh ? "请先登录后再关联 Universe。" : "Sign in before linking a Universe.");
      return;
    }

    const now = new Date().toISOString();
    setUniverseBusy(true);
    try {
      await upsertUniverseProjectLink({
        id: `novel-link-${project.id}-${selectedUniverseId}`,
        universe_id: selectedUniverseId,
        project_id: project.id,
        user_id: session.user.id,
        project_role: "adaptation",
        season_number: project.seasonNumber || 1,
        inheritance_settings: project.inheritanceSettings || DEFAULT_INHERITANCE_SETTINGS,
        created_at: now,
        updated_at: now,
      }, { accessToken: session.access_token });
      const nextProject = { ...project, universeId: selectedUniverseId, updatedAt: now };
      setProject(nextProject);
      await saveProject(nextProject);
      setStatus(isZh ? "已关联到现有 Universe。" : "Linked to existing Universe.");
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : (isZh ? "关联 Universe 失败。" : "Universe link failed."));
    } finally {
      setUniverseBusy(false);
    }
  }

  async function createScriptProjectFromNovel() {
    if (!session?.access_token) {
      setAuthMode("signin");
      setAuthOpen(true);
      setError(isZh ? "请先登录后再创建剧本项目。" : "Sign in before creating a script project.");
      return;
    }
    setStatus(isZh ? "正在创建剧本项目…" : "Creating script project…");

    const scriptProject = createProject({
      title: `${project.title || "Novel"} 剧本改编`,
      workflowType: "creation",
      market: project.market,
      genre: project.novelSettings.type || project.genre,
      targetLanguage: project.novelSettings.targetLanguage,
      universeId: project.universeId || null,
      projectGroup: project.projectGroup || DEFAULT_PROJECT_GROUP,
      projectRole: "adaptation",
      inheritanceSettings: {
        sourceProjectId: project.id,
        sourceWorkflowType: "novel",
        inheritUniverse: Boolean(project.universeId),
        ...DEFAULT_INHERITANCE_SETTINGS,
      },
      idea: buildScriptAdaptationBrief(project),
      brief: buildScriptAdaptationBrief(project),
    });

    upsertProject(scriptProject);
    await upsertProjectToSupabase(scriptProject, { accessToken: session.access_token }).catch(() => null);
    router.push(`/projects/${scriptProject.id}?mode=creation`);
  }

  function downloadMarkdown() {
    const blob = new Blob([buildCompleteNovelDownload(project)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.title || "novel-project"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function renderSettingsFields() {
    return (
      <div className="novel-settings-form">
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
          {isZh ? "目标读者" : "Target Reader"}
          <input value={project.novelSettings.targetReader} onChange={(event) => updateSettings({ targetReader: event.target.value })} />
        </label>
        <label>
          {isZh ? "留存钩子" : "Retention Hook"}
          <input value={project.novelSettings.retentionHook} onChange={(event) => updateSettings({ retentionHook: event.target.value })} />
        </label>
        <label className="wide">
          {isZh ? "故事创意" : "Story Idea"}
          <textarea value={project.idea} onChange={(event) => updateProject({ idea: event.target.value })} />
        </label>
      </div>
    );
  }

  return (
    <main className="cosmic-page novel-workbench-page">
      <section className="novel-topbar">
        <div className="novel-topbar-left">
          <button className="icon-button" type="button" onClick={() => router.push("/dashboard")} title={isZh ? "返回工作台" : "Back to Workspace"}>
            <ArrowLeft size={18} />
          </button>
          <div className="novel-title-block">
            <span>{isZh ? "小说创作" : "Novel Creation"}</span>
            <h1>{project.title || (isZh ? "未命名小说项目" : "Untitled Novel")}</h1>
          </div>
        </div>
        <div className="novel-topbar-actions">
          <button className="secondary-button" type="button" onClick={() => setSettingsModalOpen(true)}>
            {isZh ? "项目设定" : "Project settings"}
          </button>
          <button className="secondary-button" type="button" onClick={downloadMarkdown}>
            <Download size={16} /> {isZh ? "导出" : "Export"}
          </button>
          <button className="primary-button" type="button" onClick={() => void saveProject()}>
            <Save size={16} /> {isZh ? "保存到工作台" : "Save to Workspace"}
          </button>
        </div>
      </section>

      <nav className="novel-mobile-tabs" aria-label={isZh ? "小说创作面板" : "Novel workbench panels"}>
        {(["setup", "editor", "ai"] as const).map((panel) => (
          <button
            className={mobilePanel === panel ? "active" : ""}
            type="button"
            key={panel}
            onClick={() => setMobilePanel(panel)}
          >
            {panel === "setup" ? (isZh ? "流程" : "Flow") : panel === "editor" ? (isZh ? "对话" : "Chat") : (isZh ? "预览 / 宇宙" : "Preview / Universe")}
          </button>
        ))}
      </nav>

      <section className="novel-workbench-shell">
        {(error || status || cloudWarning || generating) ? (
          <div className={error ? "notice error" : cloudWarning || generating ? "notice warning" : "notice success"}>
            {error || cloudWarning || (generating ? (isZh ? "正在生成，请勿关闭页面…" : "Generating. Keep this page open…") : status)}
          </div>
        ) : null}

        <aside className={mobilePanel === "setup" ? "dashboard-panel novel-sidebar is-mobile-active" : "dashboard-panel novel-sidebar"}>
          <div className="dashboard-panel-head">
            <div>
              <span>{isZh ? "工作流" : "Workflow"}</span>
              <h2>{isZh ? "7 阶段小说流程" : "7-stage novel flow"}</h2>
            </div>
          </div>

          <details className="novel-settings-summary">
            <summary>{isZh ? "项目设定" : "Project settings"}</summary>
            <div className="novel-settings-chips">
              <span>{project.novelSettings.type || (isZh ? "未选类型" : "No type")}</span>
              <span>{project.novelSettings.targetPlatform || (isZh ? "未选平台" : "No platform")}</span>
              <span>{project.novelSettings.targetLanguage || (isZh ? "未选语言" : "No language")}</span>
            </div>
            <p>{project.idea || (isZh ? "还没有填写故事创意。" : "No story idea yet.")}</p>
            <button className="secondary-button full" type="button" onClick={() => setSettingsModalOpen(true)}>
              {isZh ? "编辑项目设定" : "Edit settings"}
            </button>
          </details>

          <div className="novel-step-list">
            {steps.map((step, index) => {
              const done = getStepContent(project, step.key).trim();
              return (
                <button
                  className={activeTask === step.key ? "novel-step-button active" : "novel-step-button"}
                  type="button"
                  key={step.key}
                  onClick={() => setActiveTask(step.key)}
                >
                  <span className="novel-step-number">{String(index + 1).padStart(2, "0")}</span>
                  <strong>{getStepLabel(step.key, isZh)}</strong>
                  <i>{done ? (isZh ? "已生成" : "Done") : (isZh ? "待生成" : "To generate")}</i>
                </button>
              );
            })}
          </div>
        </aside>

        <section className={mobilePanel === "editor" ? "dashboard-panel novel-editor-panel novel-chat-panel is-mobile-active" : "dashboard-panel novel-editor-panel novel-chat-panel"}>
          <div className="dashboard-panel-head">
            <div>
              <span>{isZh ? "创作对话" : "Development Chat"}</span>
              <h2>{isZh ? "先聊清楚，再生成文档" : "Talk first. Generate after."}</h2>
            </div>
            <div className="novel-chat-stage-pill">
              {getActionNumber(activeTask)} · {getStepLabel(activeTask, isZh)}
            </div>
          </div>

          <div className="novel-chat-thread" aria-live="polite">
            {chatMessages.map((message) => (
              <article className={`novel-chat-message ${message.role}`} key={message.id}>
                <span>{message.role === "user" ? (isZh ? "我" : "Me") : "Kiikis AI"}</span>
                <p>{message.content}</p>
              </article>
            ))}
          </div>

          <div className="novel-chat-composer">
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void sendChatMessage();
                }
              }}
              placeholder={isZh ? "像和助理聊天一样输入：故事想法、参考、修改意见、你不满意的地方、想继续追问的问题。⌘/Ctrl + Enter 发送。" : "Write like a conversation: raw idea, references, revision notes, doubts, or questions. Cmd/Ctrl + Enter to send."}
            />
            <div className="novel-chat-actions">
              <button className="secondary-button" type="button" onClick={() => void sendChatMessage()} disabled={!chatInput.trim() || chatGenerating}>
                <Send size={16} /> {chatGenerating ? (isZh ? "反馈中" : "Replying") : (isZh ? "发送想法" : "Send idea")}
              </button>
              <button className="primary-button" type="button" onClick={() => void generate(activeTask)} disabled={Boolean(generating) || Boolean(aiDisabledReason) || Boolean(activeBlockedReason) || (isChapterTask && activeChapter?.status === "locked")} title={activeBlockedReason || undefined}>
                <Sparkles size={16} /> {isZh ? "生成/更新当前阶段" : "Generate active stage"}
              </button>
              {nextTask ? (
                <button className="secondary-button" type="button" onClick={() => setActiveTask(nextTask)}>
                  {isZh ? "进入下一阶段" : "Next stage"} · {getStepShort(nextTask, isZh)}
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <aside className={mobilePanel === "ai" ? "dashboard-panel novel-ai-panel is-mobile-active" : "dashboard-panel novel-ai-panel"}>
          <div className="dashboard-panel-head">
            <div>
              <span>{completedCount}/{steps.length} {isZh ? "已完成" : "complete"}</span>
              <h2>{isZh ? "阶段预览" : "Stage preview"}</h2>
            </div>
            <div className="novel-editor-actions">
              {isChapterTask && activeChapter ? (
                <button className="icon-button subtle" type="button" onClick={toggleChapterLock} title={activeChapter.status === "locked" ? (isZh ? "解锁章节" : "Unlock chapter") : (isZh ? "锁定章节" : "Lock chapter")}>
                  {activeChapter.status === "locked" ? <Lock size={16} /> : <Unlock size={16} />}
                </button>
              ) : null}
              <BookOpen size={20} />
            </div>
          </div>

          <textarea
            className="novel-main-editor novel-stage-preview"
            value={activeContent}
            onChange={(event) => updateActiveContent(event.target.value)}
            placeholder={isZh ? "当前阶段生成内容会出现在这里。你可以手动编辑，也可以在中间对话框提出修改意见后重新生成。" : "The active stage output appears here. Edit manually, or request changes in chat and regenerate."}
          />

          {isChapterTask ? (
            <div className="novel-chapter-strip">
              <button className="novel-add-chapter-card" type="button" onClick={addChapter}>
                <Plus size={16} />
                <span>{isZh ? "新建章节" : "New chapter"}</span>
              </button>
              {(project.novelChapters.length ? project.novelChapters : []).map((chapter) => (
                <button className={activeChapter?.id === chapter.id ? "active" : ""} type="button" key={chapter.id} onClick={() => selectChapter(chapter.id)}>
                  <strong>#{chapter.chapterNo}</strong>
                  <span>{chapter.title}{chapter.status === "locked" ? (isZh ? " · 已锁定" : " · Locked") : ""}</span>
                  <i>{chapter.wordCount} {isZh ? "字" : "words"}</i>
                </button>
              ))}
              {!project.novelChapters.length ? (
                <div className="novel-empty-chapters">{isZh ? "生成小说正文后，会在这里形成章节/正文列表。" : "Generated manuscript sections will appear here."}</div>
              ) : null}
            </div>
          ) : null}

          {credits ? <small className="field-note">{isZh ? "剩余额度" : "Credits"}: {credits.balance}/{credits.monthlyLimit}</small> : null}
          {aiDisabledReason ? (
            <div className="notice warning novel-auth-notice">
              <span>{aiDisabledReason}</span>
              {!session ? (
                <button
                  className="kk-text-button"
                  type="button"
                  onClick={() => {
                    setAuthMode("signin");
                    setAuthOpen(true);
                  }}
                >
                  {isZh ? "登录" : "Sign in"}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="novel-current-action">
            <span>{isZh ? "当前步骤" : "Current step"}</span>
            <strong>{getActionNumber(activeTask)} · {getStepLabel(activeTask, isZh)}</strong>
            <p>{activeBlockedReason || (isZh ? "会综合左侧阶段、对话记录、当前预览内容和项目上下文生成。" : "Uses the active stage, chat notes, current preview, and project context.")}</p>
            <button className="primary-button full" type="button" onClick={() => void generate(activeTask)} disabled={Boolean(generating) || Boolean(aiDisabledReason) || Boolean(activeBlockedReason) || (isChapterTask && activeChapter?.status === "locked")} title={activeBlockedReason || undefined}>
              <Sparkles size={16} />
              {generating === activeTask ? (isZh ? "生成中" : "Generating") : getStepShort(activeTask, isZh)}
            </button>
          </div>

          <details className="novel-tool-section">
            <summary>{isZh ? "完整 AI 生成序列" : "Full AI generation sequence"}</summary>
            <div className="novel-action-sequence">
              {secondaryTasks.map((task) => {
                const blocked = getNovelTaskBlockedReason(task, project, activeChapter, revisionInstruction, isZh);
                const done = getStepContent(project, task).trim() || (task === "novel_chapter_draft" && activeChapter?.draft.trim()) || (task === "novel_chapter_outline" && activeChapter?.outline.trim());
                return (
                  <button
                    className="novel-action-button"
                    type="button"
                    key={task}
                    onClick={() => void generate(task)}
                    disabled={Boolean(generating) || Boolean(aiDisabledReason) || Boolean(blocked)}
                    title={blocked || undefined}
                  >
                    <span>{getActionNumber(task)}</span>
                    <strong>{getStepShort(task, isZh)}</strong>
                    <small>{blocked || (done ? (isZh ? "已生成，可重新生成" : "Done, can regenerate") : (isZh ? "可生成" : "Ready"))}</small>
                  </button>
                );
              })}
            </div>
          </details>

          <details className="novel-tool-section" open={isChapterTask}>
            <summary>{isZh ? "按指令修改章节" : "Revise Chapter"}</summary>
            <textarea
              value={revisionInstruction}
              onChange={(event) => setRevisionInstruction(event.target.value)}
              placeholder={isZh ? "例如：增强狼人男主的危险感，结尾改成身份暴露。" : "Example: make the Alpha lead more dangerous and end with identity exposure."}
            />
            <button className="primary-button full" type="button" onClick={() => void generate("novel_revision")} disabled={Boolean(generating) || Boolean(aiDisabledReason) || Boolean(getNovelTaskBlockedReason("novel_revision", project, activeChapter, revisionInstruction, isZh)) || activeChapter?.status === "locked"} title={getNovelTaskBlockedReason("novel_revision", project, activeChapter, revisionInstruction, isZh) || undefined}>
              <RefreshCcw size={16} /> {isZh ? "应用修改" : "Apply Revision"}
            </button>
          </details>

          <details className="novel-tool-section">
            <summary>{isZh ? "连续性与 Universe" : "Continuity & Universe"}</summary>
            <p>{latestChapter?.continuityNotes || project.novelContinuityNotes || (isZh ? "暂无连续性备注。" : "No continuity notes yet.")}</p>
            {project.universeId ? (
              <small className="field-note">Universe ID: {project.universeId}</small>
            ) : null}
            <button className="secondary-button full" type="button" onClick={() => void createAndLinkUniverse()} disabled={universeBusy || !session}>
              <Plus size={16} /> {isZh ? "创建并关联 Universe" : "Create and link Universe"}
            </button>
            {universes.length ? (
              <label>
                {isZh ? "关联已有 Universe" : "Link existing Universe"}
                <select value={selectedUniverseId} onChange={(event) => setSelectedUniverseId(event.target.value)}>
                  {universes.map((universe) => <option key={universe.id} value={universe.id}>{universe.name}</option>)}
                </select>
              </label>
            ) : null}
            <button className="secondary-button full" type="button" onClick={() => void linkExistingUniverse()} disabled={universeBusy || !session || !selectedUniverseId}>
              <Link2 size={16} /> {isZh ? "关联现有 Universe" : "Link Universe"}
            </button>
            <button className="secondary-button full" type="button" onClick={() => void sendUniverseInbox()} disabled={!session || !project.universeId}>
              <Send size={16} /> {isZh ? "发送 Universe Inbox" : "Send Universe Inbox"}
            </button>
          </details>

          <details className="novel-tool-section">
            <summary>{isZh ? "小说转剧本" : "Novel to Script"}</summary>
            <p>{isZh ? "把当前 Novel Brief、Bible、角色和章节沉淀为剧本创作项目输入。" : "Create a script project from this novel's brief, bible, characters, and chapters."}</p>
            <button className="primary-button full" type="button" onClick={() => void createScriptProjectFromNovel()} disabled={!session}>
              <BookOpen size={16} /> {isZh ? "创建剧本项目" : "Create script project"}
            </button>
          </details>
        </aside>
      </section>
      {settingsModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal wizard-modal novel-settings-modal">
            <h2>{isZh ? "小说项目设定" : "Novel project settings"}</h2>
            <p className="subtle">
              {isZh ? "先确定类型、平台、语言和故事创意。进入工作台后，这些设定会收起到左侧项目设定菜单里。" : "Set the type, platform, language, and story idea first. These settings collapse into the left project menu inside the workbench."}
            </p>
            {renderSettingsFields()}
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setSettingsModalOpen(false)}>
                {isZh ? "稍后再填" : "Later"}
              </button>
              <button className="primary-button" type="button" onClick={() => setSettingsModalOpen(false)}>
                {isZh ? "进入创作" : "Start writing"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <AuthModal open={authOpen} mode={authMode} onClose={() => setAuthOpen(false)} />
    </main>
  );
}

function getStepLabel(taskType: TaskType, isZh: boolean) {
  return isZh ? stepCopy[taskType].zh : stepCopy[taskType].en;
}

function getStepShort(taskType: TaskType, isZh: boolean) {
  return isZh ? stepCopy[taskType].shortZh : stepCopy[taskType].shortEn;
}

function getActionNumber(taskType: TaskType) {
  const index = novelActionTasks.indexOf(taskType);
  return index >= 0 ? String(index + 1).padStart(2, "0") : "--";
}

function getNovelTaskBlockedReason(
  taskType: TaskType,
  project: DramaProject,
  activeChapter: NovelChapter | null,
  revisionInstruction: string,
  isZh: boolean,
) {
  const ideaReady = Boolean(project.idea.trim() || project.novelBrief.trim());
  const chapterOutline = activeChapter?.outline || project.novelChapterOutline;
  const chapterDraft = activeChapter?.draft || project.novelChapterDraft;

  if (taskType === "novel_bible" && !ideaReady) {
    return isZh ? "请先填写故事创意或生成小说 Brief。" : "Add a story idea or generate the novel brief first.";
  }
  if (taskType === "novel_characters" && !project.novelBible.trim() && !project.novelBrief.trim()) {
    return isZh ? "请先生成 Bible 或 Brief，再生成角色卡。" : "Generate the bible or brief before cast cards.";
  }
  if (taskType === "novel_volume_outline" && !project.novelBible.trim()) {
    return isZh ? "请先生成小说 Bible，再生成分卷大纲。" : "Generate the novel bible before the volume outline.";
  }
  if (taskType === "novel_chapter_outline" && !project.novelVolumeOutline.trim()) {
    return isZh ? "请先生成分卷大纲，再生成章节大纲。" : "Generate the volume outline before chapter outlines.";
  }
  if (taskType === "novel_chapter_draft" && !chapterOutline.trim() && !project.novelBible.trim() && !project.novelCharacters.trim()) {
    return isZh ? "请先生成小说世界观及大纲，或填写正文大纲。" : "Generate the world outline or write a manuscript outline first.";
  }
  if (taskType === "translation" && !chapterDraft.trim() && !project.novelChapterDraft.trim()) {
    return isZh ? "请先生成或填写小说正文。" : "Generate or write the manuscript first.";
  }
  if (taskType === "localization" && !project.translation.trim() && !chapterDraft.trim() && !project.novelChapterDraft.trim()) {
    return isZh ? "请先生成小说译文，或至少填写小说正文。" : "Generate the translation, or at least write the manuscript first.";
  }
  if (taskType === "novel_revision") {
    if (!chapterDraft.trim()) return isZh ? "请先生成或填写章节正文。" : "Generate or write the chapter draft first.";
    if (!revisionInstruction.trim()) return isZh ? "请先输入修改指令。" : "Enter revision instructions first.";
  }
  if (taskType === "novel_export") {
    const hasAnyNovelContent = [
      project.novelBrief,
      project.novelBible,
      project.novelCharacters,
      project.novelVolumeOutline,
      project.novelChapterOutline,
      project.novelChapterDraft,
      project.translation,
      project.localization,
    ].some((value) => value.trim());
    if (!hasAnyNovelContent) return isZh ? "请先生成至少一个小说模块。" : "Generate at least one novel module first.";
  }
  return "";
}

function getActiveNovelContent(project: DramaProject, taskType: TaskType, activeChapter: NovelChapter | null) {
  if (taskType === "novel_chapter_outline") return activeChapter?.outline || project.novelChapterOutline || "";
  if (taskType === "novel_chapter_draft" || taskType === "novel_revision") return activeChapter?.draft || project.novelChapterDraft || "";
  return getStepContent(project, taskType);
}

function createBlankChapter(chapterNo: number): NovelChapter {
  const now = new Date().toISOString();
  return {
    id: `novel-chapter-${crypto.randomUUID()}`,
    chapterNo,
    title: `第 ${chapterNo} 章`,
    outline: "",
    draft: "",
    endingHook: "",
    pov: "",
    wordCount: 0,
    continuityNotes: "",
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

function applyGeneratedOutput(project: DramaProject, taskType: TaskType, output: string, activeChapter: NovelChapter | null): DramaProject {
  if (taskType === "novel_export") {
    return {
      ...setStepContent(project, taskType, buildCompleteNovelDownload(project, output)),
      updatedAt: new Date().toISOString(),
    };
  }

  if (taskType !== "novel_chapter_outline" && taskType !== "novel_chapter_draft" && taskType !== "novel_revision") {
    return setStepContent(project, taskType, output);
  }

  const now = new Date().toISOString();
  const parsed = parseChapterOutput(output);
  const chapters = project.novelChapters.length ? [...project.novelChapters] : [createBlankChapter(1)];
  const targetIndex = activeChapter
    ? Math.max(0, chapters.findIndex((chapter) => chapter.id === activeChapter.id))
    : chapters.length - 1;
  const base = chapters[targetIndex] || createBlankChapter(chapters.length + 1);
  const nextChapter: NovelChapter = {
    ...base,
    title: parsed.title || base.title,
    outline: parsed.outline || (taskType === "novel_chapter_outline" ? output : base.outline),
    draft: parsed.draft || (taskType === "novel_chapter_draft" || taskType === "novel_revision" ? output : base.draft),
    endingHook: parsed.endingHook || base.endingHook,
    continuityNotes: parsed.continuityNotes || base.continuityNotes,
    wordCount: countNovelWords(parsed.draft || (taskType === "novel_chapter_draft" || taskType === "novel_revision" ? output : base.draft)),
    updatedAt: now,
  };

  chapters[targetIndex] = nextChapter;

  return {
    ...project,
    novelChapterOutline: nextChapter.outline,
    novelChapterDraft: nextChapter.draft,
    novelContinuityNotes: nextChapter.continuityNotes,
    novelChapters: chapters,
    updatedAt: now,
  };
}

function parseChapterOutput(output: string) {
  return {
    title: pickDelimitedSection(output, "CHAPTER_TITLE").split("\n")[0]?.trim() || "",
    outline: pickDelimitedSection(output, "CHAPTER_OUTLINE"),
    draft: pickDelimitedSection(output, "CHAPTER_DRAFT"),
    endingHook: pickDelimitedSection(output, "ENDING_HOOK"),
    continuityNotes: pickDelimitedSection(output, "CONTINUITY_NOTES"),
  };
}

function pickDelimitedSection(content: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`---${escaped}---\\s*([\\s\\S]*?)(?=\\n---[A-Z_]+---|$)`, "i"));
  return match?.[1]?.trim() || "";
}

function countNovelWords(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const cjkCount = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length;
  const wordCount = (trimmed.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || []).length;
  return cjkCount + wordCount;
}

function buildCompleteNovelDownload(project: DramaProject, aiExportNotes = "") {
  const chapters = project.novelChapters.length
    ? project.novelChapters
    : project.novelChapterDraft.trim()
      ? [{
          id: "legacy-chapter",
          chapterNo: 1,
          title: "第 1 章",
          outline: project.novelChapterOutline,
          draft: project.novelChapterDraft,
          endingHook: "",
          pov: "",
          wordCount: countNovelWords(project.novelChapterDraft),
          continuityNotes: project.novelContinuityNotes,
          status: "draft" as const,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        }]
      : [];

  const manuscript = chapters
    .filter((chapter) => chapter.draft.trim() || chapter.outline.trim())
    .map((chapter) => [
      `## 第 ${chapter.chapterNo} 章 ${chapter.title.replace(/^第\s*\d+\s*章\s*/, "").trim() || ""}`.trim(),
      "",
      chapter.draft.trim() || `【待扩写】\n${chapter.outline.trim()}`,
      chapter.endingHook.trim() ? `\n\n> 结尾钩子：${chapter.endingHook.trim()}` : "",
    ].join("\n"))
    .join("\n\n");

  return [
    `# ${project.title || "未命名小说"}`,
    "",
    "## 完整小说正文",
    "",
    manuscript || project.novelChapterDraft || "还没有生成章节正文。请先生成章节大纲和章节正文，再导出完整小说。",
    "",
    "---",
    "",
    "## 创作附录",
    "",
    "### 小说 Brief",
    project.novelBrief || project.idea || "未生成",
    "",
    "### 小说 Bible",
    project.novelBible || "未生成",
    "",
    "### 角色卡",
    project.novelCharacters || "未生成",
    "",
    "### 分卷大纲",
    project.novelVolumeOutline || "未生成",
    "",
    "### 小说译文",
    project.translation || "未生成",
    "",
    "### 本土化及雷同查验",
    project.localization || "未生成",
    "",
    "### 连续性备注",
    chapters.map((chapter) => [
      `第 ${chapter.chapterNo} 章 ${chapter.title}`,
      chapter.outline ? `大纲：${chapter.outline}` : "",
      chapter.continuityNotes ? `连续性：${chapter.continuityNotes}` : "",
    ].filter(Boolean).join("\n")).filter(Boolean).join("\n\n") || project.novelContinuityNotes || "未生成",
    aiExportNotes.trim() ? ["", "### AI 导出建议", aiExportNotes.trim()].join("\n") : "",
  ].filter(Boolean).join("\n");
}

function buildScriptAdaptationBrief(project: DramaProject) {
  return [
    `改编来源：小说项目《${project.title}》`,
    "",
    "## 小说 Brief",
    project.novelBrief || project.idea || "未填写",
    "",
    "## 创作沟通记录",
    project.novelDevelopmentNotes || "未记录",
    "",
    "## 小说 Bible",
    project.novelBible || "未生成",
    "",
    "## 角色卡",
    project.novelCharacters || "未生成",
    "",
    "## 分卷大纲",
    project.novelVolumeOutline || "未生成",
    "",
    "## 可改编章节",
    project.novelChapters.map((chapter) => `### 第 ${chapter.chapterNo} 章 ${chapter.title}\n${chapter.outline || chapter.draft || ""}`).join("\n\n") || project.novelChapterDraft || "未生成",
    "",
    "## 改编要求",
    "请将长篇小说结构改写为竖屏短剧/漫剧剧本输入，保留高冲突场景、身份秘密、情绪钩子和 Universe canon。",
  ].join("\n");
}

function buildTaskInput(project: DramaProject, taskType: TaskType, revisionInstruction: string, activeChapter: NovelChapter | null) {
  if (taskType === "novel_development_chat") {
    return project.novelDevelopmentNotes || project.idea;
  }

  if (taskType === "novel_revision") {
    return [
      "【修改指令】",
      revisionInstruction,
      "",
      "【当前章节】",
      activeChapter?.draft || project.novelChapterDraft || "",
    ].join("\n");
  }

  if (taskType === "novel_chapter_draft") {
    return [
      activeChapter?.outline || project.novelChapterOutline || "",
      project.novelBible ? `【小说世界观及大纲】\n${project.novelBible}` : "",
      project.novelCharacters ? `【角色 Bible】\n${project.novelCharacters}` : "",
      project.novelDevelopmentNotes ? `【创作沟通记录】\n${project.novelDevelopmentNotes}` : "",
      project.novelBrief || project.idea,
    ].filter(Boolean).join("\n\n");
  }

  if (taskType === "novel_chapter_outline") {
    return project.novelVolumeOutline || project.novelBrief || project.idea;
  }

  if (taskType === "translation") {
    return buildNovelManuscriptText(project, activeChapter) || project.novelChapterDraft || project.idea;
  }

  if (taskType === "localization") {
    return project.translation || buildNovelManuscriptText(project, activeChapter) || project.novelChapterDraft || project.idea;
  }

  return getStepContent(project, taskType) || project.idea;
}

function buildNovelContext(project: DramaProject, activeChapter: NovelChapter | null) {
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
    project.novelDevelopmentNotes ? `创作沟通记录：\n${project.novelDevelopmentNotes}` : "",
    project.novelBrief ? `小说背景：\n${project.novelBrief}` : "",
    project.novelBible ? `小说 Bible：\n${project.novelBible}` : "",
    project.novelCharacters ? `角色卡：\n${project.novelCharacters}` : "",
    project.novelVolumeOutline ? `分卷大纲：\n${project.novelVolumeOutline}` : "",
    activeChapter ? `当前章节：第 ${activeChapter.chapterNo} 章 ${activeChapter.title}\n${activeChapter.outline}\n${activeChapter.continuityNotes}` : "",
    latestChapter ? `上一章：第 ${latestChapter.chapterNo} 章 ${latestChapter.title}\n${latestChapter.continuityNotes || latestChapter.endingHook}` : "",
  ].filter(Boolean).join("\n\n");
}

function buildNovelAllSteps(project: DramaProject): Partial<Record<TaskType, string>> {
  return {
    novel_development_chat: project.novelDevelopmentNotes,
    novel_brief: project.novelBrief,
    novel_bible: project.novelBible,
    novel_characters: project.novelCharacters,
    novel_chapter_draft: project.novelChapterDraft,
    translation: project.translation,
    localization: project.localization,
    novel_export: project.deliveryPackage,
  };
}

function buildNovelChatContext(project: DramaProject, activeChapter: NovelChapter | null, activeTask: TaskType, messages: ChatMessage[]) {
  const recentChat = messages.slice(-8).map((message) => `${message.role === "user" ? "USER" : "AI"}：${message.content}`).join("\n\n");
  return [
    `当前阶段：${taskNamesSafe(activeTask)}`,
    recentChat ? `最近对话：\n${recentChat}` : "",
    buildNovelContext(project, activeChapter),
  ].filter(Boolean).join("\n\n");
}

function buildNovelManuscriptText(project: DramaProject, activeChapter: NovelChapter | null) {
  const chapters = project.novelChapters.length ? project.novelChapters : activeChapter ? [activeChapter] : [];
  const chapterText = chapters
    .filter((chapter) => chapter.draft.trim())
    .map((chapter) => `## 第 ${chapter.chapterNo} 章 ${chapter.title}\n\n${chapter.draft}`)
    .join("\n\n");
  return chapterText || activeChapter?.draft || project.novelChapterDraft || "";
}

function appendDevelopmentNotes(current: string, role: "USER" | "AI", content: string) {
  const stamp = new Date().toLocaleString("zh-CN", { hour12: false });
  return [current.trim(), `## ${stamp} ${role}`, content.trim()].filter(Boolean).join("\n\n").slice(-24000);
}

function taskNamesSafe(taskType: TaskType) {
  return stepCopy[taskType]?.zh || taskType;
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
