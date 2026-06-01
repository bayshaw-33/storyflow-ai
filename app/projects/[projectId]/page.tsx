"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings,
  UserPlus,
  WandSparkles,
} from "lucide-react";
import type { TaskType } from "@/lib/ai/prompts";
import {
  applyDemoStep,
  createProject,
  demoProject,
  DramaProject,
  EPISODE_COUNT_OPTIONS,
  EPISODE_DURATION_OPTIONS,
  exportProjectMarkdown,
  GENRE_OPTIONS,
  getStepContent,
  MARKET_OPTIONS,
  readProjectsFromStorage,
  SCRIPT_MODE_OPTIONS,
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
  if (taskType === "market_positioning") {
    return project.market && project.genre ? "" : "请先选择目标市场和题材。";
  }

  if (taskType === "benchmark_analysis") {
    return project.benchmarkTitle || project.benchmarkLink ? "" : "请先填写竞品名称或竞品链接。";
  }

  if (taskType === "brief") {
    return project.idea.trim() ? "" : "请先填写故事创意。";
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
  if (activeStep === "market_positioning") {
    return `目标市场：${project.market}\n题材：${project.genre}\n集数：${project.episodeCount}\n每集片长：${project.episodeDuration}`;
  }

  if (activeStep === "benchmark_analysis") {
    return `竞品名称：${project.benchmarkTitle}\n竞品链接：${project.benchmarkLink}`;
  }

  if (activeStep === "translation") {
    return project.outline || project.brief;
  }

  if (activeStep === "localization") {
    return project.translation || project.outline;
  }

  if (activeStep === "final_script") {
    return project.localization || project.translation || project.outline;
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

export default function WorkflowPage() {
  const params = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [project, setProject] = useState<DramaProject | null>(null);
  const [activeStep, setActiveStep] = useState<TaskType>("market_positioning");
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
            targetLanguage: "英语",
            benchmarkTitle: project.benchmarkTitle,
            benchmarkLink: project.benchmarkLink,
            episodeDuration: project.episodeDuration,
            episodeCount: project.episodeCount,
            scriptMode: project.scriptMode,
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
    setActiveStep("market_positioning");
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
    const template = [
      "",
      "### 新角色",
      "- 身份：",
      "- 目标：",
      "- 弱点：",
      "- 秘密：",
      "- 成长弧线：",
      "- 与其他角色的冲突关系：",
      "- 首次登场画面：",
      "- 典型短对白：",
    ].join("\n");
    updateStep("characters", `${project.characters.trim()}${project.characters.trim() ? "\n\n" : ""}${template.trim()}`);
    setActiveStep("characters");
    setStatusText("已添加角色模板");
  }

  function continueNextStep() {
    const currentIndex = workflowSteps.findIndex((step) => step.key === activeStep);
    const nextStep = workflowSteps[currentIndex + 1];
    if (nextStep) setActiveStep(nextStep.key);
  }

  function exportMarkdown() {
    if (!project) return;
    const markdown = exportProjectMarkdown(project);
    const date = new Date().toISOString().slice(0, 10);
    const safeTitle = project.title.replace(/[\\/:*?"<>|]/g, "").trim() || "StoryFlow项目";
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeTitle}-${date}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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
  const scriptMode = SCRIPT_MODE_OPTIONS.find((option) => option.value === project.scriptMode);

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
          <button className="icon-button" onClick={exportMarkdown} title="导出 Markdown">
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
            <span>PRD 流程导航</span>
            <strong>{workflowSteps.findIndex((step) => step.key === activeStep) + 1}/{workflowSteps.length}</strong>
          </div>
          {workflowSteps.map((step, index) => {
            const done = Boolean(getStepContent(project, step.key).trim());
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
                placeholder="一句话创意，或关键词：重生 / 复仇 / 豪门 / 隐藏身份。生成 Brief 后会自动提取剧名，也可以在顶部手动修改。"
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

          <textarea
            className="script-editor"
            value={activeContent}
            onChange={(event) => updateStep(activeStep, event.target.value)}
            placeholder="AI 生成内容会出现在这里，也可以直接手动编辑。"
          />
        </section>

        <aside className="ai-panel">
          <div>
            <span className="kicker">AI 助手</span>
            <h2>{activeContent.trim() ? "重新生成" : "生成内容"}</h2>
            <p>根据当前 PRD 阶段调用 `/api/ai/generate`，由服务端读取 `DEEPSEEK_API_KEY`。</p>
          </div>

          {activeStep === "final_script" ? (
            <label>
              剧本生成范围
              <select value={project.scriptMode} onChange={(event) => updateField("scriptMode", event.target.value as DramaProject["scriptMode"])}>
                {SCRIPT_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <small className="field-note">{scriptMode?.description}</small>
            </label>
          ) : null}

          {activeStep === "characters" ? (
            <button className="secondary-button full" onClick={addManualCharacter}>
              <UserPlus size={18} /> 手动添加角色
            </button>
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
            <span>中文题材选项</span>
            <span>{project.episodeCount} 集 / {project.episodeDuration}</span>
            <span>自动剧名</span>
            <span>本土化后生成剧本</span>
            <span>一键分镜</span>
          </div>
        </aside>
      </section>
    </main>
  );
}
