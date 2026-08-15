"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Download,
  FileArchive,
  FileText,
  GripVertical,
  Link2,
  Lock,
  Maximize2,
  Minimize2,
  Palette,
  PanelRight,
  Plus,
  Replace,
  Search,
  Send,
  Sparkles,
  Type,
  Upload,
  X,
} from "lucide-react";
import { AuthModal } from "@/components/layout/AuthModal";
import { ChatFocusFrame } from "@/components/creation/ChatFocusFrame";
import { readByoApiConfig } from "@/lib/ai/byoClient";
import type { TaskType } from "@/lib/ai/prompts";
import { buildDeliveryManifest, type AssembledDocument } from "@/lib/creation/assembly";
import { downloadDeliveryZip, downloadDocx, downloadMarkdown } from "@/lib/creation/downloads";
import { applyUnitGeneration, parseArcStructure, parseBatchUnitOutput, parseEpisodePlanOutput, parseScreenplayUnitOutput } from "@/lib/creation/parsers";
import { buildTranslationSource } from "@/lib/creation/screenplay";
import {
  addScene,
  addSceneBlock,
  applyScreenplayToUnit,
  applyUnitTranslation,
  appendPreviewScene,
  canEnterProduction,
  canCreateUnit,
  canGenerateEpisodePlan,
  canGenerateScript,
  createCreationWorkspace,
  deleteScene,
  deleteSceneBlock,
  draftScene,
  finalizeDocument,
  finalizeEpisodePlan,
  finalizeUnit,
  finalizeScene,
  normalizeCreationWorkspace,
  recordCreationPosition,
  reorderScenes,
  setEpisodePlan,
  updateDocument,
  updateSceneBlock,
  unfinalizeDocument,
  unfinalizeEpisodePlan,
  unfinalizeUnit,
} from "@/lib/creation/state";
import type {
  CreationMode,
  CreationStatus,
  CreationUnit,
  CreationView,
  CreationWorkspaceV2,
  EpisodePlan,
  EpisodePlanItem,
  ScreenplayBlock,
  ScreenplayFormat,
  ScreenplayScene,
  ScreenplayEpisode,
} from "@/lib/creation/types";
import { buildCreativeHandoffPackage, writeCreativeHandoff } from "@/lib/creative-handoff";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  DEFAULT_PROJECT_GROUP,
  createNovelProject,
  readProjectsFromStorage,
  upsertProject,
  type CreationChatMessage,
  type DramaProject,
  type NovelChapter,
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

type StageKey = "background" | "characters" | "outline" | "manuscript" | "translation" | "localization" | "export";
/** PRD V1.0 §8：左侧目录主导航，决定中央编辑器展示内容 */
type ViewKey = "background" | "characters" | "outline" | "episodePlan" | "unit" | "export";
type MobilePanel = "chat" | "content";
type ChatMessage = CreationChatMessage;
type SourceFile = { id: string; name: string; text: string };
type LocalizationView = "content" | "changes" | "similarity";

// 修复（2026-07-24）：角色圣经等创作文档任务输出长，后端 CREATION_DOC_TIMEOUT_MS=180s。
// 其中“大纲 / 分集规划 / 长正文”在生产里可跑到 280s+，因此单独给 300s 级的前端窗口。
const DEFAULT_AI_TIMEOUT = 240_000;
const LONG_FORM_AI_TIMEOUT = 310_000;
const LANGUAGE_OPTIONS = ["中文", "English", "Español", "Français", "Italiano", "日本語", "한국어"];
const STAGES: Array<{ key: StageKey; zh: string; en: string; task?: TaskType }> = [
  { key: "background", zh: "背景及世界观", en: "Background & World", task: "creation_background_world" },
  { key: "characters", zh: "角色圣经", en: "Character Bible", task: "creation_character_bible" },
  { key: "outline", zh: "剧情及大纲", en: "Plot & Outline", task: "creation_plot_outline" },
  { key: "manuscript", zh: "正文", en: "Manuscript" },
  { key: "translation", zh: "翻译", en: "Translation", task: "creation_translate_unit" },
  { key: "localization", zh: "本土化及雷同查验", en: "Localization & Similarity", task: "creation_localize_unit" },
  { key: "export", zh: "导出", en: "Export" },
];

function getAiTimeoutMs(taskType: TaskType) {
  if (
    taskType === "creation_background_world"
    || taskType === "creation_character_bible"
    || taskType === "creation_plot_outline"
    || taskType === "creation_episode_plan"
    || taskType === "creation_novel_unit"
    || taskType === "creation_screenplay_unit"
  ) {
    return LONG_FORM_AI_TIMEOUT;
  }
  return DEFAULT_AI_TIMEOUT;
}

function welcome(isZh: boolean) {
  return isZh
    ? "尊敬的创作者大人，我是您的创作助理 KK。在开始前，请告诉我：想创作什么题材、发布平台、作品语言、目标读者，以及是否已有名字。也可以直接上传剧本、背景设定或角色资料，我们一起从背景及世界观开始。"
    : "Dear creator, I am KK, your creation assistant. Tell me the genre, publishing platform, work language, target audience, and whether you have a title. You can also upload a script, world brief, or character notes, and we will begin with Background & World.";
}

function message(role: ChatMessage["role"], content: string, id = crypto.randomUUID()): ChatMessage {
  return { id, role, content, createdAt: new Date().toISOString() };
}

