"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Clapperboard,
  Download,
  FileArchive,
  FileText,
  Link2,
  Lock,
  Palette,
  Plus,
  Save,
  Send,
  Sparkles,
  Upload,
} from "lucide-react";
import { AuthModal } from "@/components/layout/AuthModal";
import { readByoApiConfig } from "@/lib/ai/byoClient";
import type { TaskType } from "@/lib/ai/prompts";
import { buildDeliveryManifest } from "@/lib/creation/assembly";
import { downloadDeliveryZip, downloadDocx, downloadMarkdown } from "@/lib/creation/downloads";
import { applyUnitGeneration, parseArcStructure, parseBatchUnitOutput } from "@/lib/creation/parsers";
import { buildTranslationSource, renderScreenplayEpisode } from "@/lib/creation/screenplay";
import { applyUnitTranslation, createCreationWorkspace, normalizeCreationWorkspace } from "@/lib/creation/state";
import type {
  CreationArc,
  CreationMode,
  CreationUnit,
  CreationWorkspaceV2,
  ScreenplayFormat,
} from "@/lib/creation/types";
import { buildCreativeHandoffPackage, writeCreativeHandoff } from "@/lib/creative-handoff";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  DEFAULT_PROJECT_GROUP,
  createNovelProject,
  readProjectsFromStorage,
  upsertProject,
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
type MobilePanel = "chat" | "content";
type ChatMessage = { id: string; role: "user" | "assistant"; content: string };
type SourceFile = { id: string; name: string; text: string };
type LocalizationView = "content" | "changes" | "similarity";

const AI_TIMEOUT = 120_000;
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

function welcome(isZh: boolean) {
  return isZh
    ? "尊敬的创作者大人，我是您的创作助理 KK。在开始前，请告诉我：想创作什么题材、发布平台、作品语言、目标读者，以及是否已有名字。也可以直接上传剧本、背景设定或角色资料，我们一起从背景及世界观开始。"
    : "Dear creator, I am KK, your creation assistant. Tell me the genre, publishing platform, work language, target audience, and whether you have a title. You can also upload a script, world brief, or character notes, and we will begin with Background & World.";
}

