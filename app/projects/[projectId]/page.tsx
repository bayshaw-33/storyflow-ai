"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  UploadCloud,
  UserPlus,
  WandSparkles,
} from "lucide-react";
import type { TaskType } from "@/lib/ai/prompts";
import {
  applyDemoStep,
  buildStoryBibleSummary,
  buildDeliveryMarkdown,
  CharacterCard,
  characterCardsToMarkdown,
  CHINESE_SCRIPT_RANGE_OPTIONS,
  createEmptyCharacterCard,
  createEmptyStoryboardEpisode,
  createContinuationProject,
  createProject,
  demoProject,
  DramaProject,
  EPISODE_COUNT_OPTIONS,
  EPISODE_DURATION_OPTIONS,
  exportProjectMarkdown,
  FINAL_SCRIPT_VERSION_OPTIONS,
  GENRE_OPTIONS,
  getSelectedFinalScript,
  getPhaseCompletion,
  getStepContent,
  getStepStatus,
  getStepVersions,
  getWorkflowPhases,
  getWorkflowSteps,
  LANGUAGE_OPTIONS,
  LOCALIZATION_MODE_OPTIONS,
  MARKET_OPTIONS,
  readProjectsFromStorage,
  saveStepVersion,
  setStepContent,
  parseStructuredEpisodes,
  StoryboardEpisode,
  storyboardEpisodesToMarkdown,
  upsertProject,
  WorkflowPhaseKey,
} from "@/lib/projects";
import { readProjectFromSupabase, upsertProjectToSupabase } from "@/lib/supabase/projects";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  canUseUniverseEngine,
  createUniverseFromProject,
  DEFAULT_INHERITANCE_SETTINGS,
  getProjectUniverseLink,
  getUniverseBundle,
  readUniverseEntitlement,
  saveCanonCheckReport,
  saveInboxItems,
  Universe,
  UniverseBundle,
  UniverseEntitlement,
} from "@/lib/universe";

const DEFAULT_TITLE = "未命名短剧项目";

type GenerationTaskRecord = {
  id: string;
  step_key: TaskType;
  phase_key: string;
  status: "queued" | "running" | "streaming" | "completed" | "failed" | "retrying" | "cancelled";
  provider: string | null;
  model: string | null;
  output_snapshot: string | null;
  error_message: string | null;
  latency_ms: number | null;
  created_at: string;
  completed_at: string | null;
};

function getPreviousKey(project: DramaProject, taskType: TaskType): TaskType | null {
  const workflowSteps = getWorkflowSteps(project);
  const index = workflowSteps.findIndex((step) => step.key === taskType);
  if (index <= 0) return null;
  return workflowSteps[index - 1].key;
}

function getRequirement(project: DramaProject, taskType: TaskType) {
  if (project.workflowType === "continuation") {
    if (taskType === "script_import") return project.idea.trim() || project.importedScript.trim() ? "" : "请先导入或粘贴已有小说/剧本材料。";
    if (taskType === "characters") return project.importedScript.trim() ? "" : "请先完成剧本导入。";
    if (taskType === "structure_model") return project.characterCards.length ? "" : "请先生成或添加角色卡。";
    if (taskType === "beat_cards") return project.structureModel.trim() ? "" : "请先完成结构模型。";
    if (taskType === "series_outline") return project.beatCards.trim() ? "" : "请先完成节拍卡。";
    if (taskType === "existing_script") return project.outline.trim() ? "" : "请先完成大纲。";
    if (taskType === "continuation_script") return project.existingScript.trim() ? "" : "请先整理已有剧本。";
    if (taskType === "translation") return project.continuationScript.trim() ? "" : "请先生成续写剧本。";
  }

  if (taskType === "market_analysis") return project.market && project.genre ? "" : "请先选择目标市场和题材。";
  if (taskType === "brief") return project.idea.trim() ? "" : "请先填写故事创意，或拖入附件解析。";
  if (taskType === "characters") return project.brief.trim() ? "" : "请先完成创意。";
  if (taskType === "structure_model") return project.characterCards.length ? "" : "请先生成或添加角色卡。";
  if (taskType === "beat_cards") return project.structureModel.trim() ? "" : "请先完成结构模型。";
  if (taskType === "series_outline") return project.beatCards.trim() ? "" : "请先完成节拍卡。";
  if (taskType === "quality_evaluation") return project.localization.trim() ? "" : "请先完成本土化。";
  if (taskType === "final_script") return project.localization.trim() && project.qualityEvaluation.trim() ? "" : "请先完成本土化和评估。";
  if (taskType === "format_check") return getSelectedFinalScript(project).trim() ? "" : "请先生成最终剧本。";
  if (taskType === "storyboard_script") return project.formatCheck.trim() || getSelectedFinalScript(project).trim() ? "" : "请先完成格式检查。";
  if (taskType === "final_delivery") return project.storyboardEpisodes.length || project.storyboardScript.trim() ? "" : "请先生成分镜。";

  const previousKey = getPreviousKey(project, taskType);
  if (!previousKey) return "";

  return getStepContent(project, previousKey).trim()
    ? ""
    : `请先完成上一步：${getWorkflowSteps(project).find((step) => step.key === previousKey)?.short}`;
}

function previousStepContent(project: DramaProject, activeStep: TaskType) {
  const workflowSteps = getWorkflowSteps(project);
  const activeIndex = workflowSteps.findIndex((step) => step.key === activeStep);
  const priorSteps = activeIndex > 0 ? workflowSteps.slice(0, activeIndex) : [];

  return priorSteps.reduce((acc, step) => {
    acc[step.key] = getStepContent(project, step.key);
    return acc;
  }, {} as Partial<Record<TaskType, string>>);
}

