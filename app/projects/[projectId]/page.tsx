"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
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
  buildDeliveryMarkdown,
  CharacterCard,
  characterCardsToMarkdown,
  CHINESE_SCRIPT_RANGE_OPTIONS,
  createEmptyCharacterCard,
  createEmptyStoryboardEpisode,
  createProject,
  demoProject,
  DramaProject,
  EPISODE_COUNT_OPTIONS,
  EPISODE_DURATION_OPTIONS,
  exportProjectMarkdown,
  FINAL_SCRIPT_VERSION_OPTIONS,
  GENRE_OPTIONS,
  getSelectedFinalScript,
  getStepContent,
  LANGUAGE_OPTIONS,
  MARKET_OPTIONS,
  readProjectsFromStorage,
  setStepContent,
  StoryboardEpisode,
  storyboardEpisodesToMarkdown,
  upsertProject,
  workflowSteps,
} from "@/lib/projects";

const DEFAULT_TITLE = "未命名短剧项目";

function getPreviousKey(taskType: TaskType): TaskType | null {
  const index = workflowSteps.findIndex((step) => step.key === taskType);
  if (index <= 0) return null;
  return workflowSteps[index - 1].key;
}

function getRequirement(project: DramaProject, taskType: TaskType) {
  if (taskType === "market_analysis") return project.market && project.genre ? "" : "请先选择目标市场和题材。";
  if (taskType === "brief") return project.idea.trim() ? "" : "请先填写故事创意，或拖入附件解析。";
  if (taskType === "characters") return project.brief.trim() ? "" : "请先完成创意。";
  if (taskType === "series_outline") return project.characterCards.length ? "" : "请先生成或添加角色卡。";
  if (taskType === "final_script") return project.testScript.trim() && project.qualityEvaluation.trim() ? "" : "请先完成测试剧本和评估。";
  if (taskType === "storyboard_script") return getSelectedFinalScript(project).trim() ? "" : "请先生成最终剧本。";
  if (taskType === "final_delivery") return project.storyboardEpisodes.length || project.storyboardScript.trim() ? "" : "请先生成分镜。";

  const previousKey = getPreviousKey(taskType);
  if (!previousKey) return "";

  return getStepContent(project, previousKey).trim()
    ? ""
    : `请先完成上一步：${workflowSteps.find((step) => step.key === previousKey)?.short}`;
}