function message(role: ChatMessage["role"], content: string, id = crypto.randomUUID()): ChatMessage {
  return { id, role, content };
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
    status: unit.status,
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

export function CreationWorkbench() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [project, setProject] = useState<DramaProject>(() => freshProject());
  const [session, setSession] = useState<Session | null>(null);
  const [stage, setStage] = useState<StageKey>("background");
  const [activeUnitId, setActiveUnitId] = useState("");
  const [activeArcId, setActiveArcId] = useState("");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([message("assistant", welcome(true), "welcome")]);
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
  const projectRef = useRef(project);
  projectRef.current = project;

  const workspace = project.creationWorkspace || createCreationWorkspace(project);
  const mode = workspace.settings.activeMode;
  const track = workspace[mode];
  const activeUnit = track.units.find((unit) => unit.id === activeUnitId) || track.units[0] || null;
  const activeArc = track.arcs.find((arc) => arc.id === activeArcId) || track.arcs[0] || null;
  const deliveryItems = useMemo(() => buildDeliveryManifest({ title: project.title }, workspace), [project.title, workspace]);

  useEffect(() => {
    setMessages((current) => current.map((item) => item.id === "welcome" ? message("assistant", welcome(isZh), "welcome") : item));
  }, [isZh]);

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

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const projectId = searchParams.get("projectId");
    const forceNew = searchParams.get("new") === "1";
    const urlSourceUnitId = searchParams.get("sourceUnitId");
    void supabase?.auth.getSession().then(async ({ data }) => {
      setSession(data.session || null);
      if (forceNew || !projectId) return;
      const local = readProjectsFromStorage();
      const localProject = local.find((item) => item.id === projectId);
      if (localProject) {
        const ensured = ensureProject(localProject);
        setProject(ensured);
        focusUnitBySourceId(ensured, urlSourceUnitId);
        return;
      }
      const synced = await syncProjectsWithSupabase(local, { accessToken: data.session?.access_token || null });
      const cloudProject = synced.projects.find((item) => item.id === projectId);
      if (cloudProject) {
        const ensured = ensureProject(cloudProject);
        setProject(ensured);
        focusUnitBySourceId(ensured, urlSourceUnitId);
      }
    });
    const { data: listener } = supabase?.auth.onAuthStateChange((_event, next) => setSession(next)) || {};
    return () => listener?.subscription.unsubscribe();
  }, [searchParams]);

  useEffect(() => {
    if (!session?.access_token) return;
    void listUniverses({ accessToken: session.access_token }).then((rows) => {
      setUniverses(rows);
      setSelectedUniverseId(project.universeId || rows[0]?.id || "");
    }).catch(() => undefined);
  }, [project.universeId, session?.access_token]);

  useEffect(() => {
    if (track.units.length) {
      if (!track.units.some((unit) => unit.id === activeUnitId)) setActiveUnitId(track.units[0].id);
      return;
    }
    const unit = createUnit(mode, 1);
    const next = { ...workspace, [mode]: { ...track, units: [unit] }, updatedAt: new Date().toISOString() };
    setProject((current) => syncLegacy(current, next));
    setActiveUnitId(unit.id);
  }, [activeUnitId, mode, track, workspace]);

  useEffect(() => {
    if (track.arcs.length && !track.arcs.some((arc) => arc.id === activeArcId)) setActiveArcId(track.arcs[0].id);
  }, [activeArcId, track.arcs]);

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

  async function saveProject(nextProject = project) {
    setError("");
    upsertProject(nextProject);
    if (session?.access_token) {
      try {
        await upsertProjectToSupabase(nextProject, { accessToken: session.access_token });
      } catch {
        setStatus(isZh ? "已保存到本地，云端同步暂时不可用。" : "Saved locally; cloud sync is temporarily unavailable.");
        return;
      }
    }
    setStatus(isZh ? "已保存到工作台。" : "Saved to Workspace.");
  }

  function setMode(nextMode: CreationMode) {
    updateWorkspace((current) => ({ ...current, settings: { ...current.settings, activeMode: nextMode } }));
    setActiveUnitId("");
    setActiveArcId("");
  }

  function addUnit() {
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

  function stageTask(): TaskType | null {
    if (stage === "manuscript") return mode === "novel" ? "creation_novel_unit" : "creation_screenplay_unit";
    return STAGES.find((item) => item.key === stage)?.task || null;
  }

  function contextText() {
    const previous = track.units
      .filter((unit) => unit.status === "locked" && (!activeUnit || unit.number < activeUnit.number))
      .map((unit) => `#${unit.number} ${unit.title}\n${unit.continuityNotes || unit.outline}`)
      .join("\n\n");
    return [
      `当前阶段：${STAGES.find((item) => item.key === stage)?.zh}`,
      `当前模式：${mode}`,
      `背景及世界观：\n${workspace.documents.backgroundWorld.content}`,
      `角色圣经：\n${workspace.documents.characterBible.content}`,
      `剧情及大纲：\n${workspace.documents.plotOutline.content}`,
      activeArc ? `当前大章：${activeArc.title}\n${activeArc.outline}` : "",
      activeUnit ? `当前章/集：${activeUnit.number} ${activeUnit.title}\n${activeUnit.outline}\n${activeUnit.continuityNotes}` : "",
      previous ? `前序锁定单元：\n${previous}` : "",
      project.novelDevelopmentNotes ? `创作沟通记录：\n${project.novelDevelopmentNotes}` : "",
      sourceFiles.map((file) => `资料 ${file.name}：\n${file.text}`).join("\n\n"),
    ].filter(Boolean).join("\n\n");
  }

  async function callAI(taskType: TaskType, input: string) {
    if (!session?.access_token) throw new Error(isZh ? "请先登录后使用 AI。" : "Sign in to use AI.");
    const requestProject = projectRef.current;
    const requestWorkspace = requestProject.creationWorkspace || createCreationWorkspace(requestProject);
    const requestMode = requestWorkspace.settings.activeMode;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), AI_TIMEOUT);
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
          byoApi: readByoApiConfig("novel"),
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
    if (!taskType || stage === "export" || busy) return;
    if (stage === "manuscript" && activeUnit?.status === "locked") {
      setError(isZh ? "当前章/集已锁定，解锁后才能更新。" : "The current unit is locked.");
      return;
    }
    const translationSource = activeUnit ? buildTranslationSource(workspace, mode, activeUnit) : "";
    if (stage === "translation") {
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
        setError(isZh ? "当前章/集没有可翻译的正文。" : "The current unit has no source content to translate.");
        return;
      }
    }
    setBusy(true);
    setError("");
    setStatus(isZh ? "正在生成当前阶段…" : "Generating the current stage…");
    try {
      const input = stage === "translation"
        ? translationSource
        : stage === "localization"
          ? activeUnit?.translation || translationSource
          : chatInput.trim() || project.idea || contextText();
      const output = await callAI(taskType, input);
      if (!output.trim()) throw new Error(isZh ? "AI 没有返回可保存的内容，当前版本未覆盖。" : "AI returned no savable content; the current version was preserved.");
      const nextProject = commitWorkspace((currentWorkspace) => {
        if (stage === "background" || stage === "characters" || stage === "outline") {
          const key = stage === "background" ? "backgroundWorld" : stage === "characters" ? "characterBible" : "plotOutline";
          return {
            ...currentWorkspace,
            documents: { ...currentWorkspace.documents, [key]: { content: output, updatedAt: new Date().toISOString() } },
          };
        }
        if (stage === "manuscript" && activeUnit) {
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
        if (stage === "translation" && activeUnit) {
          return applyUnitTranslation(currentWorkspace, mode, activeUnit.id, output);
        }
        if (stage === "localization" && activeUnit) {
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
      setMessages((current) => [...current, message("assistant", isZh ? `已更新：${STAGES.find((item) => item.key === stage)?.zh}${activeUnit ? `，第 ${activeUnit.number} ${mode === "novel" ? "章" : "集"}` : ""}。` : `Updated ${STAGES.find((item) => item.key === stage)?.en}${activeUnit ? `, unit ${activeUnit.number}` : ""}.`)]);
      setStatus(isZh ? "生成完成并已保存。" : "Generated and saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Generation failed");
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
    // BLOCKER 3 (KIIKIS-P1-TRAE-002 §2): production handoff 必须锁定当前集，
    // 不允许导入整部剧本或串到其他项目。sourceUnitId = activeUnitId。
    if (target === "production" && !activeUnit) {
      setStatus(isZh ? "请先选择或创建一集剧本，再进入分镜制作台。" : "Select or create an episode first.");
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
    if (stage === "background") return workspace.documents.backgroundWorld.content;
    if (stage === "characters") return workspace.documents.characterBible.content;
    if (stage === "outline") return workspace.documents.plotOutline.content;
    if (!activeUnit) return "";
    if (stage === "translation") return activeUnit.translation;
    if (stage === "localization") {
      if (localizationView === "changes") return activeUnit.localizationChanges;
      if (localizationView === "similarity") return activeUnit.similarityReport;
      return activeUnit.localizedContent;
    }
    if (mode === "screenplay" && activeUnit.screenplay) {
      return renderScreenplayEpisode(activeUnit.screenplay, workspace.settings.screenplayFormat, {
        screenplayLanguage: workspace.settings.screenplayLanguage,
        dialogueLanguage: workspace.settings.dialogueLanguage,
      });
    }
    return activeUnit.content;
  }

  function editValue(value: string) {
    if (stage === "background" || stage === "characters" || stage === "outline") {
      const key = stage === "background" ? "backgroundWorld" : stage === "characters" ? "characterBible" : "plotOutline";
      updateWorkspace((current) => ({ ...current, documents: { ...current.documents, [key]: { content: value, updatedAt: new Date().toISOString() } } }));
      return;
    }
    if (stage === "translation") return updateUnit({ translation: value });
    if (stage === "localization") {
      if (localizationView === "changes") return updateUnit({ localizationChanges: value });
      if (localizationView === "similarity") return updateUnit({ similarityReport: value });
      return updateUnit({ localizedContent: value });
    }
    updateUnit({ content: value });
  }

  return (
    <main className="cosmic-page novel-workbench-page creation-v2-page">
      <header className="novel-topbar">
        <div className="novel-topbar-left">
          <button className="icon-button" type="button" onClick={() => router.push("/dashboard")} title={isZh ? "返回工作台" : "Back"}><ArrowLeft size={18} /></button>
          <div className="novel-title-block">
            <span>{isZh ? "创作工作台" : "Creation Workbench"}</span>
            <input aria-label={isZh ? "项目名称" : "Project title"} value={project.title} onChange={(event) => setProject((current) => ({ ...current, title: event.target.value }))} />
          </div>
        </div>
        <div className="novel-topbar-actions">
          <button className="secondary-button" type="button" onClick={() => void saveProject()}><Save size={16} />{isZh ? "保存" : "Save"}</button>
          {!session ? <button className="primary-button" type="button" onClick={() => setAuthOpen(true)}>{isZh ? "登录使用 AI" : "Sign in for AI"}</button> : null}
        </div>
      </header>

      <nav className="novel-mobile-tabs">
        <button className={mobilePanel === "chat" ? "active" : ""} type="button" onClick={() => setMobilePanel("chat")}>{isZh ? "对话" : "Chat"}</button>
        <button className={mobilePanel === "content" ? "active" : ""} type="button" onClick={() => setMobilePanel("content")}>{isZh ? "文档" : "Document"}</button>
      </nav>

      <section className="novel-workbench-shell creation-v2-shell">
        {error || status || busy ? <div className={error ? "notice error" : busy ? "notice warning" : "notice success"}>{error || (busy ? (isZh ? "处理中，请勿关闭页面…" : "Working…") : status)}</div> : null}

        <section className={`dashboard-panel novel-editor-panel novel-chat-panel creation-chat-panel ${mobilePanel === "chat" ? "is-mobile-active" : ""}`}>
          <div className="dashboard-panel-head">
            <div><span>KIiKIS AI</span><h2>{isZh ? "和 KK 一起创作" : "Create with KK"}</h2></div>
            <span className="novel-chat-stage-pill">{String(STAGES.findIndex((item) => item.key === stage) + 1).padStart(2, "0")} · {isZh ? STAGES.find((item) => item.key === stage)?.zh : STAGES.find((item) => item.key === stage)?.en}</span>
          </div>

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
            <button className="secondary-button" type="button" disabled={uploading} onClick={() => sourceInput.current?.click()}><Upload size={16} />{uploading ? (isZh ? "读取中" : "Reading") : (isZh ? "上传创作资料" : "Upload sources")}</button>
            <div className="novel-source-files">{sourceFiles.map((file) => <span key={file.id}><FileText size={13} />{file.name}</span>)}</div>
            <input hidden multiple ref={sourceInput} type="file" accept=".txt,.md,.doc,.docx,.html,.csv" onChange={uploadSources} />
          </div>

          <div className="novel-chat-composer">
            <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void sendChat(); } }} placeholder={isZh ? "输入想法、修改意见或继续追问。⌘/Ctrl + Enter 发送。" : "Share ideas, revisions, or questions. Cmd/Ctrl + Enter to send."} />
            <div className="novel-chat-actions">
              <button className="secondary-button" type="button" disabled={!chatInput.trim() || busy} onClick={() => void sendChat()}><Send size={16} />{isZh ? "发送" : "Send"}</button>
              {stage !== "export" ? <button className="primary-button" type="button" disabled={busy} onClick={() => void generateStage()}><Sparkles size={16} />{isZh ? "生成/更新当前阶段" : "Generate active stage"}</button> : null}
            </div>
          </div>
        </section>

        <section className={`dashboard-panel novel-ai-panel creation-document-panel ${mobilePanel === "content" ? "is-mobile-active" : ""}`}>
          <nav className="creation-stage-navigation" aria-label={isZh ? "创作阶段" : "Creation stages"}>
            {STAGES.map((item, index) => <button className={stage === item.key ? "active" : ""} type="button" key={item.key} onClick={() => setStage(item.key)}><span>{index + 1}</span>{isZh ? item.zh : item.en}</button>)}
          </nav>

          <div className="creation-document-toolbar">
            <div className="creation-segmented" aria-label={isZh ? "正文类型" : "Content mode"}>
              <button className={mode === "novel" ? "active" : ""} type="button" onClick={() => setMode("novel")}>{isZh ? "小说" : "Novel"}</button>
              <button className={mode === "screenplay" ? "active" : ""} type="button" onClick={() => setMode("screenplay")}>{isZh ? "剧本" : "Screenplay"}</button>
            </div>
            {(stage === "manuscript" || stage === "translation" || stage === "localization") ? <>
              <select aria-label={isZh ? "当前章/集" : "Current unit"} value={activeUnit?.id || ""} onChange={(event) => setActiveUnitId(event.target.value)}>{track.units.map((unit) => <option value={unit.id} key={unit.id}>{mode === "novel" ? (isZh ? `第 ${unit.number} 章` : `Chapter ${unit.number}`) : (isZh ? `第 ${unit.number} 集` : `Episode ${unit.number}`)} · {unit.title}</option>)}</select>
              <button className="icon-button subtle" type="button" onClick={addUnit} title={isZh ? "新增章/集" : "Add unit"}><Plus size={16} /><span>{isZh ? "新增" : "Add"}</span></button>
              <select aria-label={isZh ? "状态" : "Status"} value={activeUnit?.status || "draft"} onChange={(event) => updateUnit({ status: event.target.value as CreationUnit["status"] })}><option value="draft">{isZh ? "草稿" : "Draft"}</option><option value="reviewed">{isZh ? "已审阅" : "Reviewed"}</option><option value="locked">{isZh ? "已锁定" : "Locked"}</option></select>
              {activeUnit?.status === "locked" ? <Lock size={16} /> : null}
            </> : null}
          </div>

          {stage === "outline" ? <div className="creation-structure-toolbar"><select aria-label={isZh ? "当前大章" : "Current arc"} value={activeArc?.id || ""} onChange={(event) => setActiveArcId(event.target.value)}><option value="">{isZh ? "当前大章" : "Current arc"}</option>{track.arcs.map((arc) => <option value={arc.id} key={arc.id}>{arc.number}. {arc.title}</option>)}</select><button className="secondary-button" type="button" onClick={syncOutlineStructure}><Check size={16} />{isZh ? "同步结构" : "Sync structure"}</button></div> : null}

          {stage === "manuscript" ? <div className="creation-language-toolbar">
            <label>{mode === "novel" ? (isZh ? "正文语言" : "Manuscript language") : (isZh ? "剧本语言" : "Screenplay language")}<select value={mode === "novel" ? workspace.settings.sourceLanguage : workspace.settings.screenplayLanguage} onChange={(event) => updateWorkspace((current) => ({ ...current, settings: { ...current.settings, [mode === "novel" ? "sourceLanguage" : "screenplayLanguage"]: event.target.value } }))}>{LANGUAGE_OPTIONS.map((language) => <option key={language}>{language}</option>)}</select></label>
            {mode === "screenplay" ? <label>{isZh ? "对话语言（附剧本语言翻译）" : "Dialogue language (+ screenplay translation)"}<select value={workspace.settings.dialogueLanguage} onChange={(event) => updateWorkspace((current) => ({ ...current, settings: { ...current.settings, dialogueLanguage: event.target.value } }))}>{LANGUAGE_OPTIONS.map((language) => <option key={language}>{language}</option>)}</select></label> : <label>{isZh ? "全文翻译语言（可选）" : "Full translation language (optional)"}<select value={workspace.settings.translationLanguage} onChange={(event) => updateWorkspace((current) => ({ ...current, settings: { ...current.settings, translationLanguage: event.target.value, translationEnabled: Boolean(event.target.value) } }))}><option value="">{isZh ? "不翻译" : "No translation"}</option>{LANGUAGE_OPTIONS.map((language) => <option key={language}>{language}</option>)}</select></label>}
            <label>{isZh ? "生成范围" : "Generation scope"}<select value={workspace.settings.generationScope} onChange={(event) => updateWorkspace((current) => ({ ...current, settings: { ...current.settings, generationScope: event.target.value as "unit" | "arc" } }))}><option value="unit">current-unit · {isZh ? "当前章/集" : "Current unit"}</option><option value="arc">current-arc · {isZh ? "当前大章" : "Current arc"}</option></select></label>
            {mode === "screenplay" ? <label>{isZh ? "剧本格式" : "Screenplay format"}<select value={workspace.settings.screenplayFormat} onChange={(event) => updateWorkspace((current) => ({ ...current, settings: { ...current.settings, screenplayFormat: event.target.value as ScreenplayFormat } }))}><option value="international_production">International Production</option><option value="hollywood_spec">Hollywood Spec</option><option value="asian_production">Asian Production</option></select></label> : null}
          </div> : null}

          {stage === "translation" ? <div className="creation-language-toolbar"><label>{isZh ? "翻译语言（本阶段可跳过）" : "Translation language (optional stage)"}<select value={workspace.settings.translationLanguage} onChange={(event) => updateWorkspace((current) => ({ ...current, settings: { ...current.settings, translationLanguage: event.target.value, translationEnabled: Boolean(event.target.value) } }))}><option value="">{isZh ? "跳过翻译" : "Skip translation"}</option>{LANGUAGE_OPTIONS.map((language) => <option key={language}>{language}</option>)}</select></label></div> : null}

          {stage === "localization" ? <div className="creation-segmented creation-localization-tabs"><button className={localizationView === "content" ? "active" : ""} type="button" onClick={() => setLocalizationView("content")}>{isZh ? "本土化后内容" : "Localized content"}</button><button className={localizationView === "changes" ? "active" : ""} type="button" onClick={() => setLocalizationView("changes")}>{isZh ? "本土化修改" : "Changes"}</button><button className={localizationView === "similarity" ? "active" : ""} type="button" onClick={() => setLocalizationView("similarity")}>{isZh ? "雷同查验" : "Similarity report"}</button></div> : null}

          {stage === "translation" && activeUnit ? <div className="creation-translation-editors">
            <section>
              <header><strong>{isZh ? "原文" : "Source"}</strong><span>{mode === "screenplay" ? workspace.settings.screenplayLanguage : workspace.settings.sourceLanguage}</span></header>
              <textarea className="novel-main-editor novel-stage-preview creation-markdown-editor" value={buildTranslationSource(workspace, mode, activeUnit)} readOnly aria-label={isZh ? "翻译原文" : "Translation source"} />
            </section>
            <section>
              <header><strong>{isZh ? "译文" : "Translation"}</strong><span>{workspace.settings.translationLanguage || (isZh ? "未选择语言" : "No language selected")}</span></header>
              <textarea className="novel-main-editor novel-stage-preview creation-markdown-editor" value={activeUnit.translation} onChange={(event) => editValue(event.target.value)} aria-label={isZh ? "译文编辑器" : "Translation editor"} placeholder={isZh ? "选择翻译语言后生成，或直接编辑译文。" : "Select a language to generate, or edit the translation directly."} />
            </section>
          </div> : stage !== "export" ? <textarea className="novel-main-editor novel-stage-preview creation-markdown-editor" value={editorValue()} disabled={activeUnit?.status === "locked" && stage === "manuscript"} onChange={(event) => editValue(event.target.value)} placeholder={isZh ? "当前阶段的 Markdown 内容会显示在这里，可直接编辑。" : "The active Markdown document appears here and can be edited directly."} /> : <div className="creation-export-panel">
            <div className="creation-export-head"><div><FileArchive size={20} /><h2>{isZh ? "交付文件" : "Delivery files"}</h2></div><button className="primary-button" type="button" onClick={() => void downloadDeliveryZip(deliveryItems, `${project.title}-complete-delivery`)}><Download size={16} />{isZh ? "完整交付包 ZIP" : "Complete delivery ZIP"}</button></div>
            {deliveryItems.map((item) => <article className="creation-export-row" key={item.id}><div><FileText size={18} /><span><strong>{item.label}</strong><small>{item.baseFilename}</small></span></div><div><button className="secondary-button" type="button" onClick={() => downloadMarkdown(item.document, item.baseFilename)}>MD</button><button className="secondary-button" type="button" onClick={() => void downloadDocx(item.document, item.baseFilename)}>DOCX</button></div></article>)}
          </div>}

          <details className="novel-tool-section creation-universe-tool" open>
            <summary>Continuity & Universe</summary>
            <p>{activeUnit?.continuityNotes || (isZh ? "暂无连续性备注。" : "No continuity notes yet.")}</p>
            <textarea value={activeUnit?.continuityNotes || ""} onChange={(event) => updateUnit({ continuityNotes: event.target.value })} placeholder={isZh ? "当前章/集连续性备注" : "Current unit continuity notes"} />
            <div className="creation-universe-actions"><button className="secondary-button" type="button" disabled={universeBusy} onClick={() => void createAndLinkUniverse()}><Plus size={16} />{isZh ? "创建 Universe" : "Create Universe"}</button>{universes.length ? <><select value={selectedUniverseId} onChange={(event) => setSelectedUniverseId(event.target.value)}>{universes.map((universe) => <option value={universe.id} key={universe.id}>{universe.name}</option>)}</select><button className="secondary-button" type="button" onClick={() => void linkUniverse()}><Link2 size={16} />{isZh ? "关联" : "Link"}</button></> : null}<button className="secondary-button" type="button" disabled={!project.universeId} onClick={() => void sendUniverseInbox()}><Send size={16} />Universe Inbox</button></div>
          </details>

          <footer className="novel-handoff-bar creation-handoff-bar"><div><strong>{isZh ? "进入制作" : "Continue production"}</strong><span>{isZh ? "前三件套、当前正文和 Universe 会随项目传递。" : "The three shared documents, active manuscript, and Universe travel with the project."}</span></div><button className="secondary-button" type="button" onClick={() => void openDownstream("art")}><Palette size={16} />{isZh ? "美术工作台" : "Art workbench"}</button><button className="primary-button" type="button" onClick={() => void openDownstream("production")}><Clapperboard size={16} />{isZh ? "分镜/视频" : "Storyboard / video"}</button></footer>
        </section>
      </section>
      <AuthModal open={authOpen} mode="signin" onClose={() => setAuthOpen(false)} />
    </main>
  );
}
