"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  UserPlus,
  WandSparkles,
} from "lucide-react";
import type { TaskType } from "@/lib/ai/prompts";
import {
  applyDemoStep,
  CharacterCard,
  characterCardsToMarkdown,
  CHINESE_SCRIPT_RANGE_OPTIONS,
  createEmptyCharacterCard,
  createProject,
  demoProject,
  DramaProject,
  EPISODE_COUNT_OPTIONS,
  EPISODE_DURATION_OPTIONS,
  exportProjectMarkdown,
  GENRE_OPTIONS,
  getStepContent,
  LANGUAGE_OPTIONS,
  MARKET_OPTIONS,
  readProjectsFromStorage,
  setStepContent,
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
  if (taskType === "market_analysis") {
    return project.market && project.genre ? "" : "请先选择目标市场和题材。";
  }

  if (taskType === "brief") {
    return project.idea.trim() ? "" : "请先填写故事创意。";
  }

  if (taskType === "characters") {
    return project.brief.trim() ? "" : "请先完成创意 Brief。";
  }

  if (taskType === "series_outline") {
    return project.characterCards.length || project.characters.trim() ? "" : "请先生成或添加角色卡。";
  }

  if (taskType === "storyboard_script") {
    return project.qualityEvaluation.trim() ? "" : "请先完成评估。";
  }

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

  if (activeStep === "characters") {
    return project.brief;
  }

  if (activeStep === "series_outline") {
    return characterCardsToMarkdown(project.characterCards) || project.characters || project.brief;
  }

  if (activeStep === "chinese_script") {
    return project.outline;
  }

  if (activeStep === "translation") {
    return project.chineseScript;
  }

  if (activeStep === "localization") {
    return project.translation;
  }

  if (activeStep === "final_script") {
    return project.localization;
  }

  if (activeStep === "quality_evaluation") {
    return project.finalScript;
  }

  if (activeStep === "storyboard_script") {
    return project.finalScript;
  }

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
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const [project, setProject] = useState<DramaProject | null>(null);
  const [activeStep, setActiveStep] = useState<TaskType>("market_analysis");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

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
    updateProject((current) => ({
      ...setStepContent(current, taskType, content),
      status: "draft",
    }));
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

  async function generate() {
    if (!project || requirement) return;

    const generatingProject: DramaProject = {
      ...project,
      status: "generating",
      updatedAt: new Date().toISOString(),
    };

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
          taskType: activeStep,
          input: getTaskInput(project, activeStep, activeContent),
          context: project.idea,
          options: {
            market: project.market,
            genre: project.genre,
            sourceLanguage: "中文",
            targetLanguage: project.targetLanguage,
            benchmarkTitle: project.benchmarkTitle,
            benchmarkLink: project.benchmarkLink,
            episodeDuration: project.episodeDuration,
            episodeCount: project.episodeCount,
            chineseScriptRange: project.chineseScriptRange,
          },
          projectTitle: project.title,
          market: project.market,
          genre: project.genre,
          benchmarkTitle: project.benchmarkTitle,
          benchmarkLink: project.benchmarkLink,
          idea: project.idea,
          allSteps: previousStepContent(project, activeStep),
        }),
      });

      const data = await response.json();
      setLoading(false);

      if (!response.ok || !data.success) {
        markError(generatingProject, data.error || "生成失败，请检查 DeepSeek API。已有内容已保留。");
        return;
      }

      let nextProject = {
        ...setStepContent(generatingProject, activeStep, data.output),
        status: "ready" as const,
        updatedAt: new Date().toISOString(),
      };

      if (activeStep === "brief" && (!project.title.trim() || project.title.trim() === DEFAULT_TITLE)) {
        const generatedTitle = extractGeneratedTitle(data.output);
        if (generatedTitle) {
          nextProject = { ...nextProject, title: generatedTitle };
        }
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
    const erroredProject = {
      ...baseProject,
      status: "error" as const,
      updatedAt: new Date().toISOString(),
    };
    setProject(erroredProject);
    upsertProject(erroredProject);
    setError(message);
  }

  function fillDemo() {
    const demo = {
      ...demoProject(),
      id: params.projectId,
      updatedAt: new Date().toISOString(),
    };
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

  function continueNextStep() {
    const currentIndex = workflowSteps.findIndex((step) => step.key === activeStep);
    const nextStep = workflowSteps[currentIndex + 1];
    if (nextStep) setActiveStep(nextStep.key);
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
  const showDownloadPanel = activeStep === "final_script" || activeStep === "storyboard_script";
  const downloadTitle = activeStep === "storyboard_script" ? "分镜头脚本" : "最终剧本";
  const downloadContent = activeStep === "storyboard_script" ? project.storyboardScript : project.finalScript;
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
                <input
                  value={project.benchmarkTitle}
                  onChange={(event) => updateField("benchmarkTitle", event.target.value)}
                />
              </label>
            </div>

            <div className="compact-fields">
              <label>
                集数
                <select
                  value={project.episodeCount}
                  onChange={(event) => updateField("episodeCount", Number(event.target.value))}
                >
                  {EPISODE_COUNT_OPTIONS.map((option) => <option key={option} value={option}>{option} 集</option>)}
                </select>
              </label>
              <label>
                每集片长
                <select
                  value={project.episodeDuration}
                  onChange={(event) => updateField("episodeDuration", event.target.value)}
                >
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
                    <input
                      value={project.market === "其他" ? "" : project.market}
                      onChange={(event) => updateField("market", event.target.value || "其他")}
                    />
                  </label>
                ) : null}
                {selectedGenreIsOther ? (
                  <label>
                    其他题材
                    <input
                      value={project.genre === "其他" ? "" : project.genre}
                      onChange={(event) => updateField("genre", event.target.value || "其他")}
                    />
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
                placeholder="一句话创意，或关键词：重生 / 复仇 / 豪门 / 隐藏身份。生成创意后会自动提取剧名，也可以在顶部手动修改。"
              />
            </label>
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
            <div className="character-grid">
              {project.characterCards.length === 0 ? (
                <div className="empty-character">
                  <UserPlus size={24} />
                  <h2>还没有角色卡</h2>
                  <p>点击生成角色，或手动添加一个角色卡。</p>
                </div>
              ) : null}

              {project.characterCards.map((card) => (
                <article className="character-card" key={card.id}>
                  <div className="character-card-head">
                    <input
                      value={card.name}
                      onChange={(event) => updateCharacterCard(card.id, "name", event.target.value)}
                      placeholder="角色名"
                    />
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
                  </div>
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
            <h2>{activeContent.trim() ? "重新生成" : "生成内容"}</h2>
            <p>当前步骤会调用 `/api/ai/generate`，由服务端读取 `DEEPSEEK_API_KEY`。</p>
          </div>

          {activeStep === "chinese_script" ? (
            <label>
              中文剧本范围
              <select
                value={project.chineseScriptRange}
                onChange={(event) => updateField("chineseScriptRange", event.target.value as DramaProject["chineseScriptRange"])}
              >
                {CHINESE_SCRIPT_RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
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

          {activeStep === "characters" ? (
            <button className="secondary-button full" onClick={addManualCharacter}>
              <UserPlus size={18} /> 手动添加角色
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

          <button className="primary-button full" onClick={generate} disabled={loading || Boolean(requirement)}>
            {loading ? <Loader2 className="spin" size={18} /> : activeStep === "storyboard_script" ? <Plus size={18} /> : <RefreshCw size={18} />}
            {activeStep === "storyboard_script"
              ? "一键生成分镜头脚本"
              : activeContent.trim()
                ? "重新生成当前阶段"
                : "生成当前阶段"}
          </button>
          <button className="secondary-button full" onClick={generate} disabled={loading || Boolean(requirement) || !activeContent.trim()}>
            优化内容
          </button>
          <button className="secondary-button full" onClick={continueNextStep}>
            继续下一步
          </button>
          <button className="secondary-button full" onClick={loadDemoStep}>
            <WandSparkles size={18} /> 加载当前步骤示例内容
          </button>

          <div className="ai-hints">
            <strong>MVP 演示标准</strong>
            <span>10 步创作流程</span>
            <span>{project.episodeCount} 集 / {project.episodeDuration}</span>
            <span>{project.genre}</span>
            <span>角色卡编辑</span>
            <span>最终剧本下载</span>
          </div>
        </aside>
      </section>
    </main>
  );
}