function previousStepContent(project: DramaProject, activeStep: TaskType) {
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
  if (activeStep === "characters") return project.brief;
  if (activeStep === "series_outline") return characterCardsToMarkdown(project.characterCards) || project.brief;
  if (activeStep === "chinese_script") return project.outline;
  if (activeStep === "translation") return project.chineseScript;
  if (activeStep === "localization") return project.translation;
  if (activeStep === "test_script") return project.localization;
  if (activeStep === "quality_evaluation") return project.testScript;
  if (activeStep === "final_script") {
    return [
      "【测试剧本】",
      project.testScript,
      "",
      "【评估与修订要求】",
      project.qualityEvaluation,
      "",
      "【中文剧本】",
      project.chineseScript,
      "",
      "【外语剧本】",
      project.translation,
    ].join("\n");
  }
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

export default function WorkflowPage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [project, setProject] = useState<DramaProject | null>(null);
  const [activeStep, setActiveStep] = useState<TaskType>("market_analysis");
  const [loading, setLoading] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);
  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [characterView, setCharacterView] = useState<"cards" | "relationships">("cards");
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [optimizeInstruction, setOptimizeInstruction] = useState("");

  useEffect(() => {
    const projects = readProjectsFromStorage();
    const found = projects.find((item) => item.id === params.projectId);

    if (found) {
      setProject(found);
      return;
    }

    const created =
      searchParams.get("template") === "demo"
        ? { ...demoProject(), id: params.projectId, updatedAt: new Date().toISOString() }
        : createProject({ id: params.projectId });

    setProject(created);
    upsertProject(created);
  }, [params.projectId, searchParams]);

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

  const activeMeta = useMemo(
    () => workflowSteps.find((step) => step.key === activeStep) || workflowSteps[0],
    [activeStep],
  );

  const requirement = project ? getRequirement(project, activeStep) : "";
  const activeContent = project ? getStepContent(project, activeStep) : "";

  function persist(nextProject: DramaProject, immediate = false) {
    if (saveTimer.current) clearTimeout(saveTimer.current);

    if (immediate) {
      upsertProject(nextProject);
      setStatusText("已自动保存");
      return;
    }

    setStatusText("正在保存...");
    saveTimer.current = setTimeout(() => {
      upsertProject(nextProject);
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
    updateProject((current) => ({
      ...current,
      [key]: value,
      status: "draft",
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateStep(taskType: TaskType, content: string) {
    updateProject((current) => ({ ...setStepContent(current, taskType, content), status: "draft" }));
  }

  function syncCharacterCards(cards: CharacterCard[]) {
    updateProject((current) => ({
      ...current,
      characterCards: cards,
      characters: characterCardsToMarkdown(cards),
      status: "draft",
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateCharacterCard(id: string, key: keyof CharacterCard, value: string) {
    if (!project) return;
    syncCharacterCards(project.characterCards.map((card) => (card.id === id ? { ...card, [key]: value } : card)));
  }

  function syncStoryboardEpisodes(episodes: StoryboardEpisode[]) {
    updateProject((current) => ({
      ...current,
      storyboardEpisodes: episodes,
      storyboardScript: storyboardEpisodesToMarkdown(episodes),
      status: "draft",
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateStoryboardEpisode(id: string, key: keyof StoryboardEpisode, value: string) {
    if (!project) return;
    syncStoryboardEpisodes(project.storyboardEpisodes.map((episode) => (episode.id === id ? { ...episode, [key]: value } : episode)));
  }

  async function generateForStep(
    step: TaskType,
    baseProject = project,
    extra?: { optimizeInstruction?: string; inputOverride?: string },
  ) {
    if (!baseProject) return;

    const blocked = getRequirement(baseProject, step);
    if (blocked) {
      setError(blocked);
      return;
    }

    const stepContent = getStepContent(baseProject, step);
    const generatingProject: DramaProject = { ...baseProject, status: "generating", updatedAt: new Date().toISOString() };

    setProject(generatingProject);
    upsertProject(generatingProject);
    setLoading(true);
    setError("");
    setStatusText("");

    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: step,
          input: extra?.inputOverride || getTaskInput(baseProject, step, stepContent),
          context: extra?.optimizeInstruction
            ? `请根据以下优化要求重写当前页内容：${extra.optimizeInstruction}`
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

      if (step === "brief" && (!baseProject.title.trim() || baseProject.title.trim() === DEFAULT_TITLE)) {
        const generatedTitle = extractGeneratedTitle(data.output);
        if (generatedTitle) nextProject = { ...nextProject, title: generatedTitle };
      }

      setProject(nextProject);
      upsertProject(nextProject);
      setStatusText(`已生成：${data.meta?.taskName || "当前步骤"} (${data.meta?.model || "DeepSeek"})`);
    } catch {
      setLoading(false);
      markError(generatingProject, "网络请求失败或超时，请稍后重试。已有内容已保留。");
    }
  }

  function markError(baseProject: DramaProject, message: string) {
    const erroredProject = { ...baseProject, status: "error" as const, updatedAt: new Date().toISOString() };
    setProject(erroredProject);
    upsertProject(erroredProject);
    setError(message);
  }

  function fillDemo() {
    const demo = { ...demoProject(), id: params.projectId, updatedAt: new Date().toISOString() };
    setProject(demo);
    upsertProject(demo);
    setActiveStep("market_analysis");
    setStatusText("已填入演示案例");
    setError("");
  }

  function loadDemoStep() {
    if (!project) return;
    const nextProject = applyDemoStep(project, activeStep);
    setProject(nextProject);
    upsertProject(nextProject);
    setStatusText("已加载示例内容，仅用于现场演示");
    setError("");
  }

  async function continueNextStep() {
    if (!project) return;
    const currentIndex = workflowSteps.findIndex((step) => step.key === activeStep);
    const nextStep = workflowSteps[currentIndex + 1];
    if (!nextStep) return;
    setActiveStep(nextStep.key);
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
  const downloadTitle =
    activeStep === "storyboard_script" ? "分镜头脚本" : activeStep === "final_delivery" ? "最终交付包" : "最终剧本";
  const downloadContent =
    activeStep === "storyboard_script" ? storyboardContent : activeStep === "final_delivery" ? deliveryContent : finalScriptContent;
  const downloadLandscape = activeStep === "storyboard_script";

  return (
    <main className="workflow-shell">
      <header className="workflow-header">
        <Link className="icon-button" href="/" title="返回项目列表">
          <ArrowLeft size={18} />
        </Link>
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
            <span>流程导航</span>
            <strong>{workflowSteps.findIndex((step) => step.key === activeStep) + 1}/{workflowSteps.length}</strong>
          </div>
          {workflowSteps.map((step, index) => {
            const done = step.key === "characters"
              ? project.characterCards.length > 0
              : step.key === "storyboard_script"
                ? project.storyboardEpisodes.length > 0
                : Boolean(getStepContent(project, step.key).trim());
            const blocked = Boolean(getRequirement(project, step.key));

            return (
              <button
                key={step.key}
                className={step.key === activeStep ? "step-item active" : "step-item"}
                onClick={() => setActiveStep(step.key)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{step.short}</strong>
                  <small>{step.label}</small>
                </div>
                {done ? <CheckCircle2 size={16} /> : blocked ? <AlertCircle size={16} /> : null}
              </button>
            );
          })}
        </aside>

        <section className="editor-panel">
          <div className="project-fields">
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
              故事创意
              <textarea
                className="idea-input"
                value={project.idea}
                onChange={(event) => updateField("idea", event.target.value)}
                placeholder="一句话创意，或拖入已有小说/剧本附件，支持 txt、md、pdf、doc、docx。"
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

          <div className="editor-head">
            <div>
              <span>{activeMeta.label}</span>
              <h1>{activeMeta.short}</h1>
            </div>
            <button className="secondary-button" onClick={fillDemo}>
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
                <textarea
                  className="script-editor"
                  value={project.relationshipDiagram}
                  onChange={(event) => updateField("relationshipDiagram", event.target.value)}
                  placeholder="用文字描述人物关系图，例如：林晚 -> 复仇对象 -> 林薇；沈烬 -> 秘密盟友 -> 林晚。"
                />
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
            <p>当前步骤会调用 `/api/ai/generate`，由服务端读取 `DEEPSEEK_API_KEY`。</p>
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
              <button className="secondary-button full" disabled={!downloadContent.trim()} onClick={() => downloadSection("word", downloadTitle, downloadContent, downloadLandscape)}>
                <FileText size={17} /> 下载 Word
              </button>
              <button className="secondary-button full" disabled={!downloadContent.trim()} onClick={() => downloadSection("md", downloadTitle, downloadContent, downloadLandscape)}>
                <Download size={17} /> 下载 MD
              </button>
              <button className="secondary-button full" disabled={!downloadContent.trim()} onClick={() => downloadSection("pdf", downloadTitle, downloadContent, downloadLandscape)}>
                <Download size={17} /> 下载 PDF
              </button>
              {activeStep === "final_delivery" ? (
                <>
                  <button className="secondary-button full" onClick={() => downloadSection("md", "故事概况及大纲", `${project.brief}\n\n${project.outline}`)}>
                    下载故事概况及大纲
                  </button>
                  <button className="secondary-button full" onClick={() => downloadSection("md", "最终剧本各语言版本", `${project.finalScriptChinese}\n\n${project.finalScriptForeign}\n\n${project.finalScriptBilingual}`)}>
                    下载最终剧本各语言版本
                  </button>
                  <button className="secondary-button full" onClick={() => downloadSection("md", "分镜", storyboardContent, true)}>
                    下载分镜
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {requirement ? <div className="notice warning"><AlertCircle size={17} /> {requirement}</div> : null}
          {aiConfigured === false ? (
            <div className="notice warning">
              <AlertCircle size={17} /> 服务端缺少 DEEPSEEK_API_KEY。真实生成不可用，可先加载示例内容演示。
            </div>
          ) : null}
          {error ? <div className="notice error"><AlertCircle size={17} /> {error}</div> : null}
          {statusText ? <div className="notice success"><CheckCircle2 size={17} /> {statusText}</div> : null}

          <button className="primary-button full" onClick={() => generateForStep(activeStep)} disabled={loading || Boolean(requirement)}>
            {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            内容生成
          </button>
          <button className="secondary-button full" onClick={() => setOptimizeOpen(true)} disabled={loading || Boolean(requirement) || !activeContent.trim()}>
            优化内容
          </button>
          <button className="secondary-button full" onClick={continueNextStep} disabled={loading}>
            继续下一步并生成
          </button>
          <button className="secondary-button full" onClick={loadDemoStep}>
            <WandSparkles size={18} /> 加载当前步骤示例内容
          </button>

          <div className="ai-hints">
            <strong>MVP 演示标准</strong>
            <span>12 步创作交付</span>
            <span>附件解析</span>
            <span>角色卡和关系图</span>
            <span>测试评估后修订</span>
            <span>最终交付下载</span>
          </div>
        </aside>
      </section>

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