function parseLegacyChatHistory(notes: string): ChatMessage[] {
  return notes
    .split(/^##\s+/m)
    .slice(1)
    .flatMap((entry, index) => {
      const lineBreak = entry.indexOf("\n");
      if (lineBreak < 0) return [];
      const header = entry.slice(0, lineBreak).trim();
      const match = header.match(/^(.*?)\s+(USER|AI)$/);
      const content = entry.slice(lineBreak + 1).trim();
      if (!match || !content) return [];
      return [{
        id: `legacy-chat-${index}-${match[2].toLowerCase()}`,
        role: match[2] === "USER" ? "user" : "assistant",
        content,
        createdAt: match[1],
      }];
    });
}

function readChatHistory(project: DramaProject, isZh: boolean) {
  if (project.creationChatHistory?.length) return project.creationChatHistory;
  const legacyHistory = parseLegacyChatHistory(project.novelDevelopmentNotes);
  return legacyHistory.length ? legacyHistory : [message("assistant", welcome(isZh), "welcome")];
}

function hasSameChatHistory(left: ChatMessage[] | undefined, right: ChatMessage[]) {
  return left?.length === right.length && left.every((item, index) => {
    const candidate = right[index];
    return item.id === candidate.id && item.role === candidate.role && item.content === candidate.content && item.createdAt === candidate.createdAt;
  });
}

function isDefaultWelcomeHistory(history: ChatMessage[]) {
  return history.length === 1 && history[0]?.id === "welcome";
}

function createUnit(mode: CreationMode, number: number, id = `${mode}-unit-${number}`): CreationUnit {
  const now = new Date().toISOString();
  return {
    id,
    number,
    title: mode === "novel" ? `Chapter ${number}` : `Episode ${number}`,
    outline: "",
    content: "",
    screenplay: null,
    continuityNotes: "",
    status: "draft",
    versions: [],
    translation: "",
    localizedContent: "",
    localizationChanges: "",
    similarityReport: "",
    createdAt: now,
    updatedAt: now,
  };
}

function ensureProject(project: DramaProject): DramaProject {
  return { ...project, creationWorkspace: normalizeCreationWorkspace(project.creationWorkspace, project) };
}

function unitHasManuscript(unit: CreationUnit) {
  return Boolean(unit.content.trim() || unit.screenplay?.scenes.some((scene) => scene.blocks.some((block) => block.text.trim())));
}

function latestManuscriptPosition(workspace: CreationWorkspaceV2) {
  const candidates = (["novel", "screenplay"] as const).flatMap((mode) => workspace[mode].units
    .filter(unitHasManuscript)
    .map((unit) => ({ mode, unit })));
  candidates.sort((left, right) => new Date(right.unit.updatedAt).getTime() - new Date(left.unit.updatedAt).getTime());
  return candidates[0] || null;
}

function freshProject() {
  return ensureProject(createNovelProject({
    title: "未命名创作项目",
    projectGroup: DEFAULT_PROJECT_GROUP,
    market: "",
    genre: "",
    targetLanguage: "",
    novelSettings: {
      type: "",
      targetPlatform: "",
      targetLanguage: "",
      targetWordCount: 0,
      serializationFrequency: "",
      targetReader: "",
      retentionHook: "",
    },
  }));
}

function syncLegacy(project: DramaProject, workspace: CreationWorkspaceV2): DramaProject {
  const novelChapters: NovelChapter[] = workspace.novel.units.map((unit) => ({
    id: unit.id,
    chapterNo: unit.number,
    title: unit.title,
    outline: unit.outline,
    draft: unit.content,
    endingHook: "",
    pov: "",
    wordCount: unit.content.trim().split(/\s+/).filter(Boolean).length,
    continuityNotes: unit.continuityNotes,
    status: unit.status === "finalized" ? "locked" : unit.status,
    createdAt: unit.createdAt,
    updatedAt: unit.updatedAt,
  }));
  return {
    ...project,
    creationWorkspace: workspace,
    novelBrief: workspace.documents.backgroundWorld.content,
    novelCharacters: workspace.documents.characterBible.content,
    novelBible: workspace.documents.plotOutline.content,
    novelChapters,
    novelChapterDraft: novelChapters.at(-1)?.draft || project.novelChapterDraft,
    novelContinuityNotes: novelChapters.at(-1)?.continuityNotes || project.novelContinuityNotes,
    updatedAt: new Date().toISOString(),
  };
}

function parseLocalization(output: string) {
  // 容错正则：允许标记前后有空白/markdown 装饰（###、**、空格等）
  // 匹配模式：(可选装饰) ---KEY--- (可选空格) 捕获内容 (直到下一个标记或结尾)
  const pick = (key: string) => {
    // 先尝试严格格式 ---KEY---
    let match = output.match(new RegExp(`---${key}---\\s*([\\s\\S]*?)(?=\\n---[A-Z_]+---|$)`, "i"));
    if (match) return match[1].trim();
    // 回退：允许 markdown 装饰（### ---KEY---、**---KEY---**、--- KEY --- 等）
    match = output.match(new RegExp(`(?:^|\\n)[#*>\\s]*---\\s*${key}\\s*---[#*>\\s]*\\n([\\s\\S]*?)(?=\\n[#*>\\s]*---[\\s]*[A-Z_]+[\\s]*---|$)`, "i"));
    return match?.[1]?.trim() || "";
  };
  return {
    localizedContent: pick("LOCALIZED_CONTENT"),
    localizationChanges: pick("LOCALIZATION_CHANGES"),
    similarityReport: pick("SIMILARITY_REPORT"),
  };
}

function appendNotes(current: string, role: "USER" | "AI", content: string) {
  return [current.trim(), `## ${new Date().toLocaleString("zh-CN", { hour12: false })} ${role}`, content.trim()]
    .filter(Boolean)
    .join("\n\n")
    .slice(-30000);
}

// PRD V1.0 验收 第三批/P1-05：创作基座文档结构化字段模板（点击插入 markdown 标题到光标处）
const DOC_FIELD_TEMPLATES: Record<"background" | "characters" | "outline", Array<{ zh: string; en: string }>> = {
  background: [
    { zh: "题材", en: "Genre" },
    { zh: "发布平台", en: "Platform" },
    { zh: "世界观", en: "World" },
    { zh: "时代背景", en: "Era" },
    { zh: "主角设定", en: "Protagonist" },
    { zh: "反派设定", en: "Antagonist" },
    { zh: "核心冲突", en: "Core conflict" },
    { zh: "情绪基调", en: "Tone" },
  ],
  characters: [
    { zh: "主角·身份", en: "Protagonist·Identity" },
    { zh: "主角·目标", en: "Protagonist·Goal" },
    { zh: "主角·弱点", en: "Protagonist·Flaw" },
    { zh: "主角·秘密", en: "Protagonist·Secret" },
    { zh: "主角·成长弧线", en: "Protagonist·Arc" },
    { zh: "反派设定", en: "Antagonist" },
    { zh: "关键配角", en: "Key supporting" },
  ],
  outline: [
    { zh: "第一幕·开篇", en: "Act 1·Opening" },
    { zh: "第二幕·发展", en: "Act 2·Development" },
    { zh: "第三幕·高潮结局", en: "Act 3·Climax" },
    { zh: "12 集大纲要点", en: "12-episode beats" },
  ],
};

export function CreationWorkbench() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [project, setProject] = useState<DramaProject>(() => freshProject());
  const [projectReady, setProjectReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [activeUnitId, setActiveUnitId] = useState("");
  const [activeArcId, setActiveArcId] = useState("");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([message("assistant", welcome(true), "welcome")]);
  const [chatProjectId, setChatProjectId] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [localizationView, setLocalizationView] = useState<LocalizationView>("content");
  const [authOpen, setAuthOpen] = useState(false);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [selectedUniverseId, setSelectedUniverseId] = useState("");
  const [universeBusy, setUniverseBusy] = useState(false);
  const sourceInput = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const docEditorRef = useRef<HTMLTextAreaElement>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollMemory = useRef<Record<string, number>>({});

  // PRD V1.0 §8：左侧目录主导航 + AI 面板默认收起
  const [view, setView] = useState<ViewKey>("background");
  // PRD V1.0 验收 P0-02：AI 面板默认策略 — 新项目/创作基座阶段默认展开，正文阶段默认收起
  // 用 useEffect 按阶段智能设置初始值，避免全局固定 true 干扰正文写作
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const aiPanelInitedRef = useRef(false);
  const [unitSubMode, setUnitSubMode] = useState<"manuscript" | "translation" | "localization">("manuscript");
  // PRD V1.0 验收 P1-04：小白主路径隐藏高级功能 — 翻译/本土化收进「更多工具」
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);

  // PRD V1.0 §8.3：左侧集场目录 — 展开/搜索/收起/当前场高亮
  const [expandedUnits, setExpandedUnits] = useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSceneId, setActiveSceneId] = useState("");

  // PRD V1.0 §8.5：AI 输入作用范围（整集/当前场/选中文字；创作基座阶段：当前阶段/全部资料）
  // PRD V1.0 §8.5 / 验收 P1-03 + R-03：AI 输入作用范围按阶段切换
  // 创作基座（background/characters/outline）→ Stage / Materials
  // 分集规划（episodePlan）→ Plan / Materials（此时尚无集场，不应显示 Episode/Scene/Selection）
  // 正文（unit）→ Episode / Scene / Selection
  const [aiScope, setAiScope] = useState<"episode" | "scene" | "selection" | "stage" | "materials" | "plan">("episode");

  // PRD V1.0 §8.5：AI 修改预览后应用
  const [pendingPreview, setPendingPreview] = useState<null | {
    kind: "newScene" | "modifyScene" | "episodeScript";
    scene?: ScreenplayScene;
    sceneId?: string;
    originalText?: string;
    proposedText?: string;
    screenplay?: ScreenplayEpisode;
  }>(null);

  // PRD V1.0 §7.2：上传资料理解摘要
  const [sourceComprehension, setSourceComprehension] = useState<null | {
    summary: string;
    confirmed: boolean;
  }>(null);

  // PRD V1.0 §8.2/§11.2：保存状态三态 + 顶部栏状态
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // PRD V1.0 §8.5：专注写作模式（P1 预留，P0 已支持收起侧栏）
  const [focusMode, setFocusMode] = useState(false);

  // PRD V1.0 §11.3：多集批量导出选择
  const [exportSelection, setExportSelection] = useState<Record<string, boolean>>({});

  // PRD V1.0 §8.5：AI 生成中的预览草稿（不直接覆盖）
  const [pendingGeneration, setPendingGeneration] = useState<null | {
    taskType: TaskType;
    output: string;
    target: "doc" | "unit" | "scene";
    docKey?: keyof CreationWorkspaceV2["documents"];
  }>(null);

  // P1-A：小说版卷（arc）展开
  const [expandedArcs, setExpandedArcs] = useState<Record<string, boolean>>({});
  // P1-B：整集搜索与替换
  const [searchReplaceOpen, setSearchReplaceOpen] = useState(false);
  const [searchFind, setSearchFind] = useState("");
  const [searchReplaceText, setSearchReplaceText] = useState("");
  // P1-D：剧本格式检查结果
  const [formatIssues, setFormatIssues] = useState<Array<{ sceneId: string; sceneNo: number; level: "error" | "warn" | "muted"; message: string }>>([]);
  // P1-F：多场批量选择
  const [selectedScenes, setSelectedScenes] = useState<Record<string, boolean>>({});

  const workspace = project.creationWorkspace || createCreationWorkspace(project);
  const mode = workspace.settings.activeMode;
  const track = workspace[mode];
  const activeUnit = track.units.find((unit) => unit.id === activeUnitId) || track.units[0] || null;
  const activeArc = track.arcs.find((arc) => arc.id === activeArcId) || track.arcs[0] || null;
  const deliveryItems = useMemo(() => buildDeliveryManifest({ title: project.title }, workspace), [project.title, workspace]);

  // PRD V1.0 §7.3：创作基座严格顺序 — 每步定稿后才能进入下一步
  const bgFinalized = workspace.documents.backgroundWorld.status === "finalized";
  const charFinalized = workspace.documents.characterBible.status === "finalized";
  const outlineFinalized = workspace.documents.plotOutline.status === "finalized";
  const planFinalized = track.episodePlan?.status === "finalized";

  const productionGate = canEnterProduction(workspace, activeUnit?.id);

  // PRD V1.0 验收 P1-03 + R-03：view 变化时自动重置 aiScope 到对应阶段默认值
  useEffect(() => {
    if (view === "background" || view === "characters" || view === "outline") {
      setAiScope((prev) => (prev === "stage" || prev === "materials" ? prev : "stage"));
    } else if (view === "episodePlan") {
      setAiScope((prev) => (prev === "plan" || prev === "materials" ? prev : "plan"));
    } else if (view === "unit") {
      setAiScope((prev) => (prev === "episode" || prev === "scene" || prev === "selection" ? prev : "episode"));
    }
  }, [view]);
  // 创作基座未全部定稿（背景/角色/大纲阶段）→ 默认展开 AI（小白需要 AI 引导）
  // 进入正文阶段（view=unit/episodePlan）→ 默认收起 AI（专注写作）
  // 用户手动开关后不再自动覆盖（aiPanelInitedRef 一次性）
  useEffect(() => {
    if (aiPanelInitedRef.current) return;
    if (!projectReady) return;
    // 等项目真实加载后再判断（避免 freshProject 占位态误判）
    if (!project.id || project.id.startsWith("draft-")) return;
    aiPanelInitedRef.current = true;
    const inFoundation = !outlineFinalized || view === "background" || view === "characters" || view === "outline";
    setAiPanelOpen(inFoundation);
  }, [project.id, outlineFinalized, projectReady, view]);

  useEffect(() => {
    setMessages((current) => current.map((item) => item.id === "welcome" ? message("assistant", welcome(isZh), "welcome") : item));
  }, [isZh]);

  useEffect(() => {
    if (!projectReady || !project.id || chatProjectId === project.id) return;
    setMessages(readChatHistory(project, isZh));
    setChatProjectId(project.id);
  }, [chatProjectId, isZh, project, projectReady]);

  useEffect(() => {
    if (!projectReady || !project.id || chatProjectId !== project.id || hasSameChatHistory(projectRef.current.creationChatHistory, messages)) return;
    if (isDefaultWelcomeHistory(messages)) return;
    const nextProject = { ...projectRef.current, creationChatHistory: messages, updatedAt: new Date().toISOString() };
    projectRef.current = nextProject;
    setProject(nextProject);
    ensureProjectPersisted(nextProject);
    if (session?.access_token) void upsertProjectToSupabase(nextProject, { accessToken: session.access_token }).catch(() => undefined);
  }, [chatProjectId, messages, project.id, projectReady, session?.access_token]);

  // PRD V1.0 验收 P1-07：导出页默认只勾选定稿单元（首次进入导出视图或单元集合变化时初始化）
  const exportSelectionInit = useRef(false);
  useEffect(() => {
    if (view !== "export" || exportSelectionInit.current) return;
    exportSelectionInit.current = true;
    const defaults: Record<string, boolean> = {};
    for (const u of track.units) defaults[u.id] = u.status === "finalized";
    setExportSelection(defaults);
  }, [view, track.units]);

  // 单元集合变化时（新增/删除/切换 mode）重置初始化标志，允许下次重新计算默认值
  useEffect(() => {
    exportSelectionInit.current = false;
  }, [mode, track.units.length]);

  // 任务 3：制作工作台 → 创作工作台 定位到 sourceUnitId 对应单元（携带上下文）
  const focusUnitBySourceId = (target: DramaProject, sourceUnitId: string | null) => {
    if (!sourceUnitId) return;
    const ws = target.creationWorkspace || createCreationWorkspace(target);
    const inScreenplay = ws.screenplay.units.some((u) => u.id === sourceUnitId);
    const inNovel = ws.novel.units.some((u) => u.id === sourceUnitId);
    if (!inScreenplay && !inNovel) return;
    const currentMode = ws.settings.activeMode;
    if (inScreenplay && currentMode !== "screenplay") {
      setMode("screenplay");
    } else if (inNovel && currentMode !== "novel") {
      setMode("novel");
    }
    // setMode 内部会清空 activeUnitId，需在 microtask 中恢复到目标 unit
    queueMicrotask(() => setActiveUnitId(sourceUnitId));
  };

  function restoreProjectPosition(target: DramaProject, sourceUnitId: string | null = null) {
    const ws = target.creationWorkspace || createCreationWorkspace(target);
    const savedMode = ws.settings.lastMode;
    const savedUnitId = ws.settings.lastUnitId;
    const explicit: { mode: CreationMode; unit: CreationUnit } | null = sourceUnitId
      ? (["novel", "screenplay"] as const).reduce<{ mode: CreationMode; unit: CreationUnit } | null>((found, candidate) => {
        if (found) return found;
        const unit = ws[candidate].units.find((item) => item.id === sourceUnitId);
        return unit ? { mode: candidate, unit } : null;
      }, null)
      : null;
    const saved: { mode: CreationMode; unit: CreationUnit } | null = savedMode && savedUnitId
      ? (() => {
        const unit = ws[savedMode].units.find((item) => item.id === savedUnitId);
        return unit ? { mode: savedMode, unit } : null;
      })()
      : null;
    const fallback = latestManuscriptPosition(ws);
    const position: { mode: CreationMode; unit: CreationUnit } | null = explicit || saved || fallback;
    const restoredWorkspace = position
      ? { ...ws, settings: { ...ws.settings, activeMode: position.mode, lastMode: position.mode, lastView: "unit" as CreationView, lastUnitId: position.unit.id, lastUnitUpdatedAt: position.unit.updatedAt } }
      : ws;
    const restored = ensureProject({ ...target, creationWorkspace: restoredWorkspace });
    setProject(restored);
    if (position) {
      setView("unit");
      setActiveUnitId(position.unit.id);
      setUnitSubMode("manuscript");
    } else if (ws.settings.lastView) {
      setView(ws.settings.lastView);
    }
    return restored;
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const projectId = searchParams.get("projectId");
    const forceNew = searchParams.get("new") === "1";
    const urlSourceUnitId = searchParams.get("sourceUnitId");
    let cancelled = false;

    async function hydrateProject() {
      setProjectReady(false);
      const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
      if (cancelled) return;
      setSession(data.session || null);
      if (forceNew) {
        setProjectReady(true);
        return;
      }
      if (projectId) {
        // URL 有 projectId → 加载对应项目（原逻辑）
        const local = readProjectsFromStorage();
        const localProject = local.find((item) => item.id === projectId);
        if (localProject) {
          const ensured = restoreProjectPosition(ensureProject(localProject), urlSourceUnitId);
          setProjectReady(true);
          return;
        }
        const synced = await syncProjectsWithSupabase(local, { accessToken: data.session?.access_token || null });
        if (cancelled) return;
        const cloudProject = synced.projects.find((item) => item.id === projectId);
        if (cloudProject) {
          const ensured = restoreProjectPosition(ensureProject(cloudProject), urlSourceUnitId);
          setProjectReady(true);
          return;
        }
        setError(isZh ? "没有找到这个项目，请返回工作台刷新后再打开。" : "This project was not found. Return to the dashboard and refresh.");
        return;
      }
      // 修复（2026-07-24）：URL 无 projectId → 从 localStorage 加载最近更新的创作项目
      // 避免用户在 /novel-workbench 创作后刷新丢失内容。
      // 只在浏览器端执行，且只加载创作类项目（creation/novel workflowType 或有 creationWorkspace）。
      if (typeof window === "undefined") {
        setProjectReady(true);
        return;
      }
      const local = readProjectsFromStorage();
      if (!local.length) {
        setProjectReady(true);
        return;
      }
      const creationProjects = local
        .filter((p) => p.workflowType === "creation" || p.workflowType === "novel" || Boolean(p.creationWorkspace))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      if (!creationProjects.length) {
        setProjectReady(true);
        return;
      }
      const ensured = restoreProjectPosition(ensureProject(creationProjects[0]));
      setProjectReady(true);
      // 更新 URL（不触发路由事件），这样刷新后能直接通过 projectId 加载
      const url = new URL(window.location.href);
      url.searchParams.set("projectId", ensured.id);
      window.history.replaceState(null, "", url.toString());
    }

    void hydrateProject();
    const { data: listener } = supabase?.auth.onAuthStateChange((_event, next) => setSession(next)) || {};
    return () => {
      cancelled = true;
      listener?.subscription.unsubscribe();
    };
  }, [searchParams]);

  useEffect(() => {
    if (!session?.access_token) return;
    void listUniverses({ accessToken: session.access_token }).then((rows) => {
      setUniverses(rows);
      setSelectedUniverseId(project.universeId || rows[0]?.id || "");
    }).catch(() => undefined);
  }, [project.universeId, session?.access_token]);

  // PRD V1.0 验收 P0-04：移除「无 unit 时自动创建第 1 章/集」逻辑。
  // 正文单元必须由分集规划定稿后自动建立（screenplay）或用户主动新建（novel，需大纲定稿）。
  // 仅在 track 已有 unit 但 activeUnitId 失效时回退到首个 unit。
  useEffect(() => {
    if (track.units.length && !track.units.some((unit) => unit.id === activeUnitId)) {
      setActiveUnitId(track.units[0].id);
    }
  }, [activeUnitId, track.units]);

  useEffect(() => {
    if (track.arcs.length && !track.arcs.some((arc) => arc.id === activeArcId)) setActiveArcId(track.arcs[0].id);
  }, [activeArcId, track.arcs]);

  // PRD V1.0 §8.7：按集自动保存（debounced 1.2s），切换集恢复滚动位置
  const skipAutoSave = useRef(true);
  useEffect(() => {
    if (skipAutoSave.current) { skipAutoSave.current = false; return; }
    if (!projectReady) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void saveProject(projectRef.current).catch(() => undefined);
    }, 1200);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  useEffect(() => {
    if (!projectReady || !project.id) return;
    const current = workspace.settings;
    const nextUnitId = view === "unit" ? activeUnit?.id : undefined;
    const nextUnitUpdatedAt = view === "unit" ? activeUnit?.updatedAt : undefined;
    if (
      current.lastMode === mode
      && current.lastView === view
      && current.lastUnitId === nextUnitId
      && current.lastUnitUpdatedAt === nextUnitUpdatedAt
    ) return;
    const nextProject = syncLegacy(projectRef.current, recordCreationPosition(workspace, {
      mode,
      view,
      unitId: nextUnitId,
      unitUpdatedAt: nextUnitUpdatedAt,
    }));
    projectRef.current = nextProject;
    setProject(nextProject);
  }, [activeUnit?.id, activeUnit?.updatedAt, mode, project.id, projectReady, view, workspace]);

  // 切换集时恢复滚动位置
  useEffect(() => {
    const key = `unit-${activeUnitId}`;
    const center = document.querySelector(".creation-center-scroll");
    if (center && scrollMemory.current[key] != null) center.scrollTop = scrollMemory.current[key];
    return () => { if (center) scrollMemory.current[key] = center.scrollTop; };
  }, [activeUnitId, view]);

  // PRD V1.0 验收 P1-03：view 切换时，AI 作用范围跟随阶段重置
  // 创作基座（background/characters/outline）→ stage；正文（unit）→ episode
  useEffect(() => {
    if (view === "background" || view === "characters" || view === "outline") {
      setAiScope((cur) => (cur === "stage" || cur === "materials" ? cur : "stage"));
    } else if (view === "unit") {
      setAiScope((cur) => (cur === "episode" || cur === "scene" || cur === "selection" ? cur : "episode"));
    }
  }, [view]);

  function commitWorkspace(updater: (current: CreationWorkspaceV2) => CreationWorkspaceV2) {
    const currentProject = projectRef.current;
    const currentWorkspace = currentProject.creationWorkspace || createCreationWorkspace(currentProject);
    const nextProject = syncLegacy(currentProject, updater(currentWorkspace));
    projectRef.current = nextProject;
    setProject(nextProject);
    return nextProject;
  }

  function updateWorkspace(updater: (current: CreationWorkspaceV2) => CreationWorkspaceV2) {
    setProject((current) => {
      const currentWorkspace = current.creationWorkspace || createCreationWorkspace(current);
      return syncLegacy(current, updater(currentWorkspace));
    });
  }

  function updateUnit(patch: Partial<CreationUnit>) {
    if (!activeUnit) return;
    updateWorkspace((current) => ({
      ...current,
      [mode]: {
        ...current[mode],
        units: current[mode].units.map((unit) => unit.id === activeUnit.id
          ? { ...unit, ...patch, id: unit.id, updatedAt: new Date().toISOString() }
          : unit),
      },
      updatedAt: new Date().toISOString(),
    }));
  }

  /**
   * 修复（2026-07-24）：确保项目已同步保存到 localStorage + URL 已更新。
   * 解决"页面刷新丢失定稿内容"问题：用户在 /novel-workbench（无 projectId）创作后，
   * 刷新页面会重新初始化为 freshProject，之前保存的内容找不到。
   *
   * 只做同步操作（localStorage + URL），不阻塞调用方。
   * Supabase 同步由 saveProject（await）或 callAI（异步 fire-and-forget）负责。
   *
   * 用 window.history.replaceState 更新 URL，不触发 Next.js 路由事件，避免循环加载。
   * 刷新时浏览器读取新 URL，useSearchParams 会拿到 projectId，加载对应项目。
   */
  function ensureProjectPersisted(target: DramaProject) {
    // 1. 同步保存到 localStorage
    upsertProject(target);

    // 2. 更新 URL（如果不一致）— 用 replaceState 避免触发 Next.js 路由事件
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const urlProjectId = url.searchParams.get("projectId");
      if (urlProjectId !== target.id) {
        url.searchParams.set("projectId", target.id);
        url.searchParams.delete("new");
        window.history.replaceState(null, "", url.toString());
      }
    }
  }

  async function saveProject(nextProject = project) {
    setError("");
    setSaveStatus("saving");
    // 修复（2026-07-24）：同步保存到 localStorage + 更新 URL（确保刷新可恢复）
    ensureProjectPersisted(nextProject);
    if (session?.access_token) {
      try {
        await upsertProjectToSupabase(nextProject, { accessToken: session.access_token });
      } catch {
        setSaveStatus("error");
        setStatus(isZh ? "已保存到本地，云端同步暂时不可用。" : "Saved locally; cloud sync is temporarily unavailable.");
        return;
      }
    }
    setSaveStatus("saved");
    setStatus(isZh ? "已保存到工作台。" : "Saved to Workspace.");
    if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
    saveStatusTimer.current = setTimeout(() => setSaveStatus("idle"), 3000);
  }

  function setMode(nextMode: CreationMode) {
    updateWorkspace((current) => ({ ...current, settings: { ...current.settings, activeMode: nextMode } }));
    setActiveUnitId("");
    setActiveArcId("");
  }

  function addUnit() {
    // PRD V1.0 验收 P0-04：创建正文单元前校验门禁
    const gate = canCreateUnit(workspace);
    if (!gate.ok) {
      setError(gate.reason || (isZh ? `当前阶段不能新建${mode === "novel" ? "章" : "集"}。` : "Cannot create a unit at this stage."));
      return;
    }
    const number = track.units.length + 1;
    const unit = createUnit(mode, number, `${mode}-unit-${crypto.randomUUID()}`);
    updateWorkspace((current) => ({
      ...current,
      [mode]: {
        ...current[mode],
        units: [...current[mode].units, unit],
        arcs: current[mode].arcs.map((arc) => arc.id === activeArc?.id ? { ...arc, unitIds: [...arc.unitIds, unit.id] } : arc),
      },
    }));
    setActiveUnitId(unit.id);
  }

  function syncOutlineStructure() {
    const arcs = parseArcStructure(workspace.documents.plotOutline.content, mode);
    if (!arcs.length) {
      setError(isZh ? "没有识别到“大章 + 章/集”结构。" : "No major-arc and chapter/episode structure was found.");
      return;
    }
    const existing = new Map(track.units.map((unit) => [unit.id, unit]));
    const units = arcs.flatMap((arc) => arc.unitIds.map((id) => existing.get(id) || createUnit(mode, Number(id.match(/(\d+)$/)?.[1]) || existing.size + 1, id)));
    updateWorkspace((current) => ({ ...current, [mode]: { arcs, units } }));
    setActiveArcId(arcs[0].id);
    setActiveUnitId(units[0]?.id || "");
    setStatus(isZh ? "已同步大章与章/集结构。" : "Arc and unit structure synchronized.");
  }

  // PRD V1.0 §7.3 + 验收 P0-03：创作基座定稿（内容校验在 state 层）
  function finalizeDoc(docKey: keyof CreationWorkspaceV2["documents"]) {
    try {
      const next = commitWorkspace((current) => current.documents[docKey].status === "finalized" ? unfinalizeDocument(current, docKey) : finalizeDocument(current, docKey));
      void saveProject(next);
      const isFinalized = next.creationWorkspace?.documents[docKey].status === "finalized";
      setStatus(isZh ? (isFinalized ? "已定稿。" : "已取消定稿，可修改。") : (isFinalized ? "Finalized." : "Unfinalized; ready to edit."));
    } catch (err) {
      setError(err instanceof Error ? err.message : "定稿失败");
    }
  }

  // PRD V1.0 §7.4：修改创作文档（含上游修改降级）
  function editDoc(docKey: keyof CreationWorkspaceV2["documents"], content: string) {
    updateWorkspace((current) => updateDocument(current, docKey, content));
  }

  // PRD V1.0 §7.6：生成分集规划
  async function generateEpisodePlan() {
    if (busy || !canGenerateEpisodePlan(workspace)) return;
    setBusy(true);
    setError("");
    setStatus(isZh ? "正在生成分集规划…" : "Generating episode plan…");
    try {
      const output = await callAI("creation_episode_plan", chatInput.trim() || contextText());
      if (!output.trim()) throw new Error(isZh ? "AI 没有返回分集规划。" : "AI returned no episode plan.");
      const plan = parseEpisodePlanOutput(output);
      const next = commitWorkspace((current) => setEpisodePlan(current, mode, plan));
      await saveProject(next);
      setMessages((current) => [...current, message("assistant", isZh ? `已生成分集规划，共 ${plan.items.length} 集。确认后请定稿。` : `Generated episode plan with ${plan.items.length} episodes.`)]);
      setStatus(isZh ? "分集规划已生成。" : "Episode plan generated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Episode plan generation failed");
    } finally {
      setBusy(false);
    }
  }

  // PRD V1.0 §7.6：定稿分集规划
  function finalizePlan() {
    if (!track.episodePlan) return;
    const next = commitWorkspace((current) => planFinalized ? unfinalizeEpisodePlan(current, mode) : finalizeEpisodePlan(current, mode));
    void saveProject(next);
    setStatus(isZh ? (planFinalized ? "已取消定稿，可修改分集规划。" : "分集规划已定稿，可逐集生成剧本。") : (planFinalized ? "Episode plan unfinalized; ready to edit." : "Episode plan finalized."));
  }

  function toggleUnitFinalized() {
    if (!activeUnit) return;
    try {
      const next = commitWorkspace((current) => activeUnit.status === "finalized"
        ? unfinalizeUnit(current, mode, activeUnit.id)
        : finalizeUnit(current, mode, activeUnit.id));
      void saveProject(next);
      const isFinalized = next.creationWorkspace?.[mode].units.find((unit) => unit.id === activeUnit.id)?.status === "finalized";
      setStatus(isZh
        ? (isFinalized ? "正文已定稿。" : "已取消定稿，可修改正文。")
        : (isFinalized ? "Manuscript finalized." : "Manuscript unfinalized; ready to edit."));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "正文定稿失败");
    }
  }

  // PRD V1.0 验收 第二批：分集规划草稿可编辑（定稿后只读）
  function editEpisodePlanItem(
    episodeNo: number,
    patch: Partial<Pick<EpisodePlanItem, "title" | "coreEvent" | "mainGoal" | "conflict" | "sceneCount">>,
  ) {
    if (!track.episodePlan || planFinalized) return;
    const nextPlan: EpisodePlan = {
      ...track.episodePlan,
      items: track.episodePlan.items.map((it) => it.episodeNo === episodeNo ? { ...it, ...patch } : it),
    };
    const next = commitWorkspace((current) => setEpisodePlan(current, mode, nextPlan));
    void saveProject(next);
  }

  // PRD V1.0 §7.8：逐场定稿 / 降级
  function toggleSceneFinalized(sceneId: string) {
    if (!activeUnit?.screenplay) return;
    const scene = activeUnit.screenplay.scenes.find((sc) => sc.id === sceneId);
    if (!scene) return;
    const next = commitWorkspace((current) =>
      scene.status === "finalized"
        ? draftScene(current, mode, activeUnit.id, sceneId)
        : finalizeScene(current, mode, activeUnit.id, sceneId),
    );
    void saveProject(next);
  }

  // PRD V1.0 §9：修改场次头信息（触发降级）
  function updateSceneHeader(sceneId: string, patch: Partial<ScreenplayScene>) {
    if (!activeUnit?.screenplay) return;
    commitWorkspace((current) => {
      const tr = current[mode];
      const units = tr.units.map((unit) => {
        if (unit.id !== activeUnit.id || !unit.screenplay) return unit;
        const wasFinalized = unit.screenplay.scenes.find((sc) => sc.id === sceneId)?.status === "finalized";
        const scenes = unit.screenplay.scenes.map((sc) =>
          sc.id === sceneId ? { ...sc, ...patch, status: (wasFinalized ? "draft" : sc.status) as CreationStatus } : sc,
        );
        return { ...unit, status: "draft" as const, screenplay: { ...unit.screenplay, scenes }, updatedAt: new Date().toISOString() };
      });
      return { ...current, [mode]: { ...tr, units }, updatedAt: new Date().toISOString() };
    });
  }

  // PRD V1.0 §9：修改场次 block（触发场次降级）
  function editSceneBlock(sceneId: string, blockId: string, patch: Partial<{ type: ScreenplayBlock["type"]; character: string; text: string; translation: string }>) {
    if (!activeUnit?.screenplay) return;
    commitWorkspace((current) => updateSceneBlock(current, mode, activeUnit.id, sceneId, blockId, patch));
  }

  // PRD V1.0 §9：新增 block
  function appendBlock(sceneId: string, block?: Partial<ScreenplayBlock>) {
    if (!activeUnit?.screenplay) return;
    commitWorkspace((current) => addSceneBlock(current, mode, activeUnit.id, sceneId, block));
  }

  // PRD V1.0 §9：删除 block
  function removeBlock(sceneId: string, blockId: string) {
    if (!activeUnit?.screenplay) return;
    commitWorkspace((current) => deleteSceneBlock(current, mode, activeUnit.id, sceneId, blockId));
  }

  // PRD V1.0 §8.3：新建场（afterSceneId=null 追加到末尾）
  function createScene(afterSceneId?: string | null) {
    if (!activeUnit?.screenplay) return;
    const next = commitWorkspace((current) => addScene(current, mode, activeUnit.id, afterSceneId ?? null));
    // 展开当前集目录
    setExpandedUnits((cur) => ({ ...cur, [activeUnit.id]: true }));
    void saveProject(next);
  }

  // PRD V1.0 §7.8：删除场
  function removeScene(sceneId: string) {
    if (!activeUnit?.screenplay) return;
    const next = commitWorkspace((current) => deleteScene(current, mode, activeUnit.id, sceneId));
    void saveProject(next);
  }

  // PRD V1.0 §7.8：拖拽重排场
  function dragScene(fromId: string, toId: string) {
    if (!activeUnit?.screenplay || fromId === toId) return;
    const next = commitWorkspace((current) => reorderScenes(current, mode, activeUnit.id, fromId, toId));
    void saveProject(next);
  }

  // PRD V1.0 §8.3：点击目录场次 → 定位正文
  function focusScene(sceneId: string) {
    setActiveSceneId(sceneId);
    setView("unit");
    setUnitSubMode("manuscript");
    // 展开当前集
    if (activeUnit) setExpandedUnits((cur) => ({ ...cur, [activeUnit.id]: true }));
    // 滚动到该场
    queueMicrotask(() => {
      const el = document.querySelector(`[data-scene-id="${sceneId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // PRD V1.0 §8.5：AI 修改预览 — 接受
  function acceptPreview() {
    if (!pendingPreview || !activeUnit) return;
    if (pendingPreview.kind === "newScene" && pendingPreview.scene) {
      const next = commitWorkspace((current) => appendPreviewScene(current, mode, activeUnit.id, pendingPreview.scene!));
      void saveProject(next);
    }
    if (pendingPreview.kind === "episodeScript" && pendingPreview.screenplay) {
      // PRD V1.0 验收 第二批：接受本集完整剧本生成预览，整体替换当前集 screenplay
      const next = commitWorkspace((current) => applyScreenplayToUnit(current, mode, activeUnit.id, pendingPreview.screenplay!));
      void saveProject(next);
    }
    if (pendingPreview.kind === "modifyScene" && pendingPreview.sceneId) {
      // 修改现成场：解析 proposedText 为 blocks 并替换
      const sceneId = pendingPreview.sceneId;
      const lines = (pendingPreview.proposedText || "").split("\n").filter(Boolean);
      const blocks: ScreenplayBlock[] = lines.map((line) => ({
        id: `block-${crypto.randomUUID()}`,
        type: line.startsWith("(") ? "parenthetical" : line === line.toUpperCase() && line.length < 40 ? "transition" : "action",
        character: "",
        text: line.startsWith("(") ? line.slice(1, -1) : line,
        translation: "",
      }));
      const next = commitWorkspace((current) => {
        const tr = current[mode];
        const units = tr.units.map((unit) => {
          if (unit.id !== activeUnit.id || !unit.screenplay) return unit;
          const scenes = unit.screenplay.scenes.map((sc) => sc.id === sceneId ? { ...sc, status: "draft" as CreationStatus, blocks } : sc);
          const allFinal = scenes.every((sc) => sc.status === "finalized");
          return { ...unit, status: (allFinal ? "finalized" : "draft") as CreationStatus, screenplay: { ...unit.screenplay, scenes }, updatedAt: new Date().toISOString() };
        });
        return { ...current, [mode]: { ...tr, units }, updatedAt: new Date().toISOString() };
      });
      void saveProject(next);
    }
    setPendingPreview(null);
    setStatus(isZh ? "AI 修改已应用。" : "AI edit applied.");
  }

  // PRD V1.0 §8.5：AI 修改预览 — 拒绝
  function rejectPreview() {
    setPendingPreview(null);
    setStatus(isZh ? "已忽略 AI 修改。" : "AI edit dismissed.");
  }

  // PRD V1.0 §8.5：AI 改写当前场（先生成预览，确认后应用）
  async function aiModifyScene(sceneId: string) {
    if (!activeUnit?.screenplay || busy) return;
    if (!session?.access_token) { setAuthOpen(true); return; }
    const scene = activeUnit.screenplay.scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    setBusy(true);
    setError("");
    setStatus(isZh ? "正在生成场次修改预览…" : "Generating scene edit preview…");
    try {
      const originalText = renderSceneBlocks(scene);
      const instruction = chatInput.trim() || (isZh ? "请优化本场剧本：润色对白、补充动作描写，保持场次头不变。" : "Refine this scene: polish dialogue and add action; keep the scene header unchanged.");
      const output = await callAI("creation_screenplay_unit", `${isZh ? "修改指令" : "Instruction"}：${instruction}\n\n${isZh ? "当前场次" : "Current scene"}：\n${originalText}`);
      if (!output.trim()) throw new Error(isZh ? "AI 没有返回内容。" : "AI returned no content.");
      setPendingPreview({ kind: "modifyScene", sceneId, originalText, proposedText: output });
      setMessages((cur) => [...cur, message("assistant", isZh ? "已生成场次修改预览，请确认后应用。" : "Scene edit preview ready. Confirm to apply.")]);
      setStatus(isZh ? "AI 修改预览已生成，请确认。" : "AI edit preview ready.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Scene edit failed");
    } finally {
      setBusy(false);
    }
  }

  // PRD V1.0 §7.2：上传资料后请求 AI 理解摘要
  async function requestSourceComprehension(filesArg?: SourceFile[]) {
    const files = filesArg || sourceFiles;
    if (!files.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const input = files.map((f) => `资料 ${f.name}：\n${f.text}`).join("\n\n");
      const output = await callAI("creation_development_chat", `${isZh
        ? "请把以下资料压缩成可复用的创作底稿，只保留事实、设定和冲突线索，不要全文复述。输出必须包含：1) 资料总摘要 2) 背景/角色/剧情压缩要点 3) 资料间重复或冲突 4) 明显缺失的信息 5) 可直接进入背景及世界观的关键事实。"
        : "Compress the following materials into a reusable creative brief. Keep only facts, setup, and conflict cues; do not restate the full text. Output: 1) overall summary 2) compressed background/character/plot points 3) overlaps or conflicts 4) missing information 5) key facts ready for Background & World."}\n\n${input}`);
      setSourceComprehension({ summary: output, confirmed: false });
      setMessages((cur) => [...cur, message("assistant", output)]);
      setStatus(isZh ? "已生成资料理解摘要，请确认后进入背景生成。" : "Source comprehension generated. Confirm to proceed.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Comprehension failed");
    } finally {
      setBusy(false);
    }
  }

  function confirmSourceComprehension() {
    setSourceComprehension((cur) => cur ? { ...cur, confirmed: true } : null);
    setView("background");
    setStatus(isZh ? "已确认理解，开始生成背景及世界观。" : "Confirmed. Start generating background.");
  }

  function stageTask(): TaskType | null {
    if (view === "background") return "creation_background_world";
    if (view === "characters") return "creation_character_bible";
    if (view === "outline") return "creation_plot_outline";
    if (view === "episodePlan") return "creation_episode_plan";
    if (view === "unit") {
      if (unitSubMode === "translation") return "creation_translate_unit";
      if (unitSubMode === "localization") return "creation_localize_unit";
      return mode === "novel" ? "creation_novel_unit" : "creation_screenplay_unit";
    }
    return null;
  }

  function sourceMaterialContext() {
    const fileList = sourceFiles.map((file) => `- ${file.name}`).join("\n");
    const summary = sourceComprehension?.summary?.trim();
    if (summary) {
      return [
        isZh ? "压缩后的上传资料：" : "Compressed uploaded materials:",
        summary,
        fileList ? (isZh ? `资料清单：\n${fileList}` : `Source file list:\n${fileList}`) : "",
      ].filter(Boolean).join("\n\n");
    }
    if (!sourceFiles.length) return "";
    const preview = sourceFiles
      .map((file) => {
        const text = file.text.replace(/\s+/g, " ").trim();
        const excerpt = text.length > 1000 ? `${text.slice(0, 1000)}…` : text;
        return `资料 ${file.name}（${isZh ? "截断预览" : "truncated preview"}）：\n${excerpt}`;
      })
      .join("\n\n");
    return preview ? `${isZh ? "上传资料预览：" : "Uploaded materials preview:"}\n${preview}` : "";
  }

  function contextText() {
    const previous = track.units
      .filter((unit) => unit.status === "finalized" && (!activeUnit || unit.number < activeUnit.number))
      .map((unit) => `#${unit.number} ${unit.title}\n${unit.continuityNotes || unit.outline}`)
      .join("\n\n");
    const stageLabel = view === "background" ? "背景及世界观"
      : view === "characters" ? "角色圣经"
      : view === "outline" ? "剧情及大纲"
      : view === "episodePlan" ? "分集规划"
      : view === "unit" ? (unitSubMode === "translation" ? "翻译" : unitSubMode === "localization" ? "本土化及雷同查验" : "正文")
      : "导出";
    return [
      `当前阶段：${stageLabel}`,
      `当前模式：${mode}`,
      `背景及世界观：\n${workspace.documents.backgroundWorld.content}`,
      `角色圣经：\n${workspace.documents.characterBible.content}`,
      `剧情及大纲：\n${workspace.documents.plotOutline.content}`,
      track.episodePlan ? `分集规划：\n${track.episodePlan.items.map((it) => `第${it.episodeNo}集 ${it.title}：${it.coreEvent}`).join("\n")}` : "",
      activeArc ? `当前大章：${activeArc.title}\n${activeArc.outline}` : "",
      activeUnit ? `当前章/集：${activeUnit.number} ${activeUnit.title}\n${activeUnit.outline}\n${activeUnit.continuityNotes}` : "",
      previous ? `前序定稿单元：\n${previous}` : "",
      project.novelDevelopmentNotes ? `创作沟通记录：\n${project.novelDevelopmentNotes}` : "",
      sourceMaterialContext(),
    ].filter(Boolean).join("\n\n");
  }

  async function callAI(taskType: TaskType, input: string) {
    if (!session?.access_token) throw new Error(isZh ? "请先登录后使用 AI。" : "Sign in to use AI.");
    const requestProject = projectRef.current;
    // 修复（2026-07-24）：AI 调用前确保项目已持久化（localStorage + URL + 异步 Supabase）
    // 这样即使用户在 /novel-workbench（无 projectId）直接开始创作，项目也会被保存，
    // 刷新页面后能通过 URL 中的 projectId 恢复，不会丢失已生成/定稿的内容。
    ensureProjectPersisted(requestProject);
    void upsertProjectToSupabase(requestProject, { accessToken: session.access_token }).catch(() => undefined);
    const requestWorkspace = requestProject.creationWorkspace || createCreationWorkspace(requestProject);
    const requestMode = requestWorkspace.settings.activeMode;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), getAiTimeoutMs(taskType));
    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
        body: JSON.stringify({
          taskType,
          projectId: requestProject.id,
          projectTitle: requestProject.title,
          market: requestWorkspace.settings.targetMarket,
          genre: requestWorkspace.settings.genre,
          idea: requestProject.idea,
          input,
          context: contextText(),
          options: {
            interfaceLanguage: locale,
            contentMode: requestMode,
            sourceLanguage: requestMode === "screenplay" ? requestWorkspace.settings.screenplayLanguage : requestWorkspace.settings.sourceLanguage,
            translationLanguage: requestWorkspace.settings.translationLanguage,
            screenplayLanguage: requestWorkspace.settings.screenplayLanguage,
            dialogueLanguage: requestWorkspace.settings.dialogueLanguage,
            screenplayFormat: requestWorkspace.settings.screenplayFormat,
            generationScope: requestWorkspace.settings.generationScope,
            unitNo: activeUnit?.number || 1,
            arcTitle: activeArc?.title || "",
            targetLanguage: requestWorkspace.settings.translationLanguage || requestWorkspace.settings.dialogueLanguage,
          },
          allSteps: {
            creation_background_world: requestWorkspace.documents.backgroundWorld.content,
            creation_character_bible: requestWorkspace.documents.characterBible.content,
            creation_plot_outline: requestWorkspace.documents.plotOutline.content,
          },
          byoApi: readByoApiConfig("script"),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "AI generation failed");
      return String(payload.output || "");
    } catch (error) {
      // 超时触发 controller.abort() 时，fetch 抛 AbortError（Safari message = "Signal is aborted without reason"）
      // 捕获后转为友好提示，避免原始 abort message 直接显示给用户
      if (controller.signal.aborted) {
        throw new Error(isZh ? "AI 请求超时，请稍后重试或精简输入内容。" : "AI request timed out. Please retry or shorten your input.");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function sendChat() {
    const input = chatInput.trim();
    if (!input || busy) return;
    setChatInput("");
    setMessages((current) => [...current, message("user", input)]);
    const currentProject = projectRef.current;
    const notes = appendNotes(currentProject.novelDevelopmentNotes, "USER", input);
    const recorded = { ...currentProject, idea: currentProject.idea || input, novelDevelopmentNotes: notes, updatedAt: new Date().toISOString() };
    projectRef.current = recorded;
    setProject(recorded);
    upsertProject(recorded);
    if (!session?.access_token) {
      setMessages((current) => [...current, message("assistant", isZh ? "想法已记录。登录后我会继续追问并协助更新右侧文档。" : "Your idea is saved. Sign in and I will continue the discussion and update the document.")]);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const output = await callAI("creation_development_chat", input);
      setMessages((current) => [...current, message("assistant", output)]);
      const latest = projectRef.current;
      const next = { ...latest, novelDevelopmentNotes: appendNotes(latest.novelDevelopmentNotes, "AI", output), updatedAt: new Date().toISOString() };
      projectRef.current = next;
      setProject(next);
      await saveProject(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AI chat failed");
    } finally {
      setBusy(false);
    }
  }

  async function generateStage() {
    const taskType = stageTask();
    if (!taskType || view === "export" || busy) return;
    if (view === "episodePlan") return generateEpisodePlan();
    const isUnitManuscript = view === "unit" && unitSubMode === "manuscript";
    const isUnitTranslation = view === "unit" && unitSubMode === "translation";
    const isUnitLocalization = view === "unit" && unitSubMode === "localization";
    if (isUnitManuscript && activeUnit?.status === "finalized") {
      setError(isZh ? `当前${mode === "novel" ? "章" : "集"}已定稿，修改后会自动降级为草稿。` : "The current unit is finalized.");
    }
    const translationSource = activeUnit ? buildTranslationSource(workspace, mode, activeUnit) : "";
    if (isUnitTranslation) {
      const sourceLanguage = mode === "screenplay" ? workspace.settings.screenplayLanguage : workspace.settings.sourceLanguage;
      if (!workspace.settings.translationLanguage) {
        setError(isZh ? "请先选择翻译语言；如不需要翻译，可直接跳过本阶段。" : "Select a translation language, or skip this optional stage.");
        return;
      }
      if (sourceLanguage.trim().toLowerCase() === workspace.settings.translationLanguage.trim().toLowerCase()) {
        setError(isZh ? "翻译语言不能与原文语言相同。" : "The translation language must differ from the source language.");
        return;
      }
      if (!translationSource) {
        setError(isZh ? `当前${mode === "novel" ? "章" : "集"}没有可翻译的正文。` : "The current unit has no source content to translate.");
        return;
      }
    }
    setBusy(true);
    setError("");
    setStatus(isZh ? "正在生成当前阶段…" : "Generating the current stage…");
    try {
      const input = isUnitTranslation
        ? translationSource
        : isUnitLocalization
          ? activeUnit?.translation || translationSource
          : isUnitManuscript && aiScope !== "episode"
            ? (() => { const scope = buildScopeContent(); return scope ? `${chatInput.trim() ? chatInput.trim() + "\n\n" : ""}${scope}` : (chatInput.trim() || project.idea || contextText()); })()
            : chatInput.trim() || project.idea || contextText();
      const output = await callAI(taskType, input);
      if (!output.trim()) throw new Error(isZh ? "AI 没有返回可保存的内容，当前版本未覆盖。" : "AI returned no savable content; the current version was preserved.");
      const nextProject = commitWorkspace((currentWorkspace) => {
        if (view === "background" || view === "characters" || view === "outline") {
          const key = view === "background" ? "backgroundWorld" : view === "characters" ? "characterBible" : "plotOutline";
          return {
            ...currentWorkspace,
            documents: { ...currentWorkspace.documents, [key]: { content: output, updatedAt: new Date().toISOString(), status: "draft" as CreationStatus } },
          };
        }
        if (isUnitManuscript && activeUnit) {
          if (workspace.settings.generationScope === "arc" && activeArc) {
            const parsed = parseBatchUnitOutput(output, mode);
            return parsed.reduce((batchWorkspace, unit, index) => {
              const unitId = activeArc.unitIds[index];
              if (!unitId) return batchWorkspace;
              return applyUnitGeneration(batchWorkspace, mode, unitId, `<CREATION_OUTPUT>\n${JSON.stringify(unit)}\n</CREATION_OUTPUT>`, {
                model: "routed", instruction: chatInput, scope: "arc",
              });
            }, currentWorkspace);
          }
          return applyUnitGeneration(currentWorkspace, mode, activeUnit.id, output, {
            model: "routed", instruction: chatInput, scope: "unit",
          });
        }
        if (isUnitTranslation && activeUnit) {
          return applyUnitTranslation(currentWorkspace, mode, activeUnit.id, output);
        }
        if (isUnitLocalization && activeUnit) {
          const localized = parseLocalization(output);
          if (!localized.localizedContent || !localized.localizationChanges || !localized.similarityReport) throw new Error(isZh ? "AI 返回缺少本土化三段内容，当前版本未覆盖。" : "Localization output is incomplete; the current version was preserved.");
          const currentTrack = currentWorkspace[mode];
          return {
            ...currentWorkspace,
            [mode]: {
              ...currentTrack,
              units: currentTrack.units.map((unit) => unit.id === activeUnit.id
                ? { ...unit, ...localized, updatedAt: new Date().toISOString() }
                : unit),
            },
          };
        }
        return currentWorkspace;
      });
      await saveProject(nextProject);
      setMessages((current) => [...current, message("assistant", isZh ? `已更新${activeUnit ? `，第 ${activeUnit.number} ${mode === "novel" ? "章" : "集"}` : ""}。` : `Updated${activeUnit ? `, unit ${activeUnit.number}` : ""}.`)]);
      setStatus(isZh ? "生成完成并已保存。" : "Generated and saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  // PRD V1.0 验收 第二批：生成本集完整剧本（剧本版专用主按钮）
  // 校验 → 调 AI → 解析 → 预览确认（不直接覆盖）
  async function generateEpisodeScript() {
    if (busy) return;
    if (!activeUnit) {
      setError(isZh ? "请先选择一集剧本。" : "Select an episode first.");
      return;
    }
    if (!canGenerateScript(workspace)) {
      setError(isZh ? "请先完成并定稿剧情大纲与分集规划，再生成剧本。" : "Finalize the outline and episode plan before generating the script.");
      return;
    }
    if (!session?.access_token) { setAuthOpen(true); return; }
    setBusy(true);
    setError("");
    setStatus(isZh ? `正在生成第 ${activeUnit.number} 集完整剧本…` : `Generating episode ${activeUnit.number} script…`);
    try {
      // 前序定稿集的连续性备注，供 AI 保持前后一致
      const previous = track.units
        .filter((unit) => unit.status === "finalized" && unit.number < activeUnit.number)
        .map((unit) => `第${unit.number}集《${unit.title}》连续性：${unit.continuityNotes || unit.outline || "—"}`)
        .join("\n\n");
      // 本集规划（从分集规划里匹配）
      const planItem = track.episodePlan?.items.find((it) => it.episodeNo === activeUnit.number);
      const episodePlanText = planItem
        ? `本集规划：\n标题：${planItem.title}\n核心事件：${planItem.coreEvent}\n主角目标：${planItem.mainGoal}\n冲突：${planItem.conflict}\n计划场次：${planItem.sceneCount}`
        : activeUnit.outline;
      const input = [
        `背景及世界观：\n${workspace.documents.backgroundWorld.content}`,
        `角色圣经：\n${workspace.documents.characterBible.content}`,
        `剧情大纲：\n${workspace.documents.plotOutline.content}`,
        episodePlanText ? `\n${episodePlanText}` : "",
        previous ? `\n前序集连续性：\n${previous}` : "",
        chatInput.trim() ? `\n补充指令：${chatInput.trim()}` : "",
      ].filter(Boolean).join("\n\n");
      const output = await callAI("creation_screenplay_unit", input);
      if (!output.trim()) throw new Error(isZh ? "AI 没有返回剧本内容。" : "AI returned no screenplay.");
      const parsed = parseScreenplayUnitOutput(output);
      const screenplay = parsed.screenplay;
      if (!screenplay || !screenplay.scenes.length) throw new Error(isZh ? "AI 返回的剧本没有场次，无法应用。" : "AI screenplay has no scenes.");
      setPendingPreview({ kind: "episodeScript", screenplay, proposedText: output });
      setMessages((cur) => [...cur, message("assistant", isZh ? `已生成第 ${activeUnit.number} 集《${screenplay.title || activeUnit.title}》剧本预览（${screenplay.scenes.length} 场），请确认后应用。` : `Episode ${activeUnit.number} script preview ready (${screenplay.scenes.length} scenes). Confirm to apply.`)]);
      setStatus(isZh ? "剧本生成预览已就绪，请确认。" : "Script preview ready. Confirm to apply.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Episode script generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadSources(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setError("");
    try {
      const added: SourceFile[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/files/parse", { method: "POST", body: form });
        const payload = await response.json();
        if (!response.ok || !payload?.text) throw new Error(payload?.error || `Could not parse ${file.name}`);
        added.push({ id: crypto.randomUUID(), name: file.name, text: payload.text });
      }
      setSourceFiles((current) => [...current, ...added]);
      const notes = added.map((file) => `【上传资料：${file.name}】\n${file.text}`).join("\n\n");
      setProject((current) => ({ ...current, novelDevelopmentNotes: [current.novelDevelopmentNotes, notes].filter(Boolean).join("\n\n") }));
      setMessages((current) => [...current, message("assistant", isZh ? `已读取 ${added.length} 份资料并加入创作上下文。` : `Read ${added.length} files and added them to the creation context.`)]);
      // PRD V1.0 §7.2：上传资料后自动触发 AI 理解摘要（仅当尚未生成理解时触发，避免重复）
      if (session?.access_token && !sourceComprehension) void requestSourceComprehension([...sourceFiles, ...added]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "File parsing failed");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function createAndLinkUniverse() {
    if (!session?.access_token) return setAuthOpen(true);
    setUniverseBusy(true);
    try {
      const { universe } = await createUniverseFromProject({
        project,
        accessToken: session.access_token,
        form: {
          name: `${project.title} Universe`,
          description: workspace.documents.backgroundWorld.content || project.idea,
          genre: workspace.settings.genre,
          default_language: workspace.settings.sourceLanguage,
          target_markets: [workspace.settings.targetMarket].filter(Boolean),
          tone: "",
        },
      });
      const next = { ...project, universeId: universe.id, updatedAt: new Date().toISOString() };
      setProject(next);
      setUniverses((current) => [universe, ...current.filter((item) => item.id !== universe.id)]);
      setSelectedUniverseId(universe.id);
      await saveProject(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Universe creation failed");
    } finally {
      setUniverseBusy(false);
    }
  }

  async function linkUniverse() {
    if (!session?.access_token || !selectedUniverseId) return;
    setUniverseBusy(true);
    const now = new Date().toISOString();
    try {
      await upsertUniverseProjectLink({
        id: `creation-link-${project.id}-${selectedUniverseId}`,
        universe_id: selectedUniverseId,
        project_id: project.id,
        user_id: session.user.id,
        project_role: "adaptation",
        season_number: project.seasonNumber || 1,
        inheritance_settings: project.inheritanceSettings || DEFAULT_INHERITANCE_SETTINGS,
        created_at: now,
        updated_at: now,
      }, { accessToken: session.access_token });
      const next = { ...project, universeId: selectedUniverseId, updatedAt: now };
      setProject(next);
      await saveProject(next);
    } finally {
      setUniverseBusy(false);
    }
  }

  async function sendUniverseInbox() {
    if (!session?.access_token || !project.universeId) return;
    const response = await fetch("/api/universe/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ universeId: project.universeId, project }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) throw new Error(payload?.error || "Universe extraction failed");
    await saveInboxItems(payload.items || [], { accessToken: session.access_token });
    setStatus(isZh ? "已发送 Universe Inbox。" : "Sent to Universe Inbox.");
  }

  async function openDownstream(target: "art" | "production") {
    await saveProject();
    if (target === "production") {
      // PRD V1.0 验收 P0-05：制作门禁 — 只有剧本版定稿且非空集才能进入
      const gate = canEnterProduction(workspace, activeUnit?.id);
      if (!gate.ok) {
        setError(gate.reason || (isZh ? "不能进入制作。" : "Cannot enter production."));
        return;
      }
      if (!activeUnit) {
        setError(isZh ? "请先选择一集剧本。" : "Select an episode first.");
        return;
      }
    }
    if (target === "art" && mode === "novel") {
      // PRD V1.0 验收 P1-02：美术台仅接收剧本版，小说版不可进入
      setError(isZh ? "美术台仅接收剧本版集，请先切换到剧本版并定稿一集。" : "Art workbench only accepts finalized screenplay episodes.");
      return;
    }
    const contentType = mode === "novel" ? "novel" : "script";
    const sourceUnitId = target === "production" ? activeUnit?.id : undefined;
    writeCreativeHandoff(buildCreativeHandoffPackage(project, contentType, sourceUnitId));
    const source = encodeURIComponent(project.id);
    if (target === "art") {
      router.push(`/production?mode=art&projectId=${source}`);
      return;
    }
    const unit = encodeURIComponent(sourceUnitId || "");
    router.push(`/production?projectId=${source}&sourceUnitId=${unit}`);
  }

  function editorValue() {
    if (view === "background") return workspace.documents.backgroundWorld.content;
    if (view === "characters") return workspace.documents.characterBible.content;
    if (view === "outline") return workspace.documents.plotOutline.content;
    if (!activeUnit) return "";
    if (unitSubMode === "translation") return activeUnit.translation;
    if (unitSubMode === "localization") {
      if (localizationView === "changes") return activeUnit.localizationChanges;
      if (localizationView === "similarity") return activeUnit.similarityReport;
      return activeUnit.localizedContent;
    }
    return activeUnit.content;
  }

  function editValue(value: string) {
    if (view === "background" || view === "characters" || view === "outline") {
      const key = view === "background" ? "backgroundWorld" : view === "characters" ? "characterBible" : "plotOutline";
      editDoc(key, value);
      return;
    }
    if (unitSubMode === "translation") return updateUnit({ translation: value });
    if (unitSubMode === "localization") {
      if (localizationView === "changes") return updateUnit({ localizationChanges: value });
      if (localizationView === "similarity") return updateUnit({ similarityReport: value });
      return updateUnit({ localizedContent: value });
    }
    updateUnit({ content: value });
  }

  // PRD V1.0 验收 第三批/P1-05：点击字段模板，在光标处插入 markdown 标题
  function insertFieldTemplate(fieldLabel: string) {
    const ta = docEditorRef.current;
    const insertText = `## ${fieldLabel}\n`;
    if (!ta) {
      // 无 ref 时追加到末尾
      editValue((editorValue() ? editorValue() + "\n" : "") + insertText);
      return;
    }
    const start = ta.selectionStart ?? editorValue().length;
    const end = ta.selectionEnd ?? editorValue().length;
    const before = editorValue().slice(0, start);
    const after = editorValue().slice(end);
    const needPrefix = before.length && !before.endsWith("\n") ? "\n" : "";
    const next = before + needPrefix + insertText + after;
    editValue(next);
    // 恢复光标到插入内容之后
    queueMicrotask(() => {
      const pos = (before + needPrefix + insertText).length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  }

  /** PRD V1.0 §9：单场渲染（连续编辑器内只读预览） */
  function renderSceneBlocks(scene: ScreenplayScene): string {
    return scene.blocks.map((block) => {
      if (block.type === "action" || block.type === "note") return block.text;
      if (block.type === "transition") return block.text.toUpperCase();
      if (block.type === "parenthetical") return `(${block.text})`;
      if (block.type === "dialogue") {
        const paren = block.character ? `${block.character}${block.translation ? ` / ${block.translation}` : ""}` : "";
        return paren ? `${paren}\n${block.text}` : block.text;
      }
      return block.text;
    }).filter(Boolean).join("\n\n");
  }

  /** PRD V1.0 §11.3：把单元转为可下载文档（剧本场次拼为 markdown） */
  function unitToDocument(unit: CreationUnit): AssembledDocument {
    const language = mode === "screenplay" ? workspace.settings.screenplayLanguage : workspace.settings.sourceLanguage;
    const markdown = unit.screenplay && unit.screenplay.scenes.length
      ? unit.screenplay.scenes.map((sc) => `## ${sc.interiorExterior}·${sc.location}·${sc.timeOfDay}\n${renderSceneBlocks(sc)}`).join("\n\n")
      : unit.content;
    return { title: `${unit.number}. ${unit.title}`, language, markdown, diagnostics: [] };
  }

  /** PRD V1.0 §8.5：按 aiScope 构造 AI 输入作用范围内容 */
  function buildScopeContent(): string {
    // PRD V1.0 验收 P1-03：创作基座阶段 — 当前阶段（当前文档内容）
    if (aiScope === "stage") {
      const doc = view === "background" ? workspace.documents.backgroundWorld.content
        : view === "characters" ? workspace.documents.characterBible.content
        : view === "outline" ? workspace.documents.plotOutline.content
        : "";
      return doc ? `${isZh ? "【作用范围：当前阶段】" : "[Scope: current stage]"}\n${doc}` : "";
    }
    // PRD V1.0 验收 P1-03：全部资料（优先压缩摘要，回退到截断预览）
    if (aiScope === "materials") {
      const mats = sourceMaterialContext();
      return mats ? `${isZh ? "【作用范围：全部资料】" : "[Scope: all materials]"}\n${mats}` : "";
    }
    // PRD V1.0 验收 R-03：分集规划阶段 — 当前分集规划
    if (aiScope === "plan") {
      const plan = track.episodePlan;
      if (!plan) return "";
      const planText = plan.items.map((it) =>
        `第${it.episodeNo}集 ${it.title}\n核心事件：${it.coreEvent}\n目标：${it.mainGoal}\n冲突：${it.conflict}\n场次规划：${it.sceneOutlines.join("；")}`
      ).join("\n\n");
      return planText ? `${isZh ? "【作用范围：当前分集规划】" : "[Scope: current episode plan]"}\n${planText}` : "";
    }
    if (aiScope === "scene" && activeSceneId && activeUnit?.screenplay) {
      const scene = activeUnit.screenplay.scenes.find((s) => s.id === activeSceneId);
      return scene ? `${isZh ? "【作用范围：当前场】" : "[Scope: current scene]"}\n${renderSceneBlocks(scene)}` : "";
    }
    if (aiScope === "selection" && chatInputRef.current) {
      const ta = chatInputRef.current;
      const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd).trim();
      return sel ? `${isZh ? "【作用范围：选中文字】" : "[Scope: selection]"}\n${sel}` : "";
    }
    return "";
  }

  // P1-A：小说版卷（arc）操作
  function createArc() {
    const number = track.arcs.length + 1;
    const arc = { id: `arc-${crypto.randomUUID()}`, number, title: isZh ? `第 ${number} 卷` : `Volume ${number}`, outline: "", unitIds: [] };
    updateWorkspace((current) => ({ ...current, [mode]: { ...current[mode], arcs: [...current[mode].arcs, arc] } }));
    setActiveArcId(arc.id);
    setExpandedArcs((cur) => ({ ...cur, [arc.id]: true }));
  }
  function renameArc(arcId: string, title: string) {
    updateWorkspace((current) => ({ ...current, [mode]: { ...current[mode], arcs: current[mode].arcs.map((a) => a.id === arcId ? { ...a, title } : a) } }));
  }
  function moveUnitToArc(unitId: string, arcId: string) {
    updateWorkspace((current) => ({
      ...current,
      [mode]: { ...current[mode], arcs: current[mode].arcs.map((a) => {
        const without = a.unitIds.filter((id) => id !== unitId);
        return a.id === arcId ? { ...a, unitIds: [...without, unitId] } : { ...a, unitIds: without };
      }) },
    }));
  }

  // P1-B：整集搜索与替换（在当前单元正文/场次 block 上做字符串替换）
  function replaceInUnit(find: string, replace: string, all: boolean) {
    if (!activeUnit || !find) return;
    if (mode === "screenplay" && activeUnit.screenplay) {
      let count = 0;
      const sceneIds = activeUnit.screenplay.scenes.map((s) => s.id);
      const replaced = all ? sceneIds : (activeSceneId ? [activeSceneId] : sceneIds);
      for (const sceneId of replaced) {
        const scene = activeUnit.screenplay.scenes.find((s) => s.id === sceneId);
        if (!scene) continue;
        for (const block of scene.blocks) {
          if (block.text.includes(find)) {
            editSceneBlock(sceneId, block.id, { text: all ? block.text.split(find).join(replace) : block.text.replace(find, replace) });
            count++;
            if (!all) break;
          }
        }
        if (!all && count) break;
      }
      setStatus(isZh ? `已替换 ${count} 处。` : `Replaced ${count} occurrence(s).`);
    } else {
      const content = activeUnit.content;
      if (!content.includes(find)) { setStatus(isZh ? "未找到匹配。" : "No match found."); return; }
      const next = all ? content.split(find).join(replace) : content.replace(find, replace);
      updateUnit({ content: next });
      setStatus(isZh ? "已替换。" : "Replaced.");
    }
  }

  // P1-D：剧本格式检查（纯前端规则）
  function runFormatCheck() {
    if (!activeUnit?.screenplay) { setFormatIssues([]); return; }
    const issues: Array<{ sceneId: string; sceneNo: number; level: "error" | "warn" | "muted"; message: string }> = [];
    for (const scene of activeUnit.screenplay.scenes) {
      if (!scene.location.trim() || !scene.timeOfDay.trim()) {
        issues.push({ sceneId: scene.id, sceneNo: scene.sceneNo, level: "error", message: isZh ? `场 ${scene.sceneNo} 缺少地点或时间` : `Scene ${scene.sceneNo} missing location or time` });
      }
      if (!scene.blocks.length) {
        issues.push({ sceneId: scene.id, sceneNo: scene.sceneNo, level: "muted", message: isZh ? `场 ${scene.sceneNo} 无内容块` : `Scene ${scene.sceneNo} has no blocks` });
      }
      for (const block of scene.blocks) {
        if (block.type === "dialogue" && !block.character.trim()) {
          issues.push({ sceneId: scene.id, sceneNo: scene.sceneNo, level: "error", message: isZh ? `场 ${scene.sceneNo} 对白缺少角色名` : `Scene ${scene.sceneNo} dialogue missing character` });
        }
        if (block.type === "transition" && block.text !== block.text.toUpperCase()) {
          issues.push({ sceneId: scene.id, sceneNo: scene.sceneNo, level: "warn", message: isZh ? `场 ${scene.sceneNo} 转场未大写` : `Scene ${scene.sceneNo} transition not uppercase` });
        }
      }
    }
    setFormatIssues(issues);
    setStatus(issues.length ? (isZh ? `发现 ${issues.length} 个格式问题。` : `Found ${issues.length} issue(s).`) : (isZh ? "格式检查通过。" : "Format check passed."));
  }

  // P1-F：多场批量操作
  function batchFinalizeScenes() {
    if (!activeUnit?.screenplay) return;
    const ids = Object.keys(selectedScenes).filter((id) => selectedScenes[id]);
    for (const id of ids) {
      const scene = activeUnit.screenplay.scenes.find((s) => s.id === id);
      if (scene && scene.status !== "finalized") toggleSceneFinalized(id);
    }
    setSelectedScenes({});
  }
  function batchDeleteScenes() {
    if (!activeUnit?.screenplay) return;
    const ids = Object.keys(selectedScenes).filter((id) => selectedScenes[id]);
    if (!ids.length) return;
    if (!window.confirm(isZh ? `确认删除 ${ids.length} 个场次？` : `Delete ${ids.length} scene(s)?`)) return;
    for (const id of ids) removeScene(id);
    setSelectedScenes({});
  }
  function batchSetInterior(ie: "INT" | "EXT") {
    if (!activeUnit?.screenplay) return;
    const ids = Object.keys(selectedScenes).filter((id) => selectedScenes[id]);
    for (const id of ids) updateSceneHeader(id, { interiorExterior: ie });
    setSelectedScenes({});
  }

  // P1-E：全局快捷键
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "s") { event.preventDefault(); void saveProject(); return; }
      if (meta && event.key.toLowerCase() === "e") { event.preventDefault(); setMode(mode === "novel" ? "screenplay" : "novel"); return; }
      if (meta && event.key.toLowerCase() === "b") { event.preventDefault(); setSidebarCollapsed((v) => !v); return; }
      if (meta && event.key.toLowerCase() === "k") { event.preventDefault(); searchInputRef.current?.focus(); return; }
      if (event.key === "Escape") { setPendingPreview(null); setSearchReplaceOpen(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  /** P1-A/P0-B：渲染侧栏单个单元项（扁平列表与卷分组共用） */
  function renderUnitItem(unit: CreationUnit) {
    const q = searchQuery.trim().toLowerCase();
    const titleMatch = !q || unit.title.toLowerCase().includes(q) || String(unit.number).includes(q);
    const scenes = unit.screenplay?.scenes || [];
    const sceneMatch = (s: ScreenplayScene) => !q || s.location.toLowerCase().includes(q) || String(s.sceneNo).includes(q);
    const hasSceneMatch = scenes.some(sceneMatch);
    if (!titleMatch && !hasSceneMatch && q) return null;
    const expanded = expandedUnits[unit.id] || Boolean(q);
    return (
      <div key={unit.id} className="creation-sidebar-unit" draggable={mode === "novel"} onDragStart={mode === "novel" ? (e) => e.dataTransfer.setData("text/unit-id", unit.id) : undefined}>
        <div className={`creation-sidebar-item ${view === "unit" && activeUnitId === unit.id ? "active" : ""}`}>
          {mode === "screenplay" && scenes.length ? (
            <button className="icon-button subtle creation-sidebar-chevron" type="button" onClick={() => setExpandedUnits((cur) => ({ ...cur, [unit.id]: !cur[unit.id] }))} title={expanded ? (isZh ? "收起" : "Collapse") : (isZh ? "展开" : "Expand")}>
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : null}
          <button className="creation-sidebar-unit-btn" type="button" onClick={() => { setActiveUnitId(unit.id); setView("unit"); setUnitSubMode("manuscript"); }}>
            <span className="creation-sidebar-label">{mode === "novel" ? (isZh ? `第 ${unit.number} 章` : `Ch.${unit.number}`) : (isZh ? `第 ${unit.number} 集` : `Ep.${unit.number}`)} · {unit.title}</span>
            <span className={`creation-status-dot ${unit.status === "finalized" ? "finalized" : "draft"}`} />
          </button>
        </div>
        {/* PRD V1.0 §8.3：场次级目录 */}
        {mode === "screenplay" && expanded && scenes.length ? (
          <div className="creation-sidebar-scenes">
            {scenes.filter(sceneMatch).map((scene) => (
              <button key={scene.id} className={`creation-sidebar-scene ${activeSceneId === scene.id ? "active" : ""}`} type="button" draggable onDragStart={(e) => e.dataTransfer.setData("text/scene-id", scene.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const from = e.dataTransfer.getData("text/scene-id"); if (from) dragScene(from, scene.id); }} onClick={() => focusScene(scene.id)}>
                <GripVertical size={11} className="creation-drag-handle" />
                <span>{isZh ? "场" : "S"}{scene.sceneNo}｜{scene.interiorExterior}·{scene.location || "—"}·{scene.timeOfDay || "—"}</span>
                <span className={`creation-status-dot ${scene.status === "finalized" ? "finalized" : "draft"}`} />
              </button>
            ))}
            {/* PRD V1.0 §8.3：新建场 */}
            <button className="creation-sidebar-addscene" type="button" onClick={() => { setActiveUnitId(unit.id); setView("unit"); setUnitSubMode("manuscript"); queueMicrotask(() => createScene(null)); }}>
              <Plus size={12} />{isZh ? "新建场" : "Add scene"}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const docView = view === "background" || view === "characters" || view === "outline";
  const docMeta = view === "background" ? { key: "backgroundWorld" as const, zh: "背景及世界观", finalized: bgFinalized }
    : view === "characters" ? { key: "characterBible" as const, zh: "角色圣经", finalized: charFinalized }
    : view === "outline" ? { key: "plotOutline" as const, zh: "剧情及大纲", finalized: outlineFinalized }
    : null;

  return (
    <main className={`cosmic-page novel-workbench-page creation-v2-page creation-v3-page ${focusMode ? "focus-mode" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <header className="novel-topbar">
        <div className="novel-topbar-left">
          <button className="icon-button" type="button" onClick={() => router.push("/dashboard")} title={isZh ? "返回工作台" : "Back"}><ArrowLeft size={18} /></button>
          <div className="novel-title-block">
            <span>{isZh ? "创作工作台" : "Creation Workbench"}</span>
            <input aria-label={isZh ? "项目名称" : "Project title"} value={project.title} onChange={(event) => setProject((current) => ({ ...current, title: event.target.value }))} />
          </div>
        </div>
        <div className="novel-topbar-actions">
          {/* PRD V1.0 §7.5：成品版本下拉 + 状态指示 */}
          <div className="creation-version-select">
            <select value={mode} onChange={(event) => setMode(event.target.value as CreationMode)} title={isZh ? "成品版本" : "Version"}>
              <option value="screenplay">{isZh ? "剧本版" : "Screenplay"}</option>
              <option value="novel">{isZh ? "小说版" : "Novel"}</option>
            </select>
            <span className="creation-version-count" title={isZh ? "当前版本单元数" : "Units in this version"}>
              {track.units.length ? (mode === "novel" ? (isZh ? `${track.units.length} 章` : `${track.units.length} ch`) : (isZh ? `${track.units.length} 集` : `${track.units.length} ep`)) : (isZh ? "空" : "Empty")}
            </span>
            {!track.units.length ? <span className="creation-version-hint">{isZh ? "请先创建单元" : "Create a unit first"}</span> : null}
          </div>
          {/* PRD V1.0 §8.2：当前剧集状态 + 选择 */}
          {view === "unit" && activeUnit ? (
            <select className="creation-episode-select" value={activeUnitId} onChange={(event) => setActiveUnitId(event.target.value)}>
              {track.units.map((u) => <option key={u.id} value={u.id}>{mode === "novel" ? (isZh ? `第 ${u.number} 章` : `Ch.${u.number}`) : (isZh ? `第 ${u.number} 集` : `Ep.${u.number}`)} · {u.title}</option>)}
            </select>
          ) : null}
          {/* PRD V1.0 §11.2：保存状态三态 */}
          <span className={`creation-save-status ${saveStatus}`}>{saveStatus === "saving" ? (isZh ? "正在保存…" : "Saving…") : saveStatus === "saved" ? (isZh ? "已保存" : "Saved") : saveStatus === "error" ? (isZh ? "保存失败" : "Save failed") : ""}</span>
          {/* PRD V1.0 §8.5：专注写作模式 */}
          <button className="icon-button" type="button" onClick={() => setFocusMode((v) => !v)} title={isZh ? "专注模式" : "Focus"}>{focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          <button className={`icon-button ${aiPanelOpen ? "active" : ""}`} type="button" onClick={() => setAiPanelOpen((v) => !v)} title={isZh ? "AI 面板" : "AI panel"}><PanelRight size={18} /></button>
          {!session ? <button className="primary-button" type="button" onClick={() => setAuthOpen(true)}>{isZh ? "登录使用 AI" : "Sign in for AI"}</button> : null}
        </div>
      </header>

      <nav className="novel-mobile-tabs">
        <button className={mobilePanel === "chat" ? "active" : ""} type="button" onClick={() => setMobilePanel("chat")}>{isZh ? "对话" : "Chat"}</button>
        <button className={mobilePanel === "content" ? "active" : ""} type="button" onClick={() => setMobilePanel("content")}>{isZh ? "文档" : "Document"}</button>
      </nav>

      {error || status || busy ? <div className={`creation-notice ${error ? "error" : busy ? "warning" : "success"}`}>{error || (busy ? (isZh ? "处理中，请勿关闭页面…" : "Working…") : status)}</div> : null}
      {/* PRD V1.0 §8.5：AI 修改预览面板 */}
      {pendingPreview ? (
        <div className="creation-preview-bar">
          <div className="creation-preview-content">
            <strong>{isZh ? "AI 修改预览" : "AI Edit Preview"}</strong>
            {pendingPreview.kind === "episodeScript" && pendingPreview.screenplay ? (
              <div className="creation-preview-script">
                <p className="creation-preview-script-meta">
                  {isZh ? `本集剧本：《${pendingPreview.screenplay.title}》 · 共 ${pendingPreview.screenplay.scenes.length} 场` : `Episode script: ${pendingPreview.screenplay.title} · ${pendingPreview.screenplay.scenes.length} scenes`}
                </p>
                <ol className="creation-preview-script-scenes">
                  {pendingPreview.screenplay.scenes.map((sc) => (
                    <li key={sc.id}>{sc.interiorExterior}·{sc.location || "—"}·{sc.timeOfDay || "—"}<span className="creation-preview-script-count">（{sc.blocks.length} 段）</span></li>
                  ))}
                </ol>
              </div>
            ) : pendingPreview.kind === "modifyScene" && pendingPreview.originalText ? (
              <div className="creation-preview-diff">
                <div className="creation-preview-diff-col">
                  <span className="creation-preview-diff-label">{isZh ? "原内容" : "Original"}</span>
                  <pre className="creation-preview-original">{pendingPreview.originalText}</pre>
                </div>
                <div className="creation-preview-diff-col">
                  <span className="creation-preview-diff-label">{isZh ? "修改后" : "Proposed"}</span>
                  <pre className="creation-preview-proposed">{pendingPreview.proposedText}</pre>
                </div>
              </div>
            ) : (
              <pre>{pendingPreview.proposedText || (pendingPreview.scene ? `新场：${pendingPreview.scene.interiorExterior}·${pendingPreview.scene.location}·${pendingPreview.scene.timeOfDay}` : "")}</pre>
            )}
          </div>
          <div className="creation-preview-actions">
            <button className="primary-button" type="button" onClick={acceptPreview}><Check size={14} />{isZh ? "应用" : "Apply"}</button>
            <button className="secondary-button" type="button" onClick={rejectPreview}><X size={14} />{isZh ? "忽略" : "Dismiss"}</button>
          </div>
        </div>
      ) : null}
      {/* PRD V1.0 §7.2：资料理解摘要 */}
      {sourceComprehension && !sourceComprehension.confirmed ? (
        <div className="creation-comprehension-bar">
          <div className="creation-comprehension-content">
            <strong>{isZh ? "资料理解摘要" : "Source Comprehension"}</strong>
            <p>{sourceComprehension.summary}</p>
          </div>
          <button className="primary-button" type="button" onClick={confirmSourceComprehension}>{isZh ? "确认理解，进入背景生成" : "Confirm & proceed"}</button>
        </div>
      ) : null}

      <section className="creation-workbench-body">
        {/* 左侧集场目录 */}
        {sidebarCollapsed ? (
          <button className="creation-sidebar-expand" type="button" onClick={() => setSidebarCollapsed(false)} title={isZh ? "展开目录" : "Expand sidebar"}><ChevronRight size={16} /></button>
        ) : null}
        <aside className={`creation-sidebar ${mobilePanel === "content" ? "is-mobile-active" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}>
          <div className="creation-sidebar-top">
            {/* PRD V1.0 §8.3：搜索集/场 */}
            <div className="creation-sidebar-search">
              <Search size={14} />
              <input ref={searchInputRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={isZh ? (mode === "novel" ? "搜索章或卷" : "搜索集或场") : "Search"} />
            </div>
            <button className="icon-button subtle" type="button" onClick={() => setSidebarCollapsed((v) => !v)} title={isZh ? "收起目录" : "Collapse"}><ChevronLeft size={16} /></button>
          </div>
          <div className="creation-sidebar-group">
            <h3>{isZh ? "创作基座" : "Foundation"}</h3>
            <button className={`creation-sidebar-item ${view === "background" ? "active" : ""}`} type="button" onClick={() => setView("background")}>
              <span className="creation-sidebar-label">{isZh ? "背景及世界观" : "Background & World"}</span>
              <span className={`creation-status-dot ${bgFinalized ? "finalized" : "draft"}`} title={bgFinalized ? (isZh ? "已定稿" : "Finalized") : (isZh ? "草稿" : "Draft")} />
            </button>
            <button className={`creation-sidebar-item ${view === "characters" ? "active" : ""} ${!bgFinalized ? "disabled" : ""}`} type="button" disabled={!bgFinalized} onClick={() => bgFinalized && setView("characters")}>
              <span className="creation-sidebar-label">{isZh ? "角色圣经" : "Character Bible"}</span>
              <span className={`creation-status-dot ${charFinalized ? "finalized" : "draft"}`} />
            </button>
            <button className={`creation-sidebar-item ${view === "outline" ? "active" : ""} ${!charFinalized ? "disabled" : ""}`} type="button" disabled={!charFinalized} onClick={() => charFinalized && setView("outline")}>
              <span className="creation-sidebar-label">{isZh ? "剧情及大纲" : "Plot & Outline"}</span>
              <span className={`creation-status-dot ${outlineFinalized ? "finalized" : "draft"}`} />
            </button>
            {mode === "screenplay" ? (
              <button className={`creation-sidebar-item ${view === "episodePlan" ? "active" : ""} ${!outlineFinalized ? "disabled" : ""}`} type="button" disabled={!outlineFinalized} onClick={() => outlineFinalized && setView("episodePlan")}>
                <span className="creation-sidebar-label">{isZh ? "分集规划" : "Episode Plan"}</span>
                <span className={`creation-status-dot ${planFinalized ? "finalized" : track.episodePlan ? "draft" : "empty"}`} />
              </button>
            ) : null}
            {view === "outline" && track.arcs.length ? (
              <div className="creation-sidebar-sub">
                <button className="secondary-button creation-sidebar-sync" type="button" onClick={syncOutlineStructure}><Check size={14} />{isZh ? "同步结构到正文" : "Sync structure"}</button>
              </div>
            ) : null}
          </div>

          <div className="creation-sidebar-group creation-sidebar-units">
            <h3>
              <span>{isZh ? "正文" : "Manuscript"}</span>
              {mode === "novel" ? <button className="icon-button subtle" type="button" onClick={createArc} title={isZh ? "新建卷" : "Add volume"}><Plus size={14} /></button> : null}
              <button className="icon-button subtle" type="button" onClick={addUnit} title={isZh ? (mode === "novel" ? "新增章" : "新增集") : "Add unit"} disabled={mode === "screenplay" && !planFinalized}><Plus size={14} /></button>
            </h3>
            {mode === "screenplay" && !planFinalized ? <p className="creation-sidebar-hint">{isZh ? "分集规划定稿后可逐集生成剧本。" : "Finalize episode plan first."}</p> : null}
            {/* P1-A：小说版卷（arc）层级 */}
            {mode === "novel" && track.arcs.length ? (
              <>
                {track.arcs.map((arc) => {
                  const arcUnits = arc.unitIds.map((id) => track.units.find((u) => u.id === id)).filter(Boolean) as CreationUnit[];
                  const arcExpanded = expandedArcs[arc.id] !== false;
                  return (
                    <div key={arc.id} className="creation-sidebar-arc" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const uid = e.dataTransfer.getData("text/unit-id"); if (uid) moveUnitToArc(uid, arc.id); }}>
                      <div className="creation-sidebar-arc-head">
                        <button className="icon-button subtle" type="button" onClick={() => setExpandedArcs((cur) => ({ ...cur, [arc.id]: !arcExpanded }))} title={arcExpanded ? (isZh ? "收起" : "Collapse") : (isZh ? "展开" : "Expand")}>
                          {arcExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <input className="creation-arc-title" value={arc.title} onChange={(e) => renameArc(arc.id, e.target.value)} placeholder={isZh ? "卷标题" : "Volume title"} />
                      </div>
                      {arcExpanded ? arcUnits.map((u) => renderUnitItem(u)) : null}
                    </div>
                  );
                })}
                {(() => {
                  const inArc = new Set(track.arcs.flatMap((a) => a.unitIds));
                  const orphans = track.units.filter((u) => !inArc.has(u.id));
                  return orphans.length ? <div className="creation-sidebar-arc-orphans"><p className="creation-sidebar-hint">{isZh ? "未归入卷" : "Uncategorized"}</p>{orphans.map((u) => renderUnitItem(u))}</div> : null;
                })()}
              </>
            ) : (
              track.units.map((u) => renderUnitItem(u))
            )}
          </div>

          <div className="creation-sidebar-group creation-sidebar-foot">
            <button className={`creation-sidebar-item ${view === "export" ? "active" : ""}`} type="button" onClick={() => setView("export")}>
              <FileArchive size={15} /><span className="creation-sidebar-label">{isZh ? "导出交付" : "Export"}</span>
            </button>
          </div>
        </aside>

        {/* 中央整集连续编辑器 */}
        <section className={`creation-center ${mobilePanel === "content" ? "is-mobile-active" : ""}`}>
          <header className="creation-center-head">
            <div className="creation-center-title">
              {docView && docMeta ? (
                <>
                  <h2>{docMeta.zh}</h2>
                  <span className={`creation-status-pill ${docMeta.finalized ? "finalized" : "draft"}`}>{docMeta.finalized ? (isZh ? "已定稿" : "Finalized") : (isZh ? "草稿" : "Draft")}</span>
                </>
              ) : view === "episodePlan" ? (
                <>
                  <h2>{isZh ? "分集规划" : "Episode Plan"}</h2>
                  <span className={`creation-status-pill ${planFinalized ? "finalized" : track.episodePlan ? "draft" : "empty"}`}>{planFinalized ? (isZh ? "已定稿" : "Finalized") : track.episodePlan ? (isZh ? "草稿" : "Draft") : (isZh ? "未生成" : "Not generated")}</span>
                </>
              ) : view === "unit" && activeUnit ? (
                <>
                  <h2>{mode === "novel" ? (isZh ? `第 ${activeUnit.number} 章` : `Chapter ${activeUnit.number}`) : (isZh ? `第 ${activeUnit.number} 集` : `Episode ${activeUnit.number}`)} · {activeUnit.title}</h2>
                  <span className={`creation-status-pill ${activeUnit.status === "finalized" ? "finalized" : "draft"}`}>{activeUnit.status === "finalized" ? (isZh ? "已定稿" : "Finalized") : (isZh ? "草稿" : "Draft")}</span>
                </>
              ) : view === "export" ? (
                <h2>{isZh ? "导出交付" : "Export"}</h2>
              ) : <h2>{isZh ? "正文" : "Manuscript"}</h2>}
            </div>
            <div className="creation-center-actions">
              {docView && docMeta ? (
                <button className="primary-button" type="button" onClick={() => finalizeDoc(docMeta.key)}>
                  <Check size={15} />{docMeta.finalized ? (isZh ? "取消定稿并修改" : "Unfinalize & edit") : (isZh ? "定稿" : "Finalize")}
                </button>
              ) : null}
              {view === "episodePlan" && track.episodePlan ? (
                <button className="primary-button" type="button" onClick={finalizePlan}><Check size={15} />{planFinalized ? (isZh ? "取消定稿并修改" : "Unfinalize & edit") : (isZh ? "定稿分集规划" : "Finalize plan")}</button>
              ) : null}
              {view === "unit" && activeUnit ? (
                <button className="primary-button" type="button" onClick={toggleUnitFinalized}>
                  <Check size={15} />{activeUnit.status === "finalized" ? (isZh ? "取消定稿并修改" : "Unfinalize & edit") : (isZh ? "定稿正文" : "Finalize manuscript")}
                </button>
              ) : null}
              {view === "unit" && activeUnit ? (
                <button className="secondary-button" type="button" onClick={() => void openDownstream("production")} title={isZh ? "进入分镜制作" : "Storyboard"}><Clapperboard size={15} />{isZh ? "进入制作" : "Produce"}</button>
              ) : null}
              {/* PRD V1.0 验收 第二批：剧本版正文阶段 — 生成本集完整剧本主按钮 */}
              {view === "unit" && activeUnit && mode === "screenplay" && unitSubMode === "manuscript" ? (
                <button className="primary-button" type="button" onClick={() => void generateEpisodeScript()} disabled={busy} title={isZh ? "基于背景/角色/大纲+本集规划生成完整剧本" : "Generate full episode script"}>
                  <Sparkles size={15} />{isZh ? "生成本集完整剧本" : "Generate episode script"}
                </button>
              ) : null}
              {view === "unit" && activeUnit ? (
                <>
                  <button className="secondary-button" type="button" onClick={() => setSearchReplaceOpen((v) => !v)} title={isZh ? "搜索替换" : "Find & replace"}><Replace size={15} />{isZh ? "替换" : "Replace"}</button>
                  {mode === "screenplay" && activeUnit.screenplay ? (
                    <button className="secondary-button" type="button" onClick={runFormatCheck} disabled={busy} title={isZh ? "格式检查" : "Format check"}><Check size={15} />{isZh ? "格式检查" : "Check"}</button>
                  ) : null}
                </>
              ) : null}
            </div>
          </header>

          <div className="creation-center-scroll">
            {/* P1-B：整集搜索与替换 */}
            {searchReplaceOpen && view === "unit" && activeUnit ? (
              <div className="creation-search-replace">
                <div className="creation-search-replace-row">
                  <input value={searchFind} onChange={(event) => setSearchFind(event.target.value)} placeholder={isZh ? "查找" : "Find"} />
                  <input value={searchReplaceText} onChange={(event) => setSearchReplaceText(event.target.value)} placeholder={isZh ? "替换为" : "Replace with"} />
                </div>
                <div className="creation-search-replace-actions">
                  <button className="secondary-button" type="button" disabled={!searchFind.trim()} onClick={() => replaceInUnit(searchFind, searchReplaceText, false)}>{isZh ? "替换" : "Replace"}</button>
                  <button className="primary-button" type="button" disabled={!searchFind.trim()} onClick={() => replaceInUnit(searchFind, searchReplaceText, true)}>{isZh ? "全部替换" : "Replace all"}</button>
                  <button className="icon-button" type="button" onClick={() => setSearchReplaceOpen(false)} title={isZh ? "关闭" : "Close"}><X size={14} /></button>
                </div>
              </div>
            ) : null}
            {/* P1-D：剧本格式检查结果 */}
            {formatIssues.length > 0 && view === "unit" ? (
              <div className="creation-format-issues">
                <header><strong>{isZh ? "格式检查结果" : "Format issues"}</strong><button className="icon-button" type="button" onClick={() => setFormatIssues([])} title={isZh ? "关闭" : "Close"}><X size={14} /></button></header>
                <ul>{formatIssues.map((issue, idx) => <li key={idx} className={`creation-format-issue creation-format-issue-${issue.level}`}><span className="creation-format-issue-icon">{issue.level === "error" ? "✕" : issue.level === "warn" ? "!" : "·"}</span>{issue.message}</li>)}</ul>
              </div>
            ) : null}
            {/* 创作基座文档编辑器 */}
            {docView ? (
              <>
                {/* PRD V1.0 验收 第三批/P1-05：结构化字段模板提示卡 */}
                <div className="creation-doc-templates">
                  <span className="creation-doc-templates-label">{isZh ? "字段模板：" : "Field templates:"}</span>
                  <div className="creation-doc-templates-chips">
                    {(DOC_FIELD_TEMPLATES[view as "background" | "characters" | "outline"] || []).map((field) => (
                      <button key={field.zh} className="creation-doc-template-chip" type="button" onClick={() => insertFieldTemplate(isZh ? field.zh : field.en)} title={isZh ? `插入「${field.zh}」` : `Insert "${field.en}"`}>
                        {isZh ? field.zh : field.en}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea ref={docEditorRef} className="novel-main-editor creation-markdown-editor creation-doc-editor" value={editorValue()} onChange={(event) => editValue(event.target.value)} placeholder={isZh ? "在这里描述你的故事背景、世界观、主角设定…点击上方字段模板开始，或直接输入。定稿后下游将锁定，修改会自动降级。" : "Describe your story world, characters… Click a field template above to start, or type directly. Finalizing locks downstream; edits downgrade automatically."} />
              </>
            ) : null}

            {/* 分集规划 */}
            {view === "episodePlan" ? (
              <div className="creation-plan-panel">
                {!track.episodePlan ? (
                  <div className="creation-plan-empty">
                    <p>{isZh ? "大纲定稿后，点击右侧 AI 生成生成分集规划。" : "Finalize the outline, then use AI Generate to create the episode plan."}</p>
                    <button className="primary-button" type="button" disabled={busy || !canGenerateEpisodePlan(workspace)} onClick={() => void generateEpisodePlan()}><Sparkles size={15} />{isZh ? "生成分集规划" : "Generate episode plan"}</button>
                  </div>
                ) : (
                  <>
                    <div className="creation-plan-meta">{isZh ? `共 ${track.episodePlan.totalEpisodes} 集 · ${track.episodePlan.items.length} 条规划` : `${track.episodePlan.totalEpisodes} episodes · ${track.episodePlan.items.length} items`}</div>
                    {track.episodePlan.items.map((item) => (
                      <article className="creation-plan-item" key={item.episodeNo}>
                        <header>
                          <strong>{isZh ? `第 ${item.episodeNo} 集` : `Episode ${item.episodeNo}`}</strong>
                          {planFinalized ? <span className="creation-plan-item-title">{item.title}</span> : (
                            <input className="creation-plan-edit-title" value={item.title} onChange={(e) => editEpisodePlanItem(item.episodeNo, { title: e.target.value })} placeholder={isZh ? "集标题" : "Episode title"} />
                          )}
                        </header>
                        {planFinalized ? (
                          <dl>
                            <dt>{isZh ? "核心事件" : "Core event"}</dt><dd>{item.coreEvent || "—"}</dd>
                            <dt>{isZh ? "主角目标" : "Main goal"}</dt><dd>{item.mainGoal || "—"}</dd>
                            <dt>{isZh ? "冲突" : "Conflict"}</dt><dd>{item.conflict || "—"}</dd>
                            <dt>{isZh ? "场次" : "Scenes"}</dt><dd>{item.sceneCount}</dd>
                          </dl>
                        ) : (
                          <dl className="creation-plan-edit-grid">
                            <dt>{isZh ? "核心事件" : "Core event"}</dt>
                            <dd><textarea value={item.coreEvent} onChange={(e) => editEpisodePlanItem(item.episodeNo, { coreEvent: e.target.value })} placeholder={isZh ? "本集核心事件" : "Core event"} rows={2} /></dd>
                            <dt>{isZh ? "主角目标" : "Main goal"}</dt>
                            <dd><textarea value={item.mainGoal} onChange={(e) => editEpisodePlanItem(item.episodeNo, { mainGoal: e.target.value })} placeholder={isZh ? "主角目标" : "Main goal"} rows={2} /></dd>
                            <dt>{isZh ? "冲突" : "Conflict"}</dt>
                            <dd><textarea value={item.conflict} onChange={(e) => editEpisodePlanItem(item.episodeNo, { conflict: e.target.value })} placeholder={isZh ? "冲突" : "Conflict"} rows={2} /></dd>
                            <dt>{isZh ? "场次" : "Scenes"}</dt>
                            <dd><input type="number" min={0} value={item.sceneCount} onChange={(e) => editEpisodePlanItem(item.episodeNo, { sceneCount: Number(e.target.value) || 0 })} /></dd>
                          </dl>
                        )}
                        {item.sceneOutlines.length ? (
                          <ol className="creation-plan-scenes">{item.sceneOutlines.map((outline, idx) => <li key={idx}>{outline}</li>)}</ol>
                        ) : null}
                      </article>
                    ))}
                  </>
                )}
              </div>
            ) : null}

            {/* 单元编辑器 */}
            {view === "unit" && activeUnit ? (
              <>
                {/* PRD V1.0 验收 P1-04：主路径只留「正文」，翻译/本土化收进「更多工具」 */}
                <div className="creation-unit-subtabs">
                  <button className={unitSubMode === "manuscript" ? "active" : ""} type="button" onClick={() => setUnitSubMode("manuscript")}>{isZh ? "正文" : "Manuscript"}</button>
                  <button className={`creation-more-tools-trigger ${moreToolsOpen ? "open" : ""} ${unitSubMode !== "manuscript" ? "active" : ""}`} type="button" onClick={() => setMoreToolsOpen((v) => !v)} title={isZh ? "更多工具" : "More tools"} aria-expanded={moreToolsOpen}>
                    {isZh ? "更多工具" : "More"}<ChevronDown size={13} />
                  </button>
                  {moreToolsOpen ? (
                    <div className="creation-more-tools-menu" role="menu">
                      <button type="button" className={unitSubMode === "translation" ? "active" : ""} onClick={() => { setUnitSubMode("translation"); setMoreToolsOpen(false); }} role="menuitem">{isZh ? "翻译" : "Translation"}</button>
                      <button type="button" className={unitSubMode === "localization" ? "active" : ""} onClick={() => { setUnitSubMode("localization"); setMoreToolsOpen(false); }} role="menuitem">{isZh ? "本土化及雷同查验" : "Localization & Similarity"}</button>
                    </div>
                  ) : null}
                </div>

                {unitSubMode === "manuscript" ? (
                  mode === "screenplay" && activeUnit.screenplay && activeUnit.screenplay.scenes.length ? (
                    <div className="creation-scene-editor">
                      {/* P1-F：多场批量操作工具栏 */}
                      {Object.values(selectedScenes).some(Boolean) ? (
                        <div className="creation-batch-bar">
                          <span className="creation-batch-count">{isZh ? `已选 ${Object.values(selectedScenes).filter(Boolean).length} 场` : `${Object.values(selectedScenes).filter(Boolean).length} selected`}</span>
                          <button className="secondary-button" type="button" onClick={batchFinalizeScenes}><Check size={13} />{isZh ? "定稿" : "Finalize"}</button>
                          <button className="secondary-button" type="button" onClick={() => batchSetInterior("INT")}>INT</button>
                          <button className="secondary-button" type="button" onClick={() => batchSetInterior("EXT")}>EXT</button>
                          <button className="secondary-button" type="button" onClick={batchDeleteScenes}><X size={13} />{isZh ? "删除" : "Delete"}</button>
                          <button className="icon-button" type="button" onClick={() => setSelectedScenes({})} title={isZh ? "取消选择" : "Clear"}><X size={14} /></button>
                        </div>
                      ) : null}
                      {activeUnit.screenplay.scenes.map((scene) => (
                        <article className={`creation-scene-card ${scene.status === "finalized" ? "finalized" : "draft"}`} key={scene.id} data-scene-id={scene.id}>
                          <header className="creation-scene-head">
                            <input type="checkbox" className="creation-scene-select" checked={Boolean(selectedScenes[scene.id])} onChange={(event) => setSelectedScenes((cur) => ({ ...cur, [scene.id]: event.target.checked }))} title={isZh ? "选择本场" : "Select"} />
                            <span className="creation-scene-no">{isZh ? "场" : "S"}{scene.sceneNo}</span>
                            <select className="creation-scene-ie" value={scene.interiorExterior} onChange={(event) => updateSceneHeader(scene.id, { interiorExterior: event.target.value as ScreenplayScene["interiorExterior"] })}>
                              <option value="INT">INT</option><option value="EXT">EXT</option><option value="INT/EXT">INT/EXT</option>
                            </select>
                            <input className="creation-scene-loc" value={scene.location} onChange={(event) => updateSceneHeader(scene.id, { location: event.target.value })} placeholder={isZh ? "地点" : "Location"} />
                            <input className="creation-scene-time" value={scene.timeOfDay} onChange={(event) => updateSceneHeader(scene.id, { timeOfDay: event.target.value })} placeholder={isZh ? "时间" : "Time"} />
                            <button className={`creation-scene-finalize ${scene.status === "finalized" ? "finalized" : ""}`} type="button" onClick={() => toggleSceneFinalized(scene.id)} title={scene.status === "finalized" ? (isZh ? "取消定稿" : "Unfinalize") : (isZh ? "定稿本场" : "Finalize scene")}>
                              {scene.status === "finalized" ? <Lock size={13} /> : <Check size={13} />}
                            </button>
                            <button className="icon-button subtle creation-scene-delete" type="button" onClick={() => { if (window.confirm(isZh ? "确认删除本场？删除后不可撤销。" : "Delete this scene? This cannot be undone.")) removeScene(scene.id); }} title={isZh ? "删除场" : "Delete scene"}><X size={13} /></button>
                            <button className="icon-button subtle creation-scene-ai" type="button" onClick={() => void aiModifyScene(scene.id)} disabled={busy} title={isZh ? "AI 改写本场" : "AI rewrite scene"}><Sparkles size={13} /></button>
                          </header>
                          <div className="creation-scene-chars">{scene.characters.map((c) => <span key={c} className="creation-char-chip">{c}</span>)}</div>
                          <div className="creation-block-list">
                            {scene.blocks.map((block) => (
                              <div className={`creation-block creation-block-${block.type}`} key={block.id}>
                                <div className="creation-block-head">
                                  <select className="creation-block-type" value={block.type} onChange={(event) => editSceneBlock(scene.id, block.id, { type: event.target.value as ScreenplayBlock["type"] })} title={isZh ? "段落类型" : "Block type"}>
                                    <option value="action">{isZh ? "动作" : "Action"}</option>
                                    <option value="dialogue">{isZh ? "对白" : "Dialogue"}</option>
                                    <option value="parenthetical">{isZh ? "括号提示" : "Parenthetical"}</option>
                                    <option value="transition">{isZh ? "转场" : "Transition"}</option>
                                    <option value="note">{isZh ? "备注" : "Note"}</option>
                                  </select>
                                  {block.type === "dialogue" ? (
                                    <input className="creation-block-character" value={block.character} onChange={(event) => editSceneBlock(scene.id, block.id, { character: event.target.value })} placeholder={isZh ? "角色名" : "Character"} />
                                  ) : null}
                                  <button className="icon-button subtle creation-block-remove" type="button" onClick={() => removeBlock(scene.id, block.id)} title={isZh ? "删除块" : "Remove block"}><X size={12} /></button>
                                </div>
                                <textarea className="creation-block-text" value={block.text} onChange={(event) => editSceneBlock(scene.id, block.id, { text: event.target.value })} rows={block.type === "transition" ? 1 : 2} placeholder={block.type === "dialogue" ? (isZh ? "对白内容" : "Dialogue") : block.type === "parenthetical" ? (isZh ? "提示内容（无需括号）" : "Parenthetical (no parens)") : isZh ? "正文" : "Text"} />
                              </div>
                            ))}
                          </div>
                          <button className="creation-block-add" type="button" onClick={() => appendBlock(scene.id)}><Plus size={12} />{isZh ? "新增内容块" : "Add block"}</button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <textarea className="novel-main-editor creation-markdown-editor creation-doc-editor" value={activeUnit.content} onChange={(event) => editValue(event.target.value)} placeholder={isZh ? `当前${mode === "novel" ? "章" : "集"}正文。定稿后修改会自动降级为草稿。` : "Manuscript for this unit. Edits after finalizing downgrade to draft."} />
                  )
                ) : null}

                {unitSubMode === "translation" ? (
                  <div className="creation-translation-editors">
                    <section>
                      <header><strong>{isZh ? "原文" : "Source"}</strong><span>{mode === "screenplay" ? workspace.settings.screenplayLanguage : workspace.settings.sourceLanguage}</span></header>
                      <textarea className="novel-main-editor creation-markdown-editor" value={buildTranslationSource(workspace, mode, activeUnit)} readOnly aria-label={isZh ? "翻译原文" : "Translation source"} />
                    </section>
                    <section>
                      <header><strong>{isZh ? "译文" : "Translation"}</strong><span>{workspace.settings.translationLanguage || (isZh ? "未选择语言" : "No language")}</span></header>
                      <textarea className="novel-main-editor creation-markdown-editor" value={activeUnit.translation} onChange={(event) => editValue(event.target.value)} placeholder={isZh ? "选择翻译语言后生成，或直接编辑译文。" : "Select a language to generate, or edit directly."} />
                    </section>
                  </div>
                ) : null}

                {unitSubMode === "localization" ? (
                  <>
                    <div className="creation-segmented creation-localization-tabs">
                      <button className={localizationView === "content" ? "active" : ""} type="button" onClick={() => setLocalizationView("content")}>{isZh ? "本土化后内容" : "Localized"}</button>
                      <button className={localizationView === "changes" ? "active" : ""} type="button" onClick={() => setLocalizationView("changes")}>{isZh ? "修改留痕" : "Changes"}</button>
                      <button className={localizationView === "similarity" ? "active" : ""} type="button" onClick={() => setLocalizationView("similarity")}>{isZh ? "雷同查验" : "Similarity"}</button>
                    </div>
                    <textarea className="novel-main-editor creation-markdown-editor creation-doc-editor" value={editorValue()} onChange={(event) => editValue(event.target.value)} />
                  </>
                ) : null}

                <details className="creation-unit-meta">
                  <summary>{isZh ? "连续性备注 / 语言设定" : "Continuity & language"}</summary>
                  <label>{isZh ? "连续性备注" : "Continuity notes"}<textarea value={activeUnit.continuityNotes || ""} onChange={(event) => updateUnit({ continuityNotes: event.target.value })} /></label>
                  {mode === "screenplay" ? (
                    <div className="creation-lang-row">
                      <label>{isZh ? "剧本语言" : "Screenplay language"}<select value={workspace.settings.screenplayLanguage} onChange={(event) => updateWorkspace((current) => ({ ...current, settings: { ...current.settings, screenplayLanguage: event.target.value } }))}>{LANGUAGE_OPTIONS.map((l) => <option key={l}>{l}</option>)}</select></label>
                      <label>{isZh ? "对话语言" : "Dialogue language"}<select value={workspace.settings.dialogueLanguage} onChange={(event) => updateWorkspace((current) => ({ ...current, settings: { ...current.settings, dialogueLanguage: event.target.value } }))}>{LANGUAGE_OPTIONS.map((l) => <option key={l}>{l}</option>)}</select></label>
                      <label>{isZh ? "剧本格式" : "Format"}<select value={workspace.settings.screenplayFormat} onChange={(event) => updateWorkspace((current) => ({ ...current, settings: { ...current.settings, screenplayFormat: event.target.value as ScreenplayFormat } }))}><option value="international_production">International</option><option value="hollywood_spec">Hollywood</option><option value="asian_production">Asian</option></select></label>
                    </div>
                  ) : (
                    <div className="creation-lang-row">
                      <label>{isZh ? "正文语言" : "Manuscript language"}<select value={workspace.settings.sourceLanguage} onChange={(event) => updateWorkspace((current) => ({ ...current, settings: { ...current.settings, sourceLanguage: event.target.value } }))}>{LANGUAGE_OPTIONS.map((l) => <option key={l}>{l}</option>)}</select></label>
                      <label>{isZh ? "翻译语言（可选）" : "Translation (optional)"}<select value={workspace.settings.translationLanguage} onChange={(event) => updateWorkspace((current) => ({ ...current, settings: { ...current.settings, translationLanguage: event.target.value, translationEnabled: Boolean(event.target.value) } }))}><option value="">{isZh ? "不翻译" : "None"}</option>{LANGUAGE_OPTIONS.map((l) => <option key={l}>{l}</option>)}</select></label>
                    </div>
                  )}
                  <div className="creation-universe-actions">
                    <button className="secondary-button" type="button" disabled={universeBusy} onClick={() => void createAndLinkUniverse()}><Plus size={14} />{isZh ? "创建 Universe" : "Create Universe"}</button>
                    {universes.length ? <><select value={selectedUniverseId} onChange={(event) => setSelectedUniverseId(event.target.value)}>{universes.map((u) => <option value={u.id} key={u.id}>{u.name}</option>)}</select><button className="secondary-button" type="button" onClick={() => void linkUniverse()}><Link2 size={14} />{isZh ? "关联" : "Link"}</button></> : null}
                    <button className="secondary-button" type="button" disabled={!project.universeId} onClick={() => void sendUniverseInbox()}><Send size={14} />Inbox</button>
                    <button className="secondary-button" type="button" onClick={() => void openDownstream("art")}><Palette size={14} />{isZh ? "美术台" : "Art"}</button>
                  </div>
                </details>
              </>
            ) : null}

            {/* 导出 */}
            {view === "export" ? (
              <div className="creation-export-panel">
                {/* ① 当前集导出 */}
                <section className="creation-export-tier">
                  <h3>{isZh ? "① 当前集导出" : "① Current unit"}</h3>
                  <p>{isZh ? `导出当前正在编辑的${mode === "novel" ? "章" : "集"}，文件名含${mode === "novel" ? "章" : "集"}号。` : "Export the unit currently being edited."}</p>
                  <div className="creation-export-tier-actions">
                    <button className="primary-button" type="button" disabled={!activeUnit} onClick={() => { if (activeUnit) downloadMarkdown(unitToDocument(activeUnit), `${project.title}-${mode === "novel" ? "ch" : "ep"}-${activeUnit.number}`); }}><Download size={15} />{isZh ? "当前集 MD" : "MD"}</button>
                    <button className="secondary-button" type="button" disabled={!activeUnit} onClick={() => { if (activeUnit) void downloadDocx(unitToDocument(activeUnit), `${project.title}-${mode === "novel" ? "ch" : "ep"}-${activeUnit.number}`); }}><Download size={15} />{isZh ? "当前集 DOCX" : "DOCX"}</button>
                  </div>
                </section>

                {/* ② 多集批量导出 */}
                <section className="creation-export-tier">
                  <h3>{isZh ? "② 多集批量导出" : "② Batch export"}</h3>
                  <p>{isZh ? `勾选要导出的${mode === "novel" ? "章" : "集"}，批量下载。` : "Select units to export in batch."}</p>
                  <div className="creation-export-batch">
                    {track.units.map((u) => (
                      <label key={u.id} className="creation-export-check">
                        <input type="checkbox" checked={Boolean(exportSelection[u.id])} onChange={(event) => setExportSelection((cur) => ({ ...cur, [u.id]: event.target.checked }))} />
                        <span>{mode === "novel" ? (isZh ? `第 ${u.number} 章` : `Ch.${u.number}`) : (isZh ? `第 ${u.number} 集` : `Ep.${u.number}`)} · {u.title}</span>
                        <span className={`creation-export-badge ${u.status === "finalized" ? "finalized" : "draft"}`}>{u.status === "finalized" ? (isZh ? "定稿" : "Final") : (isZh ? "草稿" : "Draft")}</span>
                      </label>
                    ))}
                  </div>
                  {(() => {
                    const selectedUnits = track.units.filter((u) => exportSelection[u.id]);
                    const hasDraft = selectedUnits.some((u) => u.status !== "finalized");
                    const hasAny = selectedUnits.length > 0;
                    return hasAny && hasDraft ? (
                      <p className="creation-export-warning">{isZh ? "⚠ 含草稿内容，导出前请确认。" : "⚠ Contains draft content, please confirm before export."}</p>
                    ) : null;
                  })()}
                  <div className="creation-export-tier-actions">
                    <button className="primary-button" type="button" disabled={!Object.values(exportSelection).some(Boolean)} onClick={() => track.units.filter((u) => exportSelection[u.id]).forEach((u) => downloadMarkdown(unitToDocument(u), `${project.title}-${mode === "novel" ? "ch" : "ep"}-${u.number}`))}><Download size={15} />{isZh ? "批量 MD" : "Batch MD"}</button>
                    <button className="secondary-button" type="button" disabled={!Object.values(exportSelection).some(Boolean)} onClick={() => void Promise.all(track.units.filter((u) => exportSelection[u.id]).map((u) => downloadDocx(unitToDocument(u), `${project.title}-${mode === "novel" ? "ch" : "ep"}-${u.number}`)))}><Download size={15} />{isZh ? "批量 DOCX" : "Batch DOCX"}</button>
                  </div>
                </section>

                {/* ③ 完整交付包 */}
                <section className="creation-export-tier">
                  <h3>{isZh ? "③ 完整交付包" : "③ Complete delivery"}</h3>
                  <p>{isZh ? "导出整个工作包（含背景/角色/大纲/全部正文）。" : "Export the complete work package."}</p>
                  <div className="creation-export-tier-actions">
                    <button className="primary-button" type="button" onClick={() => void downloadDeliveryZip(deliveryItems, `${project.title}-complete-delivery`)}><Download size={16} />{isZh ? "完整交付包 ZIP" : "Complete ZIP"}</button>
                  </div>
                </section>

                {/* 交付清单明细 */}
                <div className="creation-export-head"><div><FileArchive size={20} /><h2>{isZh ? "交付文件清单" : "Delivery manifest"}</h2></div></div>
                {deliveryItems.map((item) => <article className="creation-export-row" key={item.id}><div><FileText size={18} /><span><strong>{item.label}</strong><small>{item.baseFilename}</small></span></div><div><button className="secondary-button" type="button" onClick={() => downloadMarkdown(item.document, item.baseFilename)}>MD</button><button className="secondary-button" type="button" onClick={() => void downloadDocx(item.document, item.baseFilename)}>DOCX</button></div></article>)}
              </div>
            ) : null}
          </div>
        </section>

        {/* 按需 AI 面板（默认收起） */}
        {aiPanelOpen ? (
          <aside className={`creation-ai-panel ${mobilePanel === "chat" ? "is-mobile-active" : ""}`}>
            <ChatFocusFrame
              label={isZh ? "创作对话" : "Creation chat"}
              title={isZh ? "专注创作" : "Focus writing"}
              toggleLabel={isZh ? "专注创作" : "Focus writing"}
              exitLabel={isZh ? "退出专注" : "Exit focus"}
            >
            <header className="creation-ai-head">
              <div><span>KIiKIS AI</span><h2>{isZh ? "和 KK 一起创作" : "Create with KK"}</h2></div>
              <button className="icon-button" type="button" onClick={() => setAiPanelOpen(false)} title={isZh ? "收起" : "Collapse"}><X size={16} /></button>
            </header>

            <details className="creation-project-settings">
              <summary>{isZh ? "项目与语言设定" : "Project & language settings"}</summary>
              <label>{isZh ? "故事想法" : "Story idea"}<textarea value={project.idea} onChange={(event) => setProject((current) => ({ ...current, idea: event.target.value }))} /></label>
              <label>{isZh ? "目标市场（待确认可留空）" : "Target market (optional)"}<input value={workspace.settings.targetMarket} onChange={(event) => updateWorkspace((current) => ({ ...current, settings: { ...current.settings, targetMarket: event.target.value } }))} /></label>
              <label>{isZh ? "题材（待确认可留空）" : "Genre (optional)"}<input value={workspace.settings.genre} onChange={(event) => updateWorkspace((current) => ({ ...current, settings: { ...current.settings, genre: event.target.value } }))} /></label>
              <label>{isZh ? "作品主要语言" : "Primary work language"}<select value={workspace.settings.sourceLanguage} onChange={(event) => updateWorkspace((current) => ({ ...current, settings: { ...current.settings, sourceLanguage: event.target.value } }))}>{LANGUAGE_OPTIONS.map((language) => <option key={language}>{language}</option>)}</select></label>
            </details>

            <div className="novel-chat-thread" aria-live="polite">
              {messages.map((item) => <article className={`novel-chat-message ${item.role}`} key={item.id}><span>{item.role === "assistant" ? "Kiikis AI" : (isZh ? "我" : "Me")}</span><p>{item.content}</p></article>)}
            </div>

            <div className="novel-source-bar">
              <button className="secondary-button" type="button" disabled={uploading} onClick={() => sourceInput.current?.click()}><Upload size={15} />{uploading ? (isZh ? "读取中" : "Reading") : (isZh ? "上传资料" : "Upload")}</button>
              <div className="novel-source-files">{sourceFiles.map((file) => <span key={file.id}><FileText size={13} />{file.name}</span>)}</div>
              <input hidden multiple ref={sourceInput} type="file" accept=".txt,.md,.doc,.docx,.html,.csv" onChange={uploadSources} />
            </div>

            <div className="novel-chat-composer">
              {/* PRD V1.0 §8.5 / 验收 P1-03：AI 输入作用范围按阶段切换 */}
              <div className="creation-segmented creation-ai-scope" role="group" aria-label={isZh ? "AI 作用范围" : "AI scope"}>
                {view === "background" || view === "characters" || view === "outline" ? (
                  <>
                    <button className={aiScope === "stage" ? "active" : ""} type="button" onClick={() => setAiScope("stage")} title={isZh ? "当前阶段文档" : "Current stage"}>{isZh ? "当前阶段" : "Stage"}</button>
                    <button className={aiScope === "materials" ? "active" : ""} type="button" onClick={() => setAiScope("materials")} title={isZh ? "全部上传资料" : "All materials"}>{isZh ? "全部资料" : "Materials"}</button>
                  </>
                ) : view === "episodePlan" ? (
                  <>
                    <button className={aiScope === "plan" ? "active" : ""} type="button" onClick={() => setAiScope("plan")} title={isZh ? "当前分集规划" : "Current episode plan"}>{isZh ? "当前规划" : "Plan"}</button>
                    <button className={aiScope === "materials" ? "active" : ""} type="button" onClick={() => setAiScope("materials")} title={isZh ? "全部上传资料" : "All materials"}>{isZh ? "全部资料" : "Materials"}</button>
                  </>
                ) : (
                  <>
                    <button className={aiScope === "episode" ? "active" : ""} type="button" onClick={() => setAiScope("episode")} title={isZh ? "整集" : "Episode"}>{isZh ? "整集" : "Episode"}</button>
                    <button className={aiScope === "scene" ? "active" : ""} type="button" onClick={() => setAiScope("scene")} title={isZh ? "当前场" : "Scene"}>{isZh ? "当前场" : "Scene"}</button>
                    <button className={aiScope === "selection" ? "active" : ""} type="button" onClick={() => setAiScope("selection")} title={isZh ? "选中文字" : "Selection"}>{isZh ? "选中" : "Selection"}</button>
                  </>
                )}
              </div>
              <textarea ref={chatInputRef} value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void sendChat(); } }} placeholder={isZh ? "输入想法、修改意见。⌘/Ctrl+Enter 发送。" : "Share ideas. Cmd/Ctrl+Enter to send."} />
              <div className="novel-chat-actions">
                <button className="secondary-button" type="button" disabled={!chatInput.trim() || busy} onClick={() => void sendChat()}><Send size={15} />{isZh ? "发送" : "Send"}</button>
                {view === "unit" && mode === "screenplay" && unitSubMode === "manuscript" ? (
                  // PRD V1.0 验收 第二批：剧本正文阶段禁用通用生成，引导用「生成本集完整剧本」主按钮
                  <span className="creation-ai-hint" title={isZh ? "请使用上方「生成本集完整剧本」按钮" : "Use the Generate episode script button above"}>
                    {isZh ? "用上方按钮生成剧本" : "Use the script button above"}
                  </span>
                ) : view !== "export" ? (
                  <button className="primary-button" type="button" disabled={busy} onClick={() => void generateStage()}><Sparkles size={15} />{isZh ? "生成/更新当前阶段" : "Generate"}</button>
                ) : null}
              </div>
            </div>
            </ChatFocusFrame>
          </aside>
        ) : null}
      </section>
      <AuthModal open={authOpen} mode="signin" onClose={() => setAuthOpen(false)} />
    </main>
  );
}