function getTaskInput(project: DramaProject, activeStep: TaskType, activeContent: string) {
  if (activeStep === "market_analysis") {
    return [
      `目标市场：${project.market}`,
      `题材：${project.genre}`,
      `竞品名称：${project.benchmarkTitle}`,
      `竞品链接：${project.benchmarkLink}`,
      `集数：${project.episodeCount}`,
      `每集片长：${project.episodeDuration}`,
    ].join("\n");
  }
  if (activeStep === "script_import") return project.idea || project.importedScript;
  if (activeStep === "characters") return project.workflowType === "continuation" ? project.importedScript || project.idea : project.brief;
  if (activeStep === "structure_model") {
    return [
      project.workflowType === "continuation" ? project.importedScript : project.brief,
      characterCardsToMarkdown(project.characterCards),
      project.relationshipDiagram,
    ].filter(Boolean).join("\n\n");
  }
  if (activeStep === "beat_cards") {
    return [
      project.structureModel,
      characterCardsToMarkdown(project.characterCards),
      project.relationshipDiagram,
    ].filter(Boolean).join("\n\n");
  }
  if (activeStep === "series_outline") {
    return [
      project.workflowType === "continuation" ? project.importedScript : project.brief,
      project.structureModel,
      project.beatCards,
      characterCardsToMarkdown(project.characterCards),
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  if (activeStep === "existing_script") return [project.importedScript, project.outline].filter(Boolean).join("\n\n");
  if (activeStep === "chinese_script") return project.outline;
  if (activeStep === "continuation_script") return [project.existingScript, project.outline, characterCardsToMarkdown(project.characterCards)].filter(Boolean).join("\n\n");
  if (activeStep === "translation") return project.workflowType === "continuation" ? project.continuationScript : project.chineseScript;
  if (activeStep === "localization") return project.translation;
  if (activeStep === "test_script") return project.localization;
  if (activeStep === "quality_evaluation") return project.localization;
  if (activeStep === "final_script") {
    return [
      "【本土化剧本】",
      project.localization,
      "",
      "【评估与修订要求】",
      project.qualityEvaluation,
      "",
      "【中文剧本】",
      project.workflowType === "continuation" ? project.continuationScript : project.chineseScript,
      "",
      "【外语剧本】",
      project.translation,
    ].join("\n");
  }
  if (activeStep === "format_check") return getSelectedFinalScript(project);
  if (activeStep === "storyboard_script") return getSelectedFinalScript(project);
  if (activeStep === "final_delivery") return buildDeliveryMarkdown(project, true);
  return activeContent || project.idea;
}

function extractGeneratedTitle(output: string) {
  const match = output.match(/(?:剧名|推荐剧名|暂定剧名|片名)\s*[：:]\s*(.+)/);
  if (!match?.[1]) return "";
  return match[1].replace(/[#*_`"“”]/g, "").trim().slice(0, 32);
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "").trim() || "StoryFlow项目";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function markdownToHtml(content: string) {
  return escapeHtml(content)
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\n/g, "<br />");
}

function revisionMarkupToHtml(content: string) {
  return escapeHtml(content)
    .replace(/&lt;span class=&quot;revision-mark&quot;&gt;/g, '<span class="revision-mark">')
    .replace(/&lt;span class=&#39;revision-mark&#39;&gt;/g, '<span class="revision-mark">')
    .replace(/&lt;\/span&gt;/g, "</span>")
    .replace(/\n/g, "<br />");
}

function buildLocalizationDiffRows(source: string, localized: string) {
  const sourceLines = source.split("\n").filter((line) => line.trim()).slice(0, 16);
  const localizedLines = localized.split("\n").filter((line) => line.trim()).slice(0, 16);
  const max = Math.max(sourceLines.length, localizedLines.length, 1);
  return Array.from({ length: max }, (_, index) => {
    const before = sourceLines[index] || "";
    const after = localizedLines[index] || "";
    const reason = after.length < before.length
      ? "口语化"
      : /taboo|blood|death|kill|sex|drug|暴力|死亡|血/i.test(before + after)
        ? "禁忌规避"
        : before && after && before !== after
          ? "文化适配"
          : "情绪增强";
    return { before, after, reason };
  });
}

function buildDramaScoreCards(content: string) {
  const items = [
    "前 3 秒钩子",
    "冲突密度",
    "情绪推进",
    "反转力度",
    "结尾钩子",
    "对白口语度",
    "本土化自然度",
    "拍摄可执行性",
  ];
  const total = Number(content.match(/(?:总分|综合评分)\D*(\d+(?:\.\d+)?)/)?.[1] || 0);

  return {
    total: total || Math.round(
      items.reduce((sum, item) => sum + Number(content.match(new RegExp(`${item}\\\\D*(\\\\d+(?:\\\\.\\\\d+)?)`))?.[1] || 7), 0) / items.length,
    ),
    items: items.map((item) => ({
      item,
      score: Number(content.match(new RegExp(`${item}\\\\D*(\\\\d+(?:\\\\.\\\\d+)?)`))?.[1] || 7),
      issue: pickScoreLine(content, item, ["问题", "风险", "诊断"]) || "等待 AI 输出更细的诊断。",
      suggestion: pickScoreLine(content, item, ["建议", "修改建议", "修订"]) || "可在右侧输入优化要求后重新生成。",
    })),
  };
}

function pickScoreLine(content: string, anchor: string, labels: string[]) {
  const start = content.indexOf(anchor);
  const section = start >= 0 ? content.slice(start, start + 500) : content;
  for (const label of labels) {
    const match = section.match(new RegExp(`${label}\\s*[：:]\\s*(.+)`));
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

export default function WorkflowPage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [project, setProject] = useState<DramaProject | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [credits, setCredits] = useState<{ balance: number; monthlyLimit: number } | null>(null);
  const [activeStep, setActiveStep] = useState<TaskType>("market_analysis");
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [characterImageLoadingId, setCharacterImageLoadingId] = useState("");
  const [parsingFile, setParsingFile] = useState(false);
  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [characterView, setCharacterView] = useState<"cards" | "relationships">("cards");
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [optimizeInstruction, setOptimizeInstruction] = useState("");
  const [projectFieldsOpen, setProjectFieldsOpen] = useState(false);
  const [storyBibleOpen, setStoryBibleOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [universeBundle, setUniverseBundle] = useState<UniverseBundle | null>(null);
  const [universeEntitlement, setUniverseEntitlement] = useState<UniverseEntitlement>(canUseUniverseEngine(null));
  const [universeModalOpen, setUniverseModalOpen] = useState(false);
  const [universeBusy, setUniverseBusy] = useState(false);
  const [universeForm, setUniverseForm] = useState({
    name: "",
    description: "",
    genre: "",
    defaultLanguage: "English",
    targetMarkets: "North America",
    tone: "",
  });
  const [openPhases, setOpenPhases] = useState<Record<WorkflowPhaseKey, boolean>>({
    project_setup: true,
    story_design: true,
    script_production: false,
    localization_evaluation: false,
    storyboard_delivery: false,
  });
  const [generationTasks, setGenerationTasks] = useState<GenerationTaskRecord[]>([]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      void refreshCredits(data.session || null);
    });

    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        void refreshCredits(nextSession);
      }) || {};

    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const accessToken = session?.access_token || null;
    const projects = readProjectsFromStorage();
    const found = projects.find((item) => item.id === params.projectId);
    const requestedWorkflow = searchParams.get("mode") === "continuation" ? "continuation" : "creation";
    const isDemo = false;

    if (found) {
      setProject(found);
      const steps = getWorkflowSteps(found);
      setActiveStep((current) => (steps.some((step) => step.key === current) ? current : steps[0].key));
      void readProjectFromSupabase(params.projectId, { accessToken }).then((cloudProject) => {
        if (cancelled || !cloudProject) return;
        if (cloudProject.updatedAt.localeCompare(found.updatedAt) >= 0) {
          setProject(cloudProject);
          saveProjectEverywhere(cloudProject);
          const cloudSteps = getWorkflowSteps(cloudProject);
          setActiveStep((current) => (cloudSteps.some((step) => step.key === current) ? current : cloudSteps[0].key));
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const created = isDemo
      ? { ...demoProject(), id: params.projectId, updatedAt: new Date().toISOString() }
      : requestedWorkflow === "continuation"
        ? createContinuationProject({ id: params.projectId })
        : createProject({ id: params.projectId });

    setProject(created);
    setActiveStep(getWorkflowSteps(created)[0].key);
    if (isDemo) saveProjectEverywhere(created);

    if (!isDemo) {
      void readProjectFromSupabase(params.projectId, { accessToken }).then((cloudProject) => {
        if (cancelled || !cloudProject) return;
        setProject(cloudProject);
        const cloudSteps = getWorkflowSteps(cloudProject);
        setActiveStep(cloudSteps[0].key);
        saveProjectEverywhere(cloudProject);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [params.projectId, searchParams, session?.access_token]);

  useEffect(() => {
    fetch("/api/ai/generate")
      .then((response) => response.json())
      .then((data) => setAiConfigured(Boolean(data.configured)))
      .catch(() => setAiConfigured(null));
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    setHistoryOpen(false);
  }, [activeStep]);

  const workflowSteps = useMemo(() => getWorkflowSteps(project || undefined), [project?.workflowType]);
  const workflowPhases = useMemo(() => getWorkflowPhases(project || undefined), [project?.workflowType]);
  const activeMeta = useMemo(
    () => workflowSteps.find((step) => step.key === activeStep) || workflowSteps[0],
    [activeStep, workflowSteps],
  );
  const activePhase = useMemo(
    () => workflowPhases.find((phase) => phase.stepKeys.includes(activeStep)) || workflowPhases[0],
    [activeStep, workflowPhases],
  );

  const requirement = project ? getRequirement(project, activeStep) : "";
  const activeContent = project ? getStepContent(project, activeStep) : "";
  const activeVersions = project ? getStepVersions(project, activeStep) : [];
  const storyBible = project?.storyBible;
  const structuredEpisodes = useMemo(
    () => parseStructuredEpisodes(activeContent),
    [activeContent],
  );
  const localizationDiffRows = useMemo(
    () => project ? buildLocalizationDiffRows(project.translation, activeContent) : [],
    [project?.translation, activeContent],
  );
  const dramaScore = useMemo(
    () => buildDramaScoreCards(activeContent),
    [activeContent],
  );
  const activeTaskRecords = useMemo(
    () => generationTasks.filter((task) => task.step_key === activeStep).slice(0, 4),
    [generationTasks, activeStep],
  );

  async function refreshCredits(nextSession: Session | null = session) {
    if (!nextSession?.access_token) {
      setCredits(null);
      return;
    }

    try {
      const response = await fetch("/api/account/credits", {
        headers: { Authorization: `Bearer ${nextSession.access_token}` },
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setCredits({ balance: data.credits.balance, monthlyLimit: data.credits.monthlyLimit });
      }
    } catch {
      setCredits(null);
    }
  }

  async function refreshGenerationTasks(nextSession: Session | null = session) {
    if (!project?.id || !nextSession?.access_token) {
      setGenerationTasks([]);
      return;
    }

    try {
      const response = await fetch(`/api/ai/tasks?projectId=${encodeURIComponent(project.id)}`, {
        headers: { Authorization: `Bearer ${nextSession.access_token}` },
      });
      const data = await response.json();
      if (response.ok && data.success) setGenerationTasks(data.tasks || []);
    } catch {
      setGenerationTasks([]);
    }
  }

  useEffect(() => {
    void refreshGenerationTasks();
  }, [project?.id, session?.access_token, activeStep]);

  useEffect(() => {
    void refreshUniverseContext();
  }, [project?.id, project?.universeId, session?.access_token]);

  async function refreshUniverseContext() {
    const accessToken = session?.access_token || null;
    const entitlement = await readUniverseEntitlement({ accessToken }).catch(() => canUseUniverseEngine({ email: session?.user.email || "" }));
    setUniverseEntitlement(entitlement);

    if (!project?.id) {
      setUniverseBundle(null);
      return;
    }

    const link = await getProjectUniverseLink(project.id, { accessToken });
    const universeId = project.universeId || link?.universe_id || null;
    if (!universeId) {
      setUniverseBundle(null);
      return;
    }

    const bundle = await getUniverseBundle(universeId, { accessToken });
    setUniverseBundle(bundle);
  }

  function getAuthHeaders(): Record<string, string> {
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }

  function saveProjectEverywhere(nextProject: DramaProject) {
    upsertProject(nextProject);
    void upsertProjectToSupabase(nextProject, { accessToken: session?.access_token }).catch(() => {
      // 本地保存优先，云端同步失败时保持 MVP 可演示。
    });
  }

  function persist(nextProject: DramaProject, immediate = false) {
    if (saveTimer.current) clearTimeout(saveTimer.current);

    if (immediate) {
      saveProjectEverywhere(nextProject);
      setStatusText("已自动保存");
      return;
    }

    setStatusText("正在保存...");
    saveTimer.current = setTimeout(() => {
      saveProjectEverywhere(nextProject);
      setStatusText("已自动保存");
    }, 500);
  }

  function updateProject(updater: (current: DramaProject) => DramaProject, immediate = false) {
    setProject((current) => {
      if (!current) return current;
      const next = updater(current);
      persist(next, immediate);
      return next;
    });
  }

  function updateField<K extends keyof DramaProject>(key: K, value: DramaProject[K]) {
    updateProject((current) => {
      const next = {
        ...current,
        [key]: value,
        status: "draft" as const,
        updatedAt: new Date().toISOString(),
      };

      if (current.workflowType === "continuation" && key === "idea" && typeof value === "string") {
        const canMirrorImport = !current.existingScript.trim() || current.existingScript.trim() === current.idea.trim();
        if (canMirrorImport) next.existingScript = value;
      }

      return next;
    });
  }

  function updateStoryBibleField(key: keyof NonNullable<DramaProject["storyBible"]>, value: string) {
    updateProject((current) => ({
      ...current,
      storyBible: {
        ...current.storyBible,
        [key]: value,
      },
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateStep(taskType: TaskType, content: string) {
    updateProject((current) => ({ ...setStepContent(current, taskType, content), status: "draft" }), true);
  }

  function syncCharacterCards(cards: CharacterCard[]) {
    updateProject((current) => ({
      ...current,
      characterCards: cards,
      characters: characterCardsToMarkdown(cards),
      status: "draft",
      updatedAt: new Date().toISOString(),
    }), true);
  }

  function updateCharacterCard(id: string, key: keyof CharacterCard, value: string) {
    if (!project) return;
    syncCharacterCards(project.characterCards.map((card) => (card.id === id ? { ...card, [key]: value } : card)));
  }

  async function generateRelationshipImage() {
    if (!project) return;
    if (!session?.access_token) {
      setError("请先登录后再生成人物关系图。");
      return;
    }
    if (credits?.balance === 0) {
      setError("本月 AI 额度已用完，暂时不能继续生成人物关系图。");
      return;
    }
    if (!project.characterCards.length && !project.relationshipDiagram.trim()) {
      setError("请先生成或添加角色卡，再生成图片关系图。");
      return;
    }

    setImageLoading(true);
    setError("");
    setStatusText("");

    try {
      const response = await fetch("/api/ai/relationship-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          projectTitle: project.title,
          relationshipDiagram: project.relationshipDiagram,
          characters: project.characterCards,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "人物关系图生成失败，请稍后重试。");
      }

      updateProject((current) => ({
        ...current,
        relationshipImageUrl: data.imageUrl,
        status: "ready" as const,
        updatedAt: new Date().toISOString(),
      }), true);
      void refreshCredits();
      setStatusText(`已生成图片关系图（${data.fallback === "svg" ? "MiniMax SVG 兜底" : data.model || "MiniMax"}）`);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : "人物关系图生成失败，请稍后重试。");
    } finally {
      setImageLoading(false);
    }
  }

  async function generateCharacterImage(card: CharacterCard) {
    if (!project) return;
    if (!session?.access_token) {
      setError("请先登录后再生成角色图片。");
      return;
    }
    if (credits?.balance === 0) {
      setError("本月 AI 额度已用完，暂时不能继续生成角色图片。");
      return;
    }
    if (!card.name.trim() && !card.appearancePrompt.trim()) {
      setError("请先填写角色名称或人物形象提示词。");
      return;
    }

    setCharacterImageLoadingId(card.id);
    setError("");
    setStatusText("");

    try {
      const response = await fetch("/api/ai/character-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          projectTitle: project.title,
          market: project.market,
          genre: project.genre,
          context: [project.brief, project.relationshipDiagram].filter(Boolean).join("\n\n"),
          character: card,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "角色图片生成失败，请稍后重试。");
      }

      const nextCards = project.characterCards.map((item) =>
        item.id === card.id
          ? {
              ...item,
              imageUrl: data.imageUrl,
              appearancePrompt: item.appearancePrompt || data.prompt || "",
            }
          : item,
      );
      syncCharacterCards(nextCards);
      void refreshCredits();
      setStatusText(`已生成角色图片：${card.name || "未命名角色"}（${data.fallback === "svg" ? "MiniMax SVG 兜底" : data.model || "MiniMax"}）`);
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : "角色图片生成失败，请稍后重试。");
    } finally {
      setCharacterImageLoadingId("");
    }
  }

  function syncStoryboardEpisodes(episodes: StoryboardEpisode[]) {
    updateProject((current) => ({
      ...current,
      storyboardEpisodes: episodes,
      storyboardScript: storyboardEpisodesToMarkdown(episodes),
      status: "draft",
      updatedAt: new Date().toISOString(),
    }), true);
  }

  function updateStoryboardEpisode(id: string, key: keyof StoryboardEpisode, value: string) {
    if (!project) return;
    syncStoryboardEpisodes(project.storyboardEpisodes.map((episode) => (episode.id === id ? { ...episode, [key]: value } : episode)));
  }

  function recordStepVersion(taskType: TaskType, content: string, source: "ai" | "manual" | "demo" | "optimize" | "restore", label?: string) {
    updateProject((current) => saveStepVersion(current, taskType, content, source, label), true);
  }

  function restoreVersion(content: string) {
    updateProject((current) => saveStepVersion(setStepContent(current, activeStep, content), activeStep, content, "restore"), true);
    setStatusText("已恢复所选历史版本");
  }

  function expectedEpisodeCountForStep(baseProject: DramaProject, step: TaskType, sourceContent = "") {
    if (step === "chinese_script" || step === "continuation_script") {
      if (baseProject.chineseScriptRange === "first15") return Math.min(15, baseProject.episodeCount);
      if (baseProject.chineseScriptRange === "first_half") return Math.max(1, Math.ceil(baseProject.episodeCount / 2));
      if (baseProject.chineseScriptRange === "full") return baseProject.episodeCount;
      return Math.min(3, baseProject.episodeCount);
    }

    if (step === "localization") return countGeneratedEpisodes(sourceContent || baseProject.translation);
    if (step === "storyboard_script") return countGeneratedEpisodes(sourceContent || getSelectedFinalScript(baseProject));
    return 0;
  }

  function countGeneratedEpisodes(content: string) {
    const matches = Array.from(content.matchAll(/第\s*(\d+)\s*集|Episode\s*(\d+)/gi));
    const unique = new Set(matches.map((match) => match[1] || match[2]).filter(Boolean));
    return unique.size;
  }

  function missingEpisodePrompt(baseInput: string, currentOutput: string, generatedCount: number, expectedCount: number) {
    const nextEpisode = generatedCount + 1;
    return [
      baseInput,
      "",
      `【补全要求】当前结果只覆盖到约 ${generatedCount} 集，需要继续补全第 ${nextEpisode} 集到第 ${expectedCount} 集。`,
      "只输出缺失集数的正文，不要重复已生成内容，不要输出解释。",
      "",
      "【已生成内容摘要】",
      currentOutput.slice(-12000),
    ].join("\n");
  }

  async function requestGenerate(
    step: TaskType,
    baseProject: DramaProject,
    input: string,
    optimizeInstruction = "",
  ) {
    const generationContext = buildGenerationContext(baseProject, step, optimizeInstruction);
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({
        taskType: step,
        projectId: baseProject.id,
        input,
        context: generationContext,
        options: {
          market: baseProject.market,
          genre: baseProject.genre,
          sourceLanguage: "中文",
          targetLanguage: baseProject.targetLanguage,
          benchmarkTitle: baseProject.benchmarkTitle,
          benchmarkLink: baseProject.benchmarkLink,
          episodeDuration: baseProject.episodeDuration,
          episodeCount: baseProject.episodeCount,
          chineseScriptRange: baseProject.chineseScriptRange,
          finalScriptVersion: baseProject.finalScriptVersion,
          localizationMode: baseProject.localizationMode,
          optimizeInstruction,
        },
        projectTitle: baseProject.title,
        market: baseProject.market,
        genre: baseProject.genre,
        benchmarkTitle: baseProject.benchmarkTitle,
        benchmarkLink: baseProject.benchmarkLink,
        idea: baseProject.idea,
        allSteps: previousStepContent(baseProject, step),
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      void refreshCredits();
      throw new Error(data.error || "生成失败，请检查 DeepSeek API。已有内容已保留。");
    }
    void refreshCredits();
    return data;
  }

  function buildGenerationContext(baseProject: DramaProject, step: TaskType, optimizeInstruction = "") {
    const bibleContext = buildStoryBibleSummary(baseProject);
    const baseContext = [bibleContext, baseProject.idea || ""].filter(Boolean).join("\n\n");
    if (step !== "brief") {
      return optimizeInstruction
        ? `${bibleContext}\n\n请根据以下优化要求重写当前页内容：${optimizeInstruction}`
        : baseContext;
    }

    const variationSeed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    if (optimizeInstruction.trim()) {
      return [
        "【创意优化硬约束】",
        `优化要求：${optimizeInstruction.trim()}`,
        "必须对当前 Brief 做结构性改写，不允许只替换同义词。",
        "至少改变以下 4 项：剧名、主角职业/身份、开场钩子、核心冲突、反派阻力、视觉母题、情绪基调。",
        "保留用户明确要求保留的设定；其余部分要大胆重构。",
        "避免套用默认桥段：重生、订婚宴羞辱、继妹顶替、隐藏继承人、董事文件、雨夜黑车，除非用户明确要求。",
        `差异化变体编号：${variationSeed}`,
        "",
        "【原始故事创意】",
        baseContext,
      ].join("\n");
    }

    return [
      baseContext,
      "",
      "【差异化生成要求】",
      "请生成一个区别于常见豪门复仇模板的版本，不要默认使用重生、订婚宴羞辱、继妹顶替、隐藏继承人、董事文件、雨夜黑车。",
      "必须加入一个鲜明的反套路锚点：特殊职业、罕见地域、非典型关系、道德两难、超现实规则或独特视觉母题。",
      `差异化变体编号：${variationSeed}`,
    ].join("\n");
  }

  async function generateForStep(
    step: TaskType,
    baseProject: DramaProject = project as DramaProject,
    extra?: { optimizeInstruction?: string; inputOverride?: string },
  ) {
    if (!baseProject) return;
    if (!session?.access_token) {
      setError("请先登录后再调用 AI 生成。本地草稿会继续保留。");
      return;
    }
    if (credits?.balance === 0) {
      setError("本月 AI 额度已用完，暂时不能继续生成。");
      return;
    }

    const blocked = getRequirement(baseProject, step);
    if (blocked) {
      setStatusText(`建议先处理：${blocked}`);
    }

    if (baseProject.workflowType === "continuation" && step === "existing_script") {
      const existingContent = baseProject.existingScript.trim() || baseProject.idea.trim() || baseProject.importedScript.trim();
      const nextProject = {
        ...setStepContent(baseProject, "existing_script", existingContent),
        status: "ready" as const,
        updatedAt: new Date().toISOString(),
      };
      const versionedProject = saveStepVersion(nextProject, "existing_script", existingContent, "manual", "导入内容自动带入");
      setProject(versionedProject);
      saveProjectEverywhere(versionedProject);
      setError("");
      setStatusText("已有剧本已从导入内容自动带入，可直接编辑。");
      return;
    }

    const stepContent = getStepContent(baseProject, step);
    const generatingProject: DramaProject = { ...baseProject, status: "generating", updatedAt: new Date().toISOString() };

    setProject(generatingProject);
    setLoading(true);
    setError("");
    setStatusText("");

    try {
      {
      const baseInput = extra?.inputOverride || getTaskInput(baseProject, step, stepContent);
      const data = await requestGenerate(step, baseProject, baseInput, extra?.optimizeInstruction || "");
      setLoading(false);

      let output = String(data.output || "");
      const expectedCount = expectedEpisodeCountForStep(baseProject, step, baseInput);
      let generatedCount = countGeneratedEpisodes(output);
      let completionAttempts = 0;

      while (expectedCount > 0 && generatedCount > 0 && generatedCount < expectedCount && completionAttempts < 2) {
        setLoading(true);
        setStatusText(`已生成 ${generatedCount}/${expectedCount} 集，正在补全缺失内容...`);
        const supplement = await requestGenerate(
          step,
          baseProject,
          missingEpisodePrompt(baseInput, output, generatedCount, expectedCount),
          extra?.optimizeInstruction || "",
        );
        output = `${output.trim()}\n\n${String(supplement.output || "").trim()}`.trim();
        generatedCount = countGeneratedEpisodes(output);
        completionAttempts += 1;
        setLoading(false);
      }

      let nextProject: DramaProject = {
        ...setStepContent(generatingProject, step, output),
        status: "ready" as const,
        updatedAt: new Date().toISOString(),
      };

      if (step === "script_import" && baseProject.workflowType === "continuation" && !nextProject.existingScript.trim()) {
        nextProject = { ...nextProject, existingScript: baseProject.idea };
      }

      if (step === "brief" && (!baseProject.title.trim() || baseProject.title.trim() === DEFAULT_TITLE)) {
        const generatedTitle = extractGeneratedTitle(output);
        if (generatedTitle) nextProject = { ...nextProject, title: generatedTitle };
      }

      nextProject = saveStepVersion(
        nextProject,
        step,
        output,
        extra?.optimizeInstruction ? "optimize" : "ai",
      );

      setProject(nextProject);
      saveProjectEverywhere(nextProject);
      const finalCount = countGeneratedEpisodes(output);
      const incompleteNotice = expectedCount > 0 && finalCount > 0 && finalCount < expectedCount
        ? `，但仍只检测到 ${finalCount}/${expectedCount} 集，可再次点击内容生成继续补齐`
        : "";
      setStatusText(`已生成：${data.meta?.taskName || "当前步骤"} (${data.meta?.model || "DeepSeek"})${incompleteNotice}`);
      void refreshGenerationTasks();
      return;
      }

      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: step,
          input: extra?.inputOverride || getTaskInput(baseProject, step, stepContent),
          context: extra?.optimizeInstruction
            ? `请根据以下优化要求重写当前页内容：${extra?.optimizeInstruction}`
            : baseProject.idea,
          options: {
            market: baseProject.market,
            genre: baseProject.genre,
            sourceLanguage: "中文",
            targetLanguage: baseProject.targetLanguage,
            benchmarkTitle: baseProject.benchmarkTitle,
            benchmarkLink: baseProject.benchmarkLink,
            episodeDuration: baseProject.episodeDuration,
            episodeCount: baseProject.episodeCount,
            chineseScriptRange: baseProject.chineseScriptRange,
            finalScriptVersion: baseProject.finalScriptVersion,
            localizationMode: baseProject.localizationMode,
            optimizeInstruction: extra?.optimizeInstruction || "",
          },
          projectTitle: baseProject.title,
          market: baseProject.market,
          genre: baseProject.genre,
          benchmarkTitle: baseProject.benchmarkTitle,
          benchmarkLink: baseProject.benchmarkLink,
          idea: baseProject.idea,
          allSteps: previousStepContent(baseProject, step),
        }),
      });

      const data = await response.json();
      setLoading(false);

      if (!response.ok || !data.success) {
        markError(generatingProject, data.error || "生成失败，请检查 DeepSeek API。已有内容已保留。");
        return;
      }

      let nextProject = {
        ...setStepContent(generatingProject, step, data.output),
        status: "ready" as const,
        updatedAt: new Date().toISOString(),
      };

      if (step === "script_import" && baseProject.workflowType === "continuation" && !nextProject.existingScript.trim()) {
        nextProject = { ...nextProject, existingScript: baseProject.idea };
      }

      if (step === "brief" && (!baseProject.title.trim() || baseProject.title.trim() === DEFAULT_TITLE)) {
        const generatedTitle = extractGeneratedTitle(data.output);
        if (generatedTitle) nextProject = { ...nextProject, title: generatedTitle };
      }

      setProject(nextProject);
      saveProjectEverywhere(nextProject);
      setStatusText(`已生成：${data.meta?.taskName || "当前步骤"} (${data.meta?.model || "DeepSeek"})`);
      void refreshGenerationTasks();
    } catch (generateError) {
      setLoading(false);
      void refreshGenerationTasks();
      if (generateError instanceof Error) {
        markError(generatingProject, generateError.message);
        return;
      }
      markError(generatingProject, "网络请求失败或超时，请稍后重试。已有内容已保留。");
    }
  }

  function markError(baseProject: DramaProject, message: string) {
    const erroredProject = { ...baseProject, status: "error" as const, updatedAt: new Date().toISOString() };
    setProject(erroredProject);
    saveProjectEverywhere(erroredProject);
    setError(message);
  }

  async function cancelTask(taskId: string) {
    if (!session?.access_token) return;
    try {
      const response = await fetch("/api/ai/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ taskId, action: "cancel" }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "取消失败");
      setStatusText("任务已标记为取消");
      void refreshGenerationTasks();
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "取消任务失败");
    }
  }

  function applyTaskOutput(task: GenerationTaskRecord) {
    if (!task.output_snapshot?.trim()) return;
    updateProject((current) => saveStepVersion(setStepContent(current, task.step_key, task.output_snapshot || ""), task.step_key, task.output_snapshot || "", "restore", "任务结果应用"), true);
    setStatusText("已应用任务结果，手动编辑内容已保留在历史记录中");
  }

  function fillDemo() {
    const demo = { ...demoProject(), id: params.projectId, updatedAt: new Date().toISOString() };
    setProject(demo);
    saveProjectEverywhere(demo);
    setActiveStep("market_analysis");
    setStatusText("已填入演示案例");
    setError("");
  }

  function loadDemoStep() {
    if (!project) return;
    const demoStep = applyDemoStep(project, activeStep);
    const nextProject = saveStepVersion(demoStep, activeStep, getStepContent(demoStep, activeStep), "demo");
    setProject(nextProject);
    saveProjectEverywhere(nextProject);
    setStatusText("已加载示例内容，仅用于现场演示");
    setError("");
  }

  async function continueNextStep() {
    if (!project) return;
    const steps = getWorkflowSteps(project);
    const currentIndex = steps.findIndex((step) => step.key === activeStep);
    const nextStep = steps[currentIndex + 1];
    if (!nextStep) return;
    setActiveStep(nextStep.key);
    if (project.workflowType === "continuation" && nextStep.key === "existing_script") {
      await generateForStep(nextStep.key, project);
      return;
    }
    await generateForStep(nextStep.key, project);
  }

  function confirmOptimize() {
    if (!project || !optimizeInstruction.trim()) return;
    const inputOverride = ["【当前内容】", activeContent, "", "【优化要求】", optimizeInstruction.trim()].join("\n");
    setOptimizeOpen(false);
    void generateForStep(activeStep, project, { optimizeInstruction: optimizeInstruction.trim(), inputOverride });
    setOptimizeInstruction("");
  }

  async function handleFiles(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file || !project) return;
    setParsingFile(true);
    setError("");

    try {
      const fileName = file.name.toLowerCase();
      let text = "";

      if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
        text = await file.text();
      } else {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/files/parse", { method: "POST", body: formData });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "文件解析失败。");
        text = data.text;
      }

      const clipped = text.trim().slice(0, 30000);
      updateField(
        "idea",
        `${project.idea.trim() ? `${project.idea.trim()}\n\n` : ""}【附件：${file.name}】\n${clipped}` as DramaProject["idea"],
      );
      setStatusText(`已解析附件：${file.name}`);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "附件解析失败，请换一个文件重试。");
    } finally {
      setParsingFile(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void handleFiles(event.dataTransfer.files);
  }

  function addManualCharacter() {
    if (!project) return;
    syncCharacterCards([...project.characterCards, createEmptyCharacterCard()]);
    setActiveStep("characters");
    setStatusText("已添加角色卡");
  }

  function removeCharacter(id: string) {
    if (!project) return;
    syncCharacterCards(project.characterCards.filter((card) => card.id !== id));
  }

  function addStoryboardEpisode() {
    if (!project) return;
    syncStoryboardEpisodes([...project.storyboardEpisodes, createEmptyStoryboardEpisode(project.storyboardEpisodes.length + 1)]);
  }

  function removeStoryboardEpisode(id: string) {
    if (!project) return;
    syncStoryboardEpisodes(project.storyboardEpisodes.filter((episode) => episode.id !== id));
  }

  function downloadBlob(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadSection(format: "md" | "word" | "pdf", title: string, content: string, landscape = false) {
    if (!project) return;
    const date = new Date().toISOString().slice(0, 10);
    const baseName = `${safeFileName(project.title)}-${title}-${date}`;

    if (format === "md") {
      downloadBlob(`${baseName}.md`, `# ${project.title}\n\n## ${title}\n\n${content}`, "text/markdown;charset=utf-8");
      return;
    }

    const html = `<!doctype html><html><head><meta charset="utf-8" /><style>
      @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 18mm; }
      body { font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif; line-height: 1.72; color: #18201d; }
      h1, h2, h3 { margin: 0 0 12px; }
      body > h1 { font-size: 24px; }
      body > h2 { font-size: 18px; margin-top: 18px; }
    </style></head><body><h1>${escapeHtml(project.title)}</h1><h2>${escapeHtml(title)}</h2>${markdownToHtml(content)}</body></html>`;

    if (format === "word") {
      downloadBlob(`${baseName}.doc`, html, "application/msword;charset=utf-8");
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("浏览器阻止了 PDF 下载窗口，请允许弹窗后重试。");
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function exportMarkdown() {
    if (!project) return;
    const markdown = exportProjectMarkdown(project);
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(`${safeFileName(project.title)}-${date}.md`, markdown, "text/markdown;charset=utf-8");
  }

  async function upgradeCurrentProjectToUniverse() {
    if (!project) return;
    if (!session?.access_token) {
      setError("Please sign in before creating a Universe.");
      return;
    }
    if (!universeEntitlement.canUse) {
      setError(universeEntitlement.reason);
      return;
    }

    const name = universeForm.name.trim() || `${project.title} Universe`;
    setUniverseBusy(true);
    setError("");
    setStatusText("");

    try {
      const { universe } = await createUniverseFromProject({
        project,
        accessToken: session.access_token,
        form: {
          name,
          description: universeForm.description || project.storyBible?.logline || project.idea,
          genre: universeForm.genre || project.genre,
          default_language: universeForm.defaultLanguage || project.targetLanguage,
          target_markets: universeForm.targetMarkets.split(",").map((item) => item.trim()).filter(Boolean),
          tone: universeForm.tone || project.storyBible?.languageStyle || "",
        },
      });
      const nextProject: DramaProject = {
        ...project,
        universeId: universe.id,
        seasonNumber: project.seasonNumber || 1,
        projectRole: project.projectRole || "main_season",
        inheritanceSettings: project.inheritanceSettings || DEFAULT_INHERITANCE_SETTINGS,
        updatedAt: new Date().toISOString(),
      };
      setProject(nextProject);
      saveProjectEverywhere(nextProject);
      setUniverseModalOpen(false);
      setStatusText("Universe created and linked. Extract candidates to Inbox when ready.");
      await refreshUniverseContext();
    } catch (upgradeError) {
      setError(upgradeError instanceof Error ? upgradeError.message : "Universe upgrade failed.");
    } finally {
      setUniverseBusy(false);
    }
  }

  async function extractProjectToUniverse() {
    if (!project || !universeBundle) return;
    if (!session?.access_token) {
      setError("Please sign in before extracting Universe updates.");
      return;
    }
    if (!universeEntitlement.canUse) {
      setError(universeEntitlement.reason);
      return;
    }

    setUniverseBusy(true);
    setError("");
    setStatusText("Extracting Universe candidates...");
    try {
      const response = await fetch("/api/universe/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ universeId: universeBundle.universe.id, project }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Extract failed.");
      await saveInboxItems(data.items || [], { accessToken: session.access_token });
      setStatusText(`Extracted ${(data.items || []).length} candidate updates to Universe Inbox.`);
      await refreshUniverseContext();
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : "Extract failed.");
    } finally {
      setUniverseBusy(false);
    }
  }

  async function runProjectCanonCheck() {
    if (!project || !universeBundle) return;
    if (!session?.access_token) {
      setError("Please sign in before running Canon Check.");
      return;
    }
    if (!universeEntitlement.canUse) {
      setError(universeEntitlement.reason);
      return;
    }

    setUniverseBusy(true);
    setError("");
    setStatusText("Running Canon Check...");
    try {
      const response = await fetch("/api/universe/canon-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ bundle: universeBundle, project }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Canon Check failed.");
      await saveCanonCheckReport(data.report, { accessToken: session.access_token });
      setStatusText(`Canon Check saved. Score ${data.report.score}/100 with ${data.report.issues_json?.length || 0} issue(s).`);
      await refreshUniverseContext();
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "Canon Check failed.");
    } finally {
      setUniverseBusy(false);
    }
  }

  if (!project) {
    return (
      <main className="app-shell">
        <section className="empty-state">
          <Loader2 className="spin" size={30} />
          <h1>正在加载项目</h1>
          <p>如果这是新项目，系统会自动创建本地草稿。</p>
          <Link className="primary-button" href="/">返回项目列表</Link>
        </section>
      </main>
    );
  }

  const selectedGenreIsOther = !GENRE_OPTIONS.includes(project.genre) || project.genre === "其他";
  const selectedMarketIsOther = !MARKET_OPTIONS.includes(project.market) || project.market === "其他";
  const scriptRange = CHINESE_SCRIPT_RANGE_OPTIONS.find((option) => option.value === project.chineseScriptRange);
  const showDownloadPanel = activeStep === "final_script" || activeStep === "storyboard_script" || activeStep === "final_delivery";
  const finalScriptContent = getSelectedFinalScript(project);
  const storyboardContent = storyboardEpisodesToMarkdown(project.storyboardEpisodes) || project.storyboardScript;
  const deliveryContent = buildDeliveryMarkdown(project, true);
  const deliveryItems = [
    { title: "故事概况及大纲", content: `${project.brief}\n\n${project.outline}`.trim(), landscape: false },
    { title: "最终剧本-中文", content: project.finalScriptChinese, landscape: false },
    { title: "最终剧本-外文", content: project.finalScriptForeign, landscape: false },
    { title: "最终剧本-双语", content: project.finalScriptBilingual, landscape: false },
    { title: "分镜", content: storyboardContent, landscape: true },
    { title: "完整交付包", content: deliveryContent, landscape: false },
  ];
  const downloadTitle =
    activeStep === "storyboard_script" ? "分镜头脚本" : activeStep === "final_delivery" ? "最终交付包" : "最终剧本";
  const downloadContent =
    activeStep === "storyboard_script" ? storyboardContent : activeStep === "final_delivery" ? deliveryContent : finalScriptContent;
  const downloadLandscape = activeStep === "storyboard_script";

  return (
    <main className="workflow-shell">
      <header className="workflow-header">
        <div className="workflow-brand">
          <Link className="icon-button" href="/" title="返回项目列表">
            <ArrowLeft size={18} />
          </Link>
          <img className="brand-logo compact" src="/storyflow-logo-white.png" alt="StoryFlow" />
        </div>
        <input
          className="title-input"
          value={project.title}
          onChange={(event) => updateField("title", event.target.value)}
          title="剧名，可手动修改"
        />
        <div className="header-actions">
          <span className="save-state"><Save size={15} /> {statusText || "本地自动保存"}</span>
          <button className="icon-button" onClick={exportMarkdown} title="导出完整 Markdown">
            <Download size={18} />
          </button>
          <Link className="icon-button" href="/settings" title="设置">
            <Settings size={18} />
          </Link>
        </div>
      </header>

      <section className="workflow-grid">
        <aside className="steps-panel">
          <div className="panel-title">
            <span>5 阶段工作台</span>
            <strong>{workflowSteps.findIndex((step) => step.key === activeStep) + 1}/{workflowSteps.length}</strong>
          </div>
          {workflowPhases.map((phase, phaseIndex) => {
            const completion = getPhaseCompletion(project, phase);
            const phaseOpen = openPhases[phase.key];
            const phaseSteps = workflowSteps.filter((step) => phase.stepKeys.includes(step.key));

            return (
              <div className="phase-group" key={phase.key}>
                <button
                  className={activePhase?.key === phase.key ? "phase-header active" : "phase-header"}
                  onClick={() => setOpenPhases((current) => ({ ...current, [phase.key]: !current[phase.key] }))}
                >
                  <span>{String(phaseIndex + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{phase.title}</strong>
                    <small>{phase.englishTitle}</small>
                  </div>
                  <em>{completion.completed}/{completion.total}</em>
                  <ChevronDown className={phaseOpen ? "toggle-icon open" : "toggle-icon"} size={16} />
                </button>
                {phaseOpen ? (
                  <div className="phase-steps">
                    {phaseSteps.map((step) => {
                      const status = getStepStatus(project, step);
                      const blocked = Boolean(getRequirement(project, step.key));
                      const statusLabel = status === "empty" ? "空" : status === "draft" ? "草稿" : status === "confirmed" ? "确认" : "需同步";

                      return (
                        <button
                          key={step.key}
                          className={step.key === activeStep ? "step-item active" : "step-item"}
                          onClick={() => setActiveStep(step.key)}
                        >
                          <span>{statusLabel}</span>
                          <div>
                            <strong>{step.short}</strong>
                            <small>{step.label}</small>
                          </div>
                          {status !== "empty" ? <CheckCircle2 size={16} /> : blocked ? <AlertCircle size={16} /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </aside>

        <section className="editor-panel">
          <div className="project-fields">
            <button className="project-fields-toggle" type="button" onClick={() => setProjectFieldsOpen((open) => !open)}>
              <div>
                <strong>{project.workflowType === "continuation" ? "续写项目信息" : "项目信息"}</strong>
                <span>{project.market} / {project.genre} / {project.episodeCount} 集 / {project.episodeDuration}</span>
              </div>
              <ChevronDown className={projectFieldsOpen ? "toggle-icon open" : "toggle-icon"} size={18} />
            </button>

            {projectFieldsOpen ? (
              <div className="project-fields-body">
            <div className="compact-fields">
              <label>
                目标市场
                <select
                  value={selectedMarketIsOther ? "其他" : project.market}
                  onChange={(event) => updateField("market", event.target.value)}
                >
                  {MARKET_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                题材
                <select
                  value={selectedGenreIsOther ? "其他" : project.genre}
                  onChange={(event) => updateField("genre", event.target.value)}
                >
                  {GENRE_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                竞品名称
                <input value={project.benchmarkTitle} onChange={(event) => updateField("benchmarkTitle", event.target.value)} />
              </label>
            </div>

            <div className="compact-fields">
              <label>
                集数
                <select value={project.episodeCount} onChange={(event) => updateField("episodeCount", Number(event.target.value))}>
                  {EPISODE_COUNT_OPTIONS.map((option) => <option key={option} value={option}>{option} 集</option>)}
                </select>
              </label>
              <label>
                每集片长
                <select value={project.episodeDuration} onChange={(event) => updateField("episodeDuration", event.target.value)}>
                  {EPISODE_DURATION_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                竞品链接
                <input
                  value={project.benchmarkLink}
                  onChange={(event) => updateField("benchmarkLink", event.target.value)}
                  placeholder="TikTok / YouTube / DramaBox / ReelShort / WebNovel..."
                />
              </label>
            </div>

            {(selectedMarketIsOther || selectedGenreIsOther) ? (
              <div className="compact-fields">
                {selectedMarketIsOther ? (
                  <label>
                    其他市场
                    <input value={project.market === "其他" ? "" : project.market} onChange={(event) => updateField("market", event.target.value || "其他")} />
                  </label>
                ) : null}
                {selectedGenreIsOther ? (
                  <label>
                    其他题材
                    <input value={project.genre === "其他" ? "" : project.genre} onChange={(event) => updateField("genre", event.target.value || "其他")} />
                  </label>
                ) : null}
              </div>
            ) : null}

            <label>
              {project.workflowType === "continuation" ? "剧本导入材料" : "故事创意"}
              <textarea
                className="idea-input"
                value={project.idea}
                onChange={(event) => updateField("idea", event.target.value)}
                placeholder={project.workflowType === "continuation" ? "粘贴已有小说/剧本，或拖入附件解析，系统会先整理成续写底稿。" : "一句话创意，或拖入已有小说/剧本附件，支持 txt、md、pdf、doc、docx。"}
              />
            </label>
            <div
              className="file-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {parsingFile ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
              <span>一键拖入附件解析：txt / md / pdf / doc / docx</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.pdf,.doc,.docx"
                hidden
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  if (event.target.files) void handleFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>
              </div>
            ) : null}
          </div>

          <div className="story-bible-panel">
            <div className="story-bible-head">
              <div>
                <span>Story Bible</span>
                <strong>统一设定库</strong>
              </div>
              <small>AI 生成会自动读取这些核心设定</small>
            </div>
            <div className="story-bible-grid">
              <label>
                一句话故事
                <textarea value={storyBible?.logline || ""} onChange={(event) => updateStoryBibleField("logline", event.target.value)} />
              </label>
              <label>
                核心卖点
                <textarea value={storyBible?.sellingPoint || ""} onChange={(event) => updateStoryBibleField("sellingPoint", event.target.value)} />
              </label>
              <label>
                主线冲突
                <textarea value={storyBible?.mainConflict || ""} onChange={(event) => updateStoryBibleField("mainConflict", event.target.value)} />
              </label>
              <label>
                禁改设定
                <textarea value={storyBible?.lockedCanon || ""} onChange={(event) => updateStoryBibleField("lockedCanon", event.target.value)} />
              </label>
            </div>
            <details className="story-bible-more">
              <summary>更多设定</summary>
              <div className="story-bible-grid">
                <label>
                  世界观
                  <textarea value={storyBible?.world || ""} onChange={(event) => updateStoryBibleField("world", event.target.value)} />
                </label>
                <label>
                  角色关系
                  <textarea value={storyBible?.characterRelationships || ""} onChange={(event) => updateStoryBibleField("characterRelationships", event.target.value)} />
                </label>
                <label>
                  语言风格
                  <textarea value={storyBible?.languageStyle || ""} onChange={(event) => updateStoryBibleField("languageStyle", event.target.value)} />
                </label>
                <label>
                  节奏规则
                  <textarea value={storyBible?.pacingRules || ""} onChange={(event) => updateStoryBibleField("pacingRules", event.target.value)} />
                </label>
                <label>
                  已确认事实
                  <textarea value={storyBible?.confirmedFacts || ""} onChange={(event) => updateStoryBibleField("confirmedFacts", event.target.value)} />
                </label>
              </div>
            </details>
          </div>

          <div className="editor-head">
            <div>
              <span>{activeMeta.label}</span>
              <h1>{activeMeta.short}</h1>
            </div>
            <button className="secondary-button demo-control" onClick={fillDemo}>
              <WandSparkles size={17} /> 演示案例
            </button>
          </div>

          {activeStep === "characters" ? (
            <div className="character-workspace">
              <div className="segmented-control">
                <button className={characterView === "cards" ? "active" : ""} onClick={() => setCharacterView("cards")}>角色卡</button>
                <button className={characterView === "relationships" ? "active" : ""} onClick={() => setCharacterView("relationships")}>人物关系图</button>
              </div>
              {characterView === "relationships" ? (
                <div className="relationship-image-workspace">
                  <div className="relationship-toolbar">
                    <div>
                      <strong>图片关系图</strong>
                      <span>由 MiniMax 根据角色卡和关系描述生成</span>
                    </div>
                    <button className="primary-button" onClick={generateRelationshipImage} disabled={imageLoading || !session || credits?.balance === 0 || (!project.characterCards.length && !project.relationshipDiagram.trim())}>
                      {imageLoading ? <Loader2 className="spin" size={17} /> : <WandSparkles size={17} />}
                      生成图片关系图
                    </button>
                  </div>
                  {project.relationshipImageUrl ? (
                    <div className="relationship-image-preview">
                      <img src={project.relationshipImageUrl} alt="人物关系图" />
                      <a className="secondary-button" href={project.relationshipImageUrl} target="_blank" rel="noreferrer">
                        打开原图
                      </a>
                    </div>
                  ) : (
                    <div className="relationship-image-empty">
                      <UserPlus size={26} />
                      <p>生成后会在这里显示图片格式的人物关系图。</p>
                    </div>
                  )}
                <textarea
                  className="script-editor"
                  value={project.relationshipDiagram}
                  onChange={(event) => updateField("relationshipDiagram", event.target.value)}
                  placeholder="用文字描述人物关系图，例如：林晚 -> 复仇对象 -> 林薇；沈烬 -> 秘密盟友 -> 林晚。"
                />
                </div>
              ) : (
                <div className="character-grid">
                  {project.characterCards.length === 0 ? (
                    <div className="empty-character">
                      <UserPlus size={24} />
                      <h2>还没有角色卡</h2>
                      <p>点击内容生成，或手动添加一个角色卡。</p>
                    </div>
                  ) : null}

                  {project.characterCards.map((card) => (
                    <article className="character-card" key={card.id}>
                      <div className="character-card-head">
                        <input value={card.name} onChange={(event) => updateCharacterCard(card.id, "name", event.target.value)} placeholder="角色名" />
                        <button className="icon-button subtle" onClick={() => removeCharacter(card.id)} title="删除角色">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="character-image-panel">
                        {card.imageUrl ? (
                          <img src={card.imageUrl} alt={`${card.name || "角色"}形象图`} />
                        ) : (
                          <div className="character-image-placeholder">
                            <UserPlus size={22} />
                            <span>角色图</span>
                          </div>
                        )}
                        <button
                          className="secondary-button"
                          onClick={() => generateCharacterImage(card)}
                          disabled={characterImageLoadingId === card.id || !session || credits?.balance === 0 || (!card.name.trim() && !card.appearancePrompt.trim())}
                        >
                          {characterImageLoadingId === card.id ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}
                          生成角色图片
                        </button>
                      </div>
                      <div className="character-fields">
                        <label>功能<input value={card.role} onChange={(event) => updateCharacterCard(card.id, "role", event.target.value)} /></label>
                        <label>身份<input value={card.identity} onChange={(event) => updateCharacterCard(card.id, "identity", event.target.value)} /></label>
                        <label>目标<textarea value={card.goal} onChange={(event) => updateCharacterCard(card.id, "goal", event.target.value)} /></label>
                        <label>弱点<textarea value={card.weakness} onChange={(event) => updateCharacterCard(card.id, "weakness", event.target.value)} /></label>
                        <label>秘密<textarea value={card.secret} onChange={(event) => updateCharacterCard(card.id, "secret", event.target.value)} /></label>
                        <label>成长弧线<textarea value={card.arc} onChange={(event) => updateCharacterCard(card.id, "arc", event.target.value)} /></label>
                        <label>冲突关系<textarea value={card.conflict} onChange={(event) => updateCharacterCard(card.id, "conflict", event.target.value)} /></label>
                        <label>首次登场画面<textarea value={card.entrance} onChange={(event) => updateCharacterCard(card.id, "entrance", event.target.value)} /></label>
                        <label>典型短对白<textarea value={card.line} onChange={(event) => updateCharacterCard(card.id, "line", event.target.value)} /></label>
                        <label>人物形象提示词<textarea value={card.appearancePrompt} onChange={(event) => updateCharacterCard(card.id, "appearancePrompt", event.target.value)} /></label>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : activeStep === "storyboard_script" ? (
            <div className="storyboard-grid">
              {project.storyboardEpisodes.length === 0 ? (
                <div className="empty-character">
                  <FileText size={24} />
                  <h2>还没有分集分镜</h2>
                  <p>点击内容生成，系统会按集拆分分镜头脚本。</p>
                </div>
              ) : null}
              {project.storyboardEpisodes.map((episode) => (
                <article className="storyboard-card" key={episode.id}>
                  <div className="character-card-head">
                    <input value={episode.title} onChange={(event) => updateStoryboardEpisode(episode.id, "title", event.target.value)} />
                    <button className="icon-button subtle" onClick={() => removeStoryboardEpisode(episode.id)} title="删除本集">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <textarea value={episode.content} onChange={(event) => updateStoryboardEpisode(episode.id, "content", event.target.value)} />
                </article>
              ))}
            </div>
          ) : activeStep === "final_delivery" ? (
            <div className="delivery-workspace">
              {deliveryItems.map((item) => (
                <article className="delivery-card" key={item.title}>
                  <div>
                    <h2>{item.title}</h2>
                    <p>{item.content.trim() ? "已准备下载" : "尚未生成内容"}</p>
                  </div>
                  <div className="delivery-actions">
                    <button disabled={!item.content.trim()} onClick={() => downloadSection("word", item.title, item.content, item.landscape)}>Word</button>
                    <button disabled={!item.content.trim()} onClick={() => downloadSection("md", item.title, item.content, item.landscape)}>MD</button>
                    <button disabled={!item.content.trim()} onClick={() => downloadSection("pdf", item.title, item.content, item.landscape)}>PDF</button>
                  </div>
                </article>
              ))}
            </div>
          ) : activeStep === "localization" && project.localizationMode === "revision" ? (
            <div className="revision-workspace">
              <div
                className="revision-preview"
                dangerouslySetInnerHTML={{
                  __html: revisionMarkupToHtml(activeContent || "选择“内容生成”后，这里会展示带红色修订标注的本土化结果。"),
                }}
              />
              <textarea
                className="script-editor revision-source"
                value={activeContent}
                onChange={(event) => updateStep(activeStep, event.target.value)}
                placeholder="红色修订模式会使用 <span class=&quot;revision-mark&quot;>...</span> 标注修改部分，也可以在这里手动编辑。"
              />
            </div>
          ) : activeStep === "localization" && activeContent.trim() ? (
            <div className="hybrid-editor">
              <div className="localization-diff-grid">
                <div className="diff-head">原文</div>
                <div className="diff-head">本土化版本</div>
                <div className="diff-head">修改原因</div>
                {localizationDiffRows.map((row, index) => (
                  <div className="diff-row" key={index}>
                    <p>{row.before || "—"}</p>
                    <p>{row.after || "—"}</p>
                    <strong>{row.reason}</strong>
                  </div>
                ))}
              </div>
              <textarea
                className="script-editor"
                value={activeContent}
                onChange={(event) => updateStep(activeStep, event.target.value)}
                placeholder="AI 生成内容会出现在这里，也可以直接手动编辑。"
              />
            </div>
          ) : (activeStep === "chinese_script" || activeStep === "continuation_script" || activeStep === "final_script") && activeContent.trim() ? (
            <div className="hybrid-editor">
              <div className="structured-script">
                {structuredEpisodes.slice(0, 12).map((episode) => (
                  <article className="structured-episode" key={episode.id}>
                    <div className="structured-episode-head">
                      <span>Episode {episode.episodeNo}</span>
                      <strong>{episode.title}</strong>
                    </div>
                    <div className="structured-meta">
                      <p><b>开场钩子</b>{episode.openingHook || "待补充"}</p>
                      <p><b>情绪目标</b>{episode.emotionalGoal || "待补充"}</p>
                      <p><b>核心冲突</b>{episode.conflict || "待补充"}</p>
                      <p><b>集尾钩子</b>{episode.cliffhanger || "待补充"}</p>
                    </div>
                    <div className="structured-scenes">
                      {episode.scenes.slice(0, 8).map((scene) => (
                        <section className="structured-scene" key={scene.id}>
                          <div>
                            <strong>Scene {scene.sceneNo}</strong>
                            <span>{scene.location || "地点待补充"} · {scene.time || "时间待补充"}</span>
                          </div>
                          <p><b>功能</b>{scene.function || "待补充"}</p>
                          <p><b>冲突</b>{scene.conflict || "待补充"}</p>
                          <p><b>价值变化</b>{scene.valueShift || "待补充"}</p>
                          <p><b>前后因果</b>{scene.causeEffect || "待补充"}</p>
                          {scene.visualPrompt ? <p><b>视觉提示词</b>{scene.visualPrompt}</p> : null}
                          <div className="beat-list">
                            {scene.beats.slice(0, 6).map((beat) => (
                              <span key={beat.id}>{beat.type}{beat.character ? ` · ${beat.character}` : ""}</span>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              <textarea
                className="script-editor"
                value={activeContent}
                onChange={(event) => updateStep(activeStep, event.target.value)}
                placeholder="AI 生成内容会出现在这里，也可以直接手动编辑。"
              />
            </div>
          ) : activeStep === "quality_evaluation" && activeContent.trim() ? (
            <div className="hybrid-editor">
              <div className="drama-score-panel">
                <div className="drama-score-total">
                  <span>DramaScore</span>
                  <strong>{dramaScore.total}</strong>
                  <small>/ 10</small>
                </div>
                <div className="drama-score-grid">
                  {dramaScore.items.map((item) => (
                    <article className="drama-score-card" key={item.item}>
                      <div>
                        <strong>{item.item}</strong>
                        <span>{item.score}/10</span>
                      </div>
                      <p><b>问题</b>{item.issue}</p>
                      <p><b>建议</b>{item.suggestion}</p>
                      <button className="secondary-button" disabled>一键改写（预留）</button>
                    </article>
                  ))}
                </div>
              </div>
              <textarea
                className="script-editor"
                value={activeContent}
                onChange={(event) => updateStep(activeStep, event.target.value)}
                placeholder="AI 生成内容会出现在这里，也可以直接手动编辑。"
              />
            </div>
          ) : (
            <textarea
              className="script-editor"
              value={activeContent}
              onChange={(event) => updateStep(activeStep, event.target.value)}
              placeholder="AI 生成内容会出现在这里，也可以直接手动编辑。"
            />
          )}
        </section>

        <aside className="ai-panel">
          <div>
            <span className="kicker">AI 助手</span>
            <h2>内容生成</h2>
            {credits ? <small className="field-note">剩余额度：{credits.balance}/{credits.monthlyLimit}</small> : null}
          </div>

          <div className="universe-mini-panel">
            <div className="universe-mini-head">
              <div>
                <span className="kicker">Universe Engine</span>
                <h2>{universeBundle?.universe.name || "No Universe linked"}</h2>
              </div>
              <BookOpen size={20} />
            </div>
            {universeBundle ? (
              <>
                <div className="universe-mini-stats">
                  <span>{universeBundle.entities.filter((item) => item.type === "character").length} characters</span>
                  <span>{universeBundle.relationships.length} relationships</span>
                  <span>{universeBundle.canonFacts.length} facts</span>
                  <span>{universeBundle.inbox.filter((item) => item.status === "pending").length} inbox</span>
                </div>
                <p className="universe-mini-fact">
                  {universeBundle.canonFacts[0]?.fact_text || "Extract project updates into Inbox, then accept items to build canon."}
                </p>
                <div className="universe-mini-actions">
                  <Link className="secondary-button full" href={`/universes/${universeBundle.universe.id}`}>View Universe</Link>
                  <button className="secondary-button full" disabled={universeBusy || !universeEntitlement.canUse} onClick={extractProjectToUniverse}>
                    {universeBusy ? <Loader2 className="spin" size={16} /> : null}
                    Extract to Inbox
                  </button>
                  <button className="secondary-button full" disabled={universeBusy || !universeEntitlement.canUse} onClick={runProjectCanonCheck}>
                    Run Canon Check
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>Upgrade this project into a reusable IP Universe. AI suggestions go to Inbox first and never become canon without review.</p>
                <button
                  className="primary-button full"
                  disabled={!universeEntitlement.canUse}
                  onClick={() => {
                    setUniverseForm((current) => ({
                      ...current,
                      name: current.name || `${project.title} Universe`,
                      description: current.description || project.storyBible?.logline || project.idea,
                      genre: current.genre || project.genre,
                      defaultLanguage: current.defaultLanguage || project.targetLanguage,
                      targetMarkets: current.targetMarkets || project.market,
                      tone: current.tone || project.storyBible?.languageStyle || "",
                    }));
                    setUniverseModalOpen(true);
                  }}
                >
                  Upgrade to Universe
                </button>
                {!universeEntitlement.canUse ? <div className="notice warning">Studio Annual / Enterprise required. Owned Universes stay read-only and exportable.</div> : null}
              </>
            )}
          </div>

          {activeStep === "chinese_script" ? (
            <label>
              中文剧本范围
              <select value={project.chineseScriptRange} onChange={(event) => updateField("chineseScriptRange", event.target.value as DramaProject["chineseScriptRange"])}>
                {CHINESE_SCRIPT_RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <small className="field-note">{scriptRange?.description}</small>
            </label>
          ) : null}

          {activeStep === "translation" ? (
            <label>
              翻译语言
              <select value={project.targetLanguage} onChange={(event) => updateField("targetLanguage", event.target.value)}>
                {LANGUAGE_OPTIONS.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
          ) : null}

          {activeStep === "localization" ? (
            <label>
              本土化输出方式
              <select value={project.localizationMode} onChange={(event) => updateField("localizationMode", event.target.value as DramaProject["localizationMode"])}>
                {LOCALIZATION_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <small className="field-note">{LOCALIZATION_MODE_OPTIONS.find((option) => option.value === project.localizationMode)?.description}</small>
            </label>
          ) : null}

          {activeStep === "final_script" ? (
            <label>
              最终剧本版本
              <select value={project.finalScriptVersion} onChange={(event) => updateField("finalScriptVersion", event.target.value as DramaProject["finalScriptVersion"])}>
                {FINAL_SCRIPT_VERSION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ) : null}

          {activeStep === "characters" ? (
            <button className="secondary-button full" onClick={addManualCharacter}>
              <UserPlus size={18} /> 手动添加角色
            </button>
          ) : null}

          {activeStep === "storyboard_script" ? (
            <button className="secondary-button full" onClick={addStoryboardEpisode}>
              <Plus size={18} /> 添加分集模块
            </button>
          ) : null}

          {showDownloadPanel ? (
            <div className="download-panel">
              <strong>{downloadTitle}下载</strong>
              {activeStep === "final_delivery" ? (
                <div className="download-matrix">
                  {deliveryItems.map((item) => (
                    <div className="download-row" key={item.title}>
                      <span>{item.title}</span>
                      <button disabled={!item.content.trim()} onClick={() => downloadSection("word", item.title, item.content, item.landscape)}>Word</button>
                      <button disabled={!item.content.trim()} onClick={() => downloadSection("md", item.title, item.content, item.landscape)}>MD</button>
                      <button disabled={!item.content.trim()} onClick={() => downloadSection("pdf", item.title, item.content, item.landscape)}>PDF</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="download-actions">
                  <button className="secondary-button full" disabled={!downloadContent.trim()} onClick={() => downloadSection("word", downloadTitle, downloadContent, downloadLandscape)}>
                    <FileText size={17} /> 下载 Word
                  </button>
                  <button className="secondary-button full" disabled={!downloadContent.trim()} onClick={() => downloadSection("md", downloadTitle, downloadContent, downloadLandscape)}>
                    <Download size={17} /> 下载 MD
                  </button>
                  <button className="secondary-button full" disabled={!downloadContent.trim()} onClick={() => downloadSection("pdf", downloadTitle, downloadContent, downloadLandscape)}>
                    <Download size={17} /> 下载 PDF
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {activeStep !== "final_delivery" ? (
            <div className="history-tools">
              <button className="secondary-button full" onClick={() => recordStepVersion(activeStep, activeContent, "manual")} disabled={!activeContent.trim()}>
                <Save size={17} /> 保存当前版本
              </button>
              <button className="secondary-button full" onClick={() => setHistoryOpen((open) => !open)}>
                <History size={17} /> 查看历史记录
              </button>
              {historyOpen ? (
                <div className="history-panel">
                  {activeVersions.length === 0 ? (
                    <p>暂无历史版本</p>
                  ) : (
                    activeVersions.map((version) => (
                      <button className="history-item" key={version.id} onClick={() => restoreVersion(version.content)}>
                        <strong>{version.label}</strong>
                        <span>{new Date(version.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTaskRecords.length ? (
            <div className="task-status-panel">
              <div className="task-status-head">
                <strong>AI 任务状态</strong>
                <button onClick={() => void refreshGenerationTasks()}>刷新</button>
              </div>
              {activeTaskRecords.map((task) => (
                <article className={`task-status-card ${task.status}`} key={task.id}>
                  <div>
                    <span>{task.status}</span>
                    <small>{task.provider || "AI"} · {task.model || "model"}</small>
                  </div>
                  {task.error_message ? <p>{task.error_message}</p> : null}
                  <div className="task-actions">
                    {task.status === "failed" ? <button onClick={() => generateForStep(task.step_key)}>重试</button> : null}
                    {task.output_snapshot ? <button onClick={() => applyTaskOutput(task)}>应用结果</button> : null}
                    {task.output_snapshot ? <button onClick={() => recordStepVersion(task.step_key, task.output_snapshot || "", "restore", "任务结果版本")}>保存版本</button> : null}
                    {["queued", "running", "streaming", "retrying"].includes(task.status) ? <button onClick={() => cancelTask(task.id)}>取消</button> : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {requirement ? <div className="notice warning"><AlertCircle size={17} /> {requirement}</div> : null}
          {!session ? (
            <div className="notice warning"><AlertCircle size={17} /> 登录后才可以调用 AI 生成；当前内容仍会保存为本地草稿。</div>
          ) : null}
          {false && aiConfigured === false ? (
            <div className="notice warning">
              <AlertCircle size={17} /> AI 生成尚未完成服务端配置，可先加载示例内容演示。
            </div>
          ) : null}
          {error ? <div className="notice error"><AlertCircle size={17} /> {error}</div> : null}
          {statusText ? <div className="notice success"><CheckCircle2 size={17} /> {statusText}</div> : null}

          {activeStep === "final_delivery" ? (
            <div className="notice success"><CheckCircle2 size={17} /> 交付文件已整理为下载清单。</div>
          ) : (
            <>
              <button className="primary-button full" onClick={() => generateForStep(activeStep)} disabled={loading || !session || credits?.balance === 0}>
                {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
                内容生成
              </button>
              <button className="secondary-button full" onClick={() => setOptimizeOpen(true)} disabled={loading || !activeContent.trim() || !session || credits?.balance === 0}>
                优化内容
              </button>
              <button className="secondary-button full" onClick={continueNextStep} disabled={loading || !session || credits?.balance === 0}>
                继续下一步并生成
              </button>
              <button className="secondary-button full demo-control" onClick={loadDemoStep}>
                <WandSparkles size={18} /> 加载当前步骤示例内容
              </button>
            </>
          )}
        </aside>
      </section>

      {universeModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal wizard-modal">
            <h2>Upgrade to Universe</h2>
            <p>Create the long-term IP layer for this project. Extracted updates will go to Inbox first for manual canon review.</p>
            <div className="wizard-grid">
              <label>
                Universe name
                <input value={universeForm.name} onChange={(event) => setUniverseForm((current) => ({ ...current, name: event.target.value }))} autoFocus />
              </label>
              <label>
                Genre
                <input value={universeForm.genre} onChange={(event) => setUniverseForm((current) => ({ ...current, genre: event.target.value }))} />
              </label>
              <label>
                Default language
                <input value={universeForm.defaultLanguage} onChange={(event) => setUniverseForm((current) => ({ ...current, defaultLanguage: event.target.value }))} />
              </label>
              <label>
                Target markets
                <input value={universeForm.targetMarkets} onChange={(event) => setUniverseForm((current) => ({ ...current, targetMarkets: event.target.value }))} />
              </label>
            </div>
            <label>
              Description
              <textarea value={universeForm.description} onChange={(event) => setUniverseForm((current) => ({ ...current, description: event.target.value }))} />
            </label>
            <label>
              Tone / style guide
              <textarea value={universeForm.tone} onChange={(event) => setUniverseForm((current) => ({ ...current, tone: event.target.value }))} />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setUniverseModalOpen(false)} disabled={universeBusy}>Cancel</button>
              <button className="primary-button" onClick={upgradeCurrentProjectToUniverse} disabled={universeBusy}>
                {universeBusy ? <Loader2 className="spin" size={17} /> : null}
                Create Universe
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {optimizeOpen ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>优化内容</h2>
            <p>输入本页内容的优化要求，确认后会重新生成当前阶段内容。</p>
            <textarea
              value={optimizeInstruction}
              onChange={(event) => setOptimizeInstruction(event.target.value)}
              placeholder="例如：加强第 1 集结尾钩子，删掉解释性对白，让女主更克制但更有压迫感。"
            />
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setOptimizeOpen(false)}>取消</button>
              <button className="primary-button" onClick={confirmOptimize} disabled={!optimizeInstruction.trim() || loading}>确认优化</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
