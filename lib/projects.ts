import type { ChineseScriptRange, FinalScriptVersion, LocalizationMode, TaskType } from "./ai/prompts";

export type ProjectStatus = "draft" | "generating" | "ready" | "error";
export type WorkflowType = "creation" | "continuation";
export type StepVersionSource = "ai" | "manual" | "demo" | "optimize" | "restore";

export type StepVersion = {
  id: string;
  taskType: TaskType;
  content: string;
  label: string;
  source: StepVersionSource;
  createdAt: string;
};

export type CharacterCard = {
  id: string;
  name: string;
  role: string;
  identity: string;
  goal: string;
  weakness: string;
  secret: string;
  arc: string;
  conflict: string;
  entrance: string;
  line: string;
  appearancePrompt: string;
  imageUrl: string;
};

export type StoryboardEpisode = {
  id: string;
  title: string;
  content: string;
};

export type DramaProject = {
  id: string;
  workflowType: WorkflowType;
  title: string;
  market: string;
  genre: string;
  episodeDuration: string;
  episodeCount: number;
  chineseScriptRange: ChineseScriptRange;
  targetLanguage: string;
  finalScriptVersion: FinalScriptVersion;
  localizationMode: LocalizationMode;
  benchmarkTitle: string;
  benchmarkLink: string;
  idea: string;
  importedScript: string;
  marketAnalysis: string;
  brief: string;
  characters: string;
  characterCards: CharacterCard[];
  relationshipDiagram: string;
  relationshipImageUrl: string;
  structureModel: string;
  beatCards: string;
  outline: string;
  episodes: string;
  existingScript: string;
  chineseScript: string;
  continuationScript: string;
  translation: string;
  localization: string;
  testScript: string;
  qualityEvaluation: string;
  finalScript: string;
  finalScriptChinese: string;
  finalScriptForeign: string;
  finalScriptBilingual: string;
  formatCheck: string;
  storyboardScript: string;
  storyboardEpisodes: StoryboardEpisode[];
  deliveryPackage: string;
  projectGroup: string;
  stepVersions: StepVersion[];
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

type LegacyProject = Partial<DramaProject> & {
  benchmark?: string;
  marketPrediction?: string;
  script?: string;
  scriptMode?: string;
  storyIdea?: string;
  seriesOutline?: string;
  episodeOutline?: string;
  episodeOneScript?: string;
  rewrittenScript?: string;
  logicCheck?: string;
  steps?: Partial<Record<string, { content?: string }>>;
};

export const STORAGE_KEY = "storyflow-ai-projects-v1";
export const GROUP_STORAGE_KEY = "storyflow-ai-project-groups-v1";
export const DEFAULT_PROJECT_GROUP = "默认分组";

export const MARKET_OPTIONS = ["北美", "欧洲", "东南亚", "中东", "拉美", "日本", "韩国", "其他"];

export const GENRE_OPTIONS = [
  "霸总神豪",
  "逆袭复仇",
  "家庭伦理",
  "狼人Alpha",
  "恐怖异能",
  "西方神话",
  "黑帮犯罪",
  "萌宝团宠",
  "银发爱情",
  "其他",
];

export const EPISODE_DURATION_OPTIONS = ["60 秒", "90 秒", "2 分钟", "3 分钟", "5 分钟"];

export const EPISODE_COUNT_OPTIONS = [12, 24, 36, 60, 80, 100];

export const CHINESE_SCRIPT_RANGE_OPTIONS: Array<{
  value: ChineseScriptRange;
  label: string;
  description: string;
}> = [
  { value: "first3", label: "前 3 集", description: "适合现场演示，生成速度最快。" },
  { value: "first15", label: "前 15 集", description: "适合展示连续留存和中段反转。" },
  { value: "first_half", label: "前半部", description: "按总集数的一半生成中文剧本。" },
  { value: "full", label: "全剧", description: "生成完整中文剧本，耗时和 token 消耗更高。" },
];

export const LANGUAGE_OPTIONS = ["中文", "英文", "西班牙语", "意大利语", "法语", "日语", "韩语"];

export const FINAL_SCRIPT_VERSION_OPTIONS: Array<{ value: FinalScriptVersion; label: string }> = [
  { value: "chinese", label: "中文剧本" },
  { value: "foreign", label: "外语剧本" },
  { value: "bilingual", label: "双语剧本" },
];

export const LOCALIZATION_MODE_OPTIONS: Array<{ value: LocalizationMode; label: string; description: string }> = [
  { value: "script", label: "本土化修改后的剧本", description: "只展示修改完成后的成稿，适合继续评估和交付。" },
  { value: "revision", label: "修改过程 / 红色修订", description: "展示完成修改后的剧本，并用红色标注本土化调整部分。" },
];

export const taskFieldMap: Record<TaskType, keyof DramaProject> = {
  market_analysis: "marketAnalysis",
  script_import: "importedScript",
  brief: "brief",
  characters: "characters",
  structure_model: "structureModel",
  beat_cards: "beatCards",
  series_outline: "outline",
  existing_script: "existingScript",
  chinese_script: "chineseScript",
  continuation_script: "continuationScript",
  translation: "translation",
  localization: "localization",
  test_script: "testScript",
  quality_evaluation: "qualityEvaluation",
  final_script: "finalScript",
  format_check: "formatCheck",
  storyboard_script: "storyboardScript",
  final_delivery: "deliveryPackage",
};

export type WorkflowStep = { key: TaskType; field: keyof DramaProject; label: string; short: string };

export const creationWorkflowSteps: WorkflowStep[] = [
  { key: "market_analysis", field: "marketAnalysis", label: "市场分析", short: "市场" },
  { key: "brief", field: "brief", label: "创意 Brief / 附件导入", short: "创意" },
  { key: "characters", field: "characterCards", label: "角色卡 / 人物关系图", short: "角色" },
  { key: "structure_model", field: "structureModel", label: "结构模型 / 好莱坞节拍", short: "结构" },
  { key: "beat_cards", field: "beatCards", label: "节拍卡 / 情绪推进", short: "节拍卡" },
  { key: "series_outline", field: "outline", label: "三幕结构 / 八段式 Treatment", short: "大纲" },
  { key: "chinese_script", field: "chineseScript", label: "中文剧本 / Scene List", short: "中文剧本" },
  { key: "translation", field: "translation", label: "翻译", short: "翻译" },
  { key: "localization", field: "localization", label: "本土化", short: "本土化" },
  { key: "quality_evaluation", field: "qualityEvaluation", label: "诊断评估 / 计时删减", short: "评估" },
  { key: "final_script", field: "finalScript", label: "最终剧本", short: "最终剧本" },
  { key: "format_check", field: "formatCheck", label: "格式检查 / Hollywood & Asian", short: "格式" },
  { key: "storyboard_script", field: "storyboardEpisodes", label: "分集分镜", short: "分镜" },
  { key: "final_delivery", field: "deliveryPackage", label: "最终交付", short: "交付" },
];

export const continuationWorkflowSteps: WorkflowStep[] = [
  { key: "script_import", field: "importedScript", label: "剧本导入", short: "导入" },
  { key: "characters", field: "characterCards", label: "角色卡 / 人物关系图", short: "角色" },
  { key: "structure_model", field: "structureModel", label: "结构模型 / 好莱坞节拍", short: "结构" },
  { key: "beat_cards", field: "beatCards", label: "节拍卡 / 情绪推进", short: "节拍卡" },
  { key: "series_outline", field: "outline", label: "三幕结构 / 八段式 Treatment", short: "大纲" },
  { key: "existing_script", field: "existingScript", label: "已有剧本", short: "已有剧本" },
  { key: "continuation_script", field: "continuationScript", label: "续写剧本", short: "续写" },
  { key: "translation", field: "translation", label: "翻译", short: "翻译" },
  { key: "localization", field: "localization", label: "本土化", short: "本土化" },
  { key: "quality_evaluation", field: "qualityEvaluation", label: "诊断评估 / 计时删减", short: "评估" },
  { key: "final_script", field: "finalScript", label: "最终剧本", short: "最终剧本" },
  { key: "format_check", field: "formatCheck", label: "格式检查 / Hollywood & Asian", short: "格式" },
  { key: "storyboard_script", field: "storyboardEpisodes", label: "分集分镜", short: "分镜" },
  { key: "final_delivery", field: "deliveryPackage", label: "最终交付", short: "交付" },
];

export const workflowSteps = creationWorkflowSteps;

export function getWorkflowSteps(projectOrType?: DramaProject | WorkflowType) {
  const workflowType = typeof projectOrType === "string" ? projectOrType : projectOrType?.workflowType;
  return workflowType === "continuation" ? continuationWorkflowSteps : creationWorkflowSteps;
}

export function createProject(overrides: Partial<DramaProject> = {}): DramaProject {
  const now = new Date().toISOString();

  return {
    id: createId(),
    workflowType: "creation",
    title: "未命名短剧项目",
    market: "北美",
    genre: "逆袭复仇",
    episodeDuration: "2 分钟",
    episodeCount: 12,
    chineseScriptRange: "first3",
    targetLanguage: "英文",
    finalScriptVersion: "foreign",
    localizationMode: "script",
    benchmarkTitle: "",
    benchmarkLink: "",
    idea: "",
    importedScript: "",
    marketAnalysis: "",
    brief: "",
    characters: "",
    characterCards: [],
    relationshipDiagram: "",
    relationshipImageUrl: "",
    structureModel: "",
    beatCards: "",
    outline: "",
    episodes: "",
    existingScript: "",
    chineseScript: "",
    continuationScript: "",
    translation: "",
    localization: "",
    testScript: "",
    qualityEvaluation: "",
    finalScript: "",
    finalScriptChinese: "",
    finalScriptForeign: "",
    finalScriptBilingual: "",
    formatCheck: "",
    storyboardScript: "",
    storyboardEpisodes: [],
    deliveryPackage: "",
    projectGroup: DEFAULT_PROJECT_GROUP,
    stepVersions: [],
    status: "draft",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function demoProject(): DramaProject {
  return createProject({
    title: "午夜继承人",
    market: "北美",
    genre: "逆袭复仇",
    episodeDuration: "2 分钟",
    episodeCount: 12,
    chineseScriptRange: "first3",
    targetLanguage: "英文",
    finalScriptVersion: "foreign",
    benchmarkTitle: "ReelShort 热门豪门复仇短剧",
    benchmarkLink: "https://www.reelshort.com/",
    idea: "重生后发现未婚夫背叛自己，女主以隐藏继承人的身份回归，在订婚宴上夺回家族公司和爱情主动权。",
  });
}

export function createContinuationProject(overrides: Partial<DramaProject> = {}): DramaProject {
  return createProject({
    workflowType: "continuation",
    title: "未命名续写项目",
    ...overrides,
  });
}

export function applyDemoStep(project: DramaProject, taskType: TaskType): DramaProject {
  return {
    ...setStepContent(project, taskType, demoStepContent[taskType]),
    status: "ready",
    updatedAt: new Date().toISOString(),
  };
}

export function exportProjectMarkdown(project: DramaProject) {
  return buildDeliveryMarkdown(project, false);
}

export function buildDeliveryMarkdown(project: DramaProject, deliveryOnly = true) {
  const lines = [
    `# ${project.title}`,
    "",
    `导出时间：${new Date().toLocaleString("zh-CN")}`,
    `目标市场：${project.market}`,
    `题材：${project.genre}`,
    `集数：${project.episodeCount}`,
    `每集片长：${project.episodeDuration}`,
    `中文剧本范围：${getChineseScriptRangeLabel(project.chineseScriptRange)}`,
    `翻译语言：${project.targetLanguage}`,
    "",
    "## 故事概况及大纲",
    project.brief || "未生成 Brief",
    "",
    project.outline || "未生成大纲",
    "",
    "## 最终剧本：中文版本",
    project.finalScriptChinese || "未生成",
    "",
    "## 最终剧本：外语版本",
    project.finalScriptForeign || project.finalScript || "未生成",
    "",
    "## 最终剧本：双语版本",
    project.finalScriptBilingual || "未生成",
    "",
    "## 分镜",
    storyboardEpisodesToMarkdown(project.storyboardEpisodes) || project.storyboardScript || "未生成",
    "",
  ];

  if (deliveryOnly) return lines.join("\n");

  return [
    ...lines,
    "## 市场分析",
    project.marketAnalysis || "未生成",
    "",
    "## 角色",
    characterCardsToMarkdown(project.characterCards) || project.characters || "未生成",
    "",
    "## 人物关系图",
    project.relationshipDiagram || "未生成",
    "",
    "## 中文剧本",
    project.chineseScript || "未生成",
    "",
    "## 翻译",
    project.translation || "未生成",
    "",
    "## 本土化",
    project.localization || "未生成",
    "",
    "## 评估",
    project.qualityEvaluation || "未生成",
    "",
    "## 最终交付说明",
    project.deliveryPackage || "未生成",
    "",
  ].join("\n");
}

export function readProjectsFromStorage(): DramaProject[] {
  if (typeof localStorage === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as LegacyProject[]) : [];
    const projects = parsed.map(normalizeProject);
    saveProjectsToStorage(projects);
    return projects;
  } catch {
    return [];
  }
}

export function saveProjectsToStorage(projects: DramaProject[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function normalizeStoredProject(project: Partial<DramaProject>): DramaProject {
  return normalizeProject(project as LegacyProject);
}

export function readProjectGroupsFromStorage() {
  if (typeof localStorage === "undefined") return [DEFAULT_PROJECT_GROUP];

  try {
    const raw = localStorage.getItem(GROUP_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const groups = Array.isArray(parsed)
      ? parsed.filter((group): group is string => typeof group === "string" && Boolean(group.trim()))
      : [];
    return uniqueGroups([DEFAULT_PROJECT_GROUP, ...groups]);
  } catch {
    return [DEFAULT_PROJECT_GROUP];
  }
}

export function saveProjectGroupsToStorage(groups: string[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(uniqueGroups([DEFAULT_PROJECT_GROUP, ...groups])));
}

export function upsertProject(project: DramaProject) {
  const projects = readProjectsFromStorage();
  const exists = projects.some((item) => item.id === project.id);
  const next = exists
    ? projects.map((item) => (item.id === project.id ? project : item))
    : [project, ...projects];
  saveProjectsToStorage(next);
}

export function deleteProject(id: string) {
  saveProjectsToStorage(readProjectsFromStorage().filter((project) => project.id !== id));
}

export function getStepContent(project: DramaProject, taskType: TaskType) {
  if (taskType === "characters") {
    return characterCardsToMarkdown(project.characterCards) || project.characters || "";
  }

  if (taskType === "final_script") {
    return getSelectedFinalScript(project);
  }

  if (taskType === "storyboard_script") {
    return storyboardEpisodesToMarkdown(project.storyboardEpisodes) || project.storyboardScript || "";
  }

  return String(project[taskFieldMap[taskType]] || "");
}

export function setStepContent(project: DramaProject, taskType: TaskType, content: string): DramaProject {
  const nextProject = {
    ...project,
    [taskFieldMap[taskType]]: content,
    updatedAt: new Date().toISOString(),
  };

  if (taskType === "characters") {
    const parsed = parseCharacterPayload(content);
    nextProject.characterCards = parsed.cards;
    nextProject.relationshipDiagram = parsed.relationshipDiagram || nextProject.relationshipDiagram;
    nextProject.characters = characterCardsToMarkdown(nextProject.characterCards) || content;
  }

  if (taskType === "series_outline") {
    nextProject.episodes = content;
  }

  if (taskType === "final_script") {
    if (project.finalScriptVersion === "chinese") nextProject.finalScriptChinese = content;
    if (project.finalScriptVersion === "foreign") nextProject.finalScriptForeign = content;
    if (project.finalScriptVersion === "bilingual") nextProject.finalScriptBilingual = content;
    nextProject.finalScript = content;
  }

  if (taskType === "storyboard_script") {
    nextProject.storyboardEpisodes = parseStoryboardEpisodes(content);
    nextProject.storyboardScript = storyboardEpisodesToMarkdown(nextProject.storyboardEpisodes) || content;
  }

  return nextProject;
}

export function getStepVersions(project: DramaProject, taskType: TaskType) {
  return (project.stepVersions || [])
    .filter((version) => version.taskType === taskType && version.content.trim())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function saveStepVersion(
  project: DramaProject,
  taskType: TaskType,
  content: string,
  source: StepVersionSource = "manual",
  label?: string,
): DramaProject {
  const trimmed = content.trim();
  if (!trimmed) return project;

  const latest = getStepVersions(project, taskType)[0];
  if (latest?.content.trim() === trimmed) return project;

  const now = new Date().toISOString();
  const nextVersion: StepVersion = {
    id: createId(),
    taskType,
    content,
    source,
    createdAt: now,
    label: label || buildVersionLabel(source, now),
  };

  return {
    ...project,
    stepVersions: [nextVersion, ...(project.stepVersions || [])].slice(0, 80),
    updatedAt: now,
  };
}

function buildVersionLabel(source: StepVersionSource, createdAt: string) {
  const sourceLabel: Record<StepVersionSource, string> = {
    ai: "AI 生成",
    manual: "手动保存",
    demo: "演示样例",
    optimize: "优化版本",
    restore: "历史恢复",
  };

  return `${sourceLabel[source]} · ${new Date(createdAt).toLocaleString("zh-CN", { hour12: false })}`;
}

export function getCompletedStepCount(project: DramaProject) {
  return getWorkflowSteps(project).filter((step) => {
    if (step.key === "characters") return project.characterCards.length > 0 || Boolean(project.characters.trim());
    if (step.key === "final_script") return Boolean(getSelectedFinalScript(project).trim());
    if (step.key === "storyboard_script") return project.storyboardEpisodes.length > 0 || Boolean(project.storyboardScript.trim());
    if (step.key === "final_delivery") return Boolean(getSelectedFinalScript(project).trim()) || project.storyboardEpisodes.length > 0 || Boolean(project.storyboardScript.trim());
    return Boolean(String(project[step.field] || "").trim());
  }).length;
}

export function createEmptyCharacterCard(): CharacterCard {
  return {
    id: createId(),
    name: "新角色",
    role: "",
    identity: "",
    goal: "",
    weakness: "",
    secret: "",
    arc: "",
    conflict: "",
    entrance: "",
    line: "",
    appearancePrompt: "",
    imageUrl: "",
  };
}

export function characterCardsToMarkdown(cards: CharacterCard[]) {
  return cards
    .map((card) =>
      [
        `### ${card.name || "未命名角色"}`,
        `- 角色功能：${card.role || ""}`,
        `- 身份：${card.identity || ""}`,
        `- 目标：${card.goal || ""}`,
        `- 弱点：${card.weakness || ""}`,
        `- 秘密：${card.secret || ""}`,
        `- 成长弧线：${card.arc || ""}`,
        `- 冲突关系：${card.conflict || ""}`,
        `- 首次登场画面：${card.entrance || ""}`,
        `- 典型短对白：${card.line || ""}`,
        `- 人物形象提示词：${card.appearancePrompt || ""}`,
        card.imageUrl ? `- 角色图片：${card.imageUrl}` : "",
      ].join("\n"),
    )
    .join("\n\n");
}

export function storyboardEpisodesToMarkdown(episodes: StoryboardEpisode[]) {
  return episodes.map((episode) => `## ${episode.title}\n${episode.content}`).join("\n\n");
}

export function createEmptyStoryboardEpisode(index = 1): StoryboardEpisode {
  return {
    id: createId(),
    title: `第 ${index} 集`,
    content: "",
  };
}

export function getChineseScriptRangeLabel(value: ChineseScriptRange) {
  return CHINESE_SCRIPT_RANGE_OPTIONS.find((option) => option.value === value)?.label || value;
}

export function getSelectedFinalScript(project: DramaProject) {
  if (project.finalScriptVersion === "chinese") return project.finalScriptChinese || "";
  if (project.finalScriptVersion === "bilingual") return project.finalScriptBilingual || "";
  return project.finalScriptForeign || "";
}

function normalizeProject(project: LegacyProject): DramaProject {
  const now = new Date().toISOString();
  const steps = project.steps || {};
  const legacyMarketAnalysis =
    project.marketAnalysis ||
    project.marketPrediction ||
    project.benchmark ||
    steps.market_positioning?.content ||
    steps.benchmark_analysis?.content ||
    steps.market_prediction?.content ||
    "";
  const legacyChineseScript =
    project.chineseScript ||
    project.script ||
    project.episodeOneScript ||
    steps.episode_script?.content ||
    steps.episode_scripts?.content ||
    "";
  const parsed = project.characterCards?.length
    ? { cards: project.characterCards.map(normalizeCharacterCard), relationshipDiagram: project.relationshipDiagram || "" }
    : parseCharacterPayload(project.characters || steps.characters?.content || "");
  const storyboardEpisodes = project.storyboardEpisodes?.length
    ? project.storyboardEpisodes.map(normalizeStoryboardEpisode)
    : parseStoryboardEpisodes(project.storyboardScript || "");
  const finalForeign = project.finalScriptForeign || project.finalScript || "";

  return createProject({
    id: project.id || createId(),
    workflowType: project.workflowType || "creation",
    title: project.title || "未命名短剧项目",
    market: normalizeMarket(project.market),
    genre: normalizeGenre(project.genre),
    episodeDuration: normalizeEpisodeDuration(project.episodeDuration),
    episodeCount: Number(project.episodeCount || 12),
    chineseScriptRange: normalizeChineseScriptRange(project.chineseScriptRange || project.scriptMode),
    targetLanguage: normalizeLanguage(project.targetLanguage),
    finalScriptVersion: normalizeFinalScriptVersion(project.finalScriptVersion),
    localizationMode: project.localizationMode || "script",
    benchmarkTitle: project.benchmarkTitle || "",
    benchmarkLink: project.benchmarkLink || "",
    idea: project.idea || project.storyIdea || "",
    importedScript: project.importedScript || "",
    marketAnalysis: legacyMarketAnalysis,
    brief: project.brief || steps.brief?.content || "",
    characters: characterCardsToMarkdown(parsed.cards) || project.characters || steps.characters?.content || "",
    characterCards: parsed.cards,
    relationshipDiagram: parsed.relationshipDiagram || project.relationshipDiagram || "",
    relationshipImageUrl: project.relationshipImageUrl || "",
    structureModel: project.structureModel || "",
    beatCards: project.beatCards || "",
    outline: project.outline || project.seriesOutline || steps.series_outline?.content || "",
    episodes: project.episodes || project.episodeOutline || steps.episode_outline?.content || "",
    existingScript: project.existingScript || "",
    chineseScript: legacyChineseScript,
    continuationScript: project.continuationScript || "",
    translation: project.translation || "",
    localization: project.localization || project.rewrittenScript || "",
    testScript: project.testScript || project.localization || project.rewrittenScript || "",
    qualityEvaluation: project.qualityEvaluation || steps.quality_evaluation?.content || project.logicCheck || "",
    finalScript: project.finalScript || finalForeign,
    finalScriptChinese: project.finalScriptChinese || "",
    finalScriptForeign: finalForeign,
    finalScriptBilingual: project.finalScriptBilingual || "",
    formatCheck: project.formatCheck || "",
    storyboardScript: storyboardEpisodesToMarkdown(storyboardEpisodes) || project.storyboardScript || "",
    storyboardEpisodes,
    deliveryPackage: project.deliveryPackage || "",
    projectGroup: normalizeProjectGroup(project.projectGroup),
    stepVersions: Array.isArray(project.stepVersions) ? project.stepVersions.map(normalizeStepVersion).filter(Boolean) as StepVersion[] : [],
    status: project.status || "draft",
    createdAt: project.createdAt || now,
    updatedAt: project.updatedAt || now,
  });
}

function parseCharacterPayload(content: string): { cards: CharacterCard[]; relationshipDiagram: string } {
  const trimmed = content.trim();
  if (!trimmed) return { cards: [], relationshipDiagram: "" };

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return { cards: parsed.map((card) => normalizeCharacterCard(card as Partial<CharacterCard>)), relationshipDiagram: "" };
    }
    if (parsed && typeof parsed === "object") {
      const obj = parsed as { characters?: Array<Partial<CharacterCard>>; relationshipDiagram?: string };
      if (Array.isArray(obj.characters)) {
        return {
          cards: obj.characters.map(normalizeCharacterCard),
          relationshipDiagram: obj.relationshipDiagram || "",
        };
      }
    }
  } catch {
    // Fallback to Markdown parsing below.
  }

  const sections = trimmed
    .split(/\n(?=###\s+)/)
    .map((section) => section.trim())
    .filter(Boolean);

  return {
    relationshipDiagram: "",
    cards: sections.map((section) => {
      const title = section.match(/^###\s*(.+)$/m)?.[1]?.trim() || "未命名角色";
      return normalizeCharacterCard({
        name: title,
        role: pickLine(section, ["角色功能", "功能", "role"]),
        identity: pickLine(section, ["身份", "identity"]),
        goal: pickLine(section, ["目标", "goal"]),
        weakness: pickLine(section, ["弱点", "weakness"]),
        secret: pickLine(section, ["秘密", "secret"]),
        arc: pickLine(section, ["成长弧线", "arc"]),
        conflict: pickLine(section, ["冲突关系", "与其他角色的冲突关系", "conflict"]),
        entrance: pickLine(section, ["首次登场画面", "entrance"]),
        line: pickLine(section, ["典型短对白", "line"]),
        appearancePrompt: pickLine(section, ["人物形象提示词", "形象提示词", "appearancePrompt"]),
      });
    }),
  };
}

function parseStoryboardEpisodes(content: string): StoryboardEpisode[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const sections = trimmed
    .split(/\n(?=##\s*(?:第\s*\d+\s*集|Episode\s*\d+))/i)
    .map((section) => section.trim())
    .filter(Boolean);

  if (sections.length === 0) {
    return [{ id: createId(), title: "第 1 集", content: trimmed }];
  }

  return sections.map((section, index) => {
    const title = section.match(/^##\s*(.+)$/m)?.[1]?.trim() || `第 ${index + 1} 集`;
    const body = section.replace(/^##\s*.+\n?/, "").trim();
    return { id: createId(), title, content: body };
  });
}

function pickLine(section: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = section.match(new RegExp(`[-*]?\\s*${escaped}\\s*[：:]\\s*(.+)`, "i"));
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function normalizeCharacterCard(card: Partial<CharacterCard>): CharacterCard {
  return {
    id: card.id || createId(),
    name: card.name || "未命名角色",
    role: card.role || "",
    identity: card.identity || "",
    goal: card.goal || "",
    weakness: card.weakness || "",
    secret: card.secret || "",
    arc: card.arc || "",
    conflict: card.conflict || "",
    entrance: card.entrance || "",
    line: card.line || "",
    appearancePrompt: card.appearancePrompt || "",
    imageUrl: card.imageUrl || "",
  };
}

function normalizeStoryboardEpisode(episode: Partial<StoryboardEpisode>): StoryboardEpisode {
  return {
    id: episode.id || createId(),
    title: episode.title || "第 1 集",
    content: episode.content || "",
  };
}

function normalizeStepVersion(version: Partial<StepVersion>): StepVersion | null {
  if (!version.taskType || !version.content) return null;
  const now = new Date().toISOString();
  return {
    id: version.id || createId(),
    taskType: version.taskType,
    content: version.content,
    source: version.source || "manual",
    createdAt: version.createdAt || now,
    label: version.label || buildVersionLabel(version.source || "manual", version.createdAt || now),
  };
}

function normalizeMarket(market?: string) {
  if (!market) return "北美";
  const map: Record<string, string> = { "鍖楃編": "北美", "娆ф床": "欧洲", "鍏朵粬": "其他" };
  return map[market] || market;
}

function normalizeGenre(genre?: string) {
  if (!genre) return "逆袭复仇";
  const map: Record<string, string> = {
    "Billionaire Romance": "霸总神豪",
    "Hidden Heiress": "逆袭复仇",
    "Revenge Romance": "逆袭复仇",
    "Fake Marriage": "家庭伦理",
    "Secret Baby": "萌宝团宠",
    "Mafia Love": "黑帮犯罪",
    "Werewolf Alpha": "狼人Alpha",
    "Fantasy Romance": "西方神话",
    "Urban Drama": "家庭伦理",
    亿万富豪爱情: "霸总神豪",
    隐藏继承人: "逆袭复仇",
    复仇爱情: "逆袭复仇",
    契约婚姻: "家庭伦理",
    秘密宝宝: "萌宝团宠",
    黑帮爱情: "黑帮犯罪",
    "狼人 Alpha": "狼人Alpha",
    奇幻爱情: "西方神话",
    都市情感: "家庭伦理",
    Other: "其他",
  };
  return map[genre] || genre;
}

function normalizeEpisodeDuration(duration?: string) {
  if (!duration) return "2 分钟";
  return duration.replace("2 鍒嗛挓", "2 分钟").replace("60 绉?", "60 秒");
}

function normalizeChineseScriptRange(value?: string): ChineseScriptRange {
  if (value === "full_script" || value === "full") return "full";
  if (value === "first15") return "first15";
  if (value === "first_half") return "first_half";
  return "first3";
}

function normalizeFinalScriptVersion(value?: string): FinalScriptVersion {
  if (value === "chinese" || value === "bilingual") return value;
  return "foreign";
}

function normalizeLanguage(language?: string) {
  if (!language) return "英文";
  const map: Record<string, string> = { 英语: "英文", English: "英文", 中文: "中文", "鑻辨枃": "英文" };
  return map[language] || language;
}

function normalizeProjectGroup(group?: string) {
  return group?.trim() || DEFAULT_PROJECT_GROUP;
}

function uniqueGroups(groups: string[]) {
  return Array.from(new Set(groups.map(normalizeProjectGroup)));
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const demoStepContent: Record<TaskType, string> = {
  market_analysis:
    "1. 目标市场：北美用户对豪门羞辱、身份反转、强复仇开场接受度高。\n2. 题材机会：逆袭复仇适合竖屏漫剧，前 30 秒可以直接给出背叛和打脸。\n3. 竞品启发：高密度羞辱开场、男主资源入场、每集结尾留身份钩子。\n4. 风险提醒：继承权和董事会表达需要简化；复仇启动不能太慢；对白避免中文长句。\n5. 创作建议：第 1 集订婚宴羞辱，第 2 集女主以投资人身份回场，第 3 集抛出录音证据。",
  script_import:
    "1. 原始材料类型判断：已有都市复仇短剧大纲。\n2. 已有剧情概况：女主在订婚宴被背叛；继妹顶替身份；男主带来董事文件；女主决定回到公司夺权。\n3. 核心人物与关系：林晚被继妹林薇夺权，周衍背叛她，沈烬掌握旧案线索。\n4. 当前剧情停点：黑车门打开，沈烬递出董事文件，女主身份即将反转。\n5. 可续写方向：董事会打脸；录音证据曝光；旧案真相牵出男主家族。\n6. 需要保留的风格：短对白、强羞辱、冷色豪门画面、每集结尾身份钩子。\n7. 续写风险：不要让男主过早解释全部秘密；不要让女主复仇太顺利。",
  brief:
    "剧名：午夜继承人\n1. 故事定位：隐藏继承人回归复仇的竖屏漫剧。\n2. 一句话卖点：被夺走一切的女人，以新董事身份回到订婚宴。\n3. 核心冲突：女主夺回公司与身份，反派阻止真相公开。\n4. 主角目标：拿回母亲留下的股份和尊严。\n5. 反派阻力：继妹与未婚夫联手制造女主精神失常的假象。\n6. 情绪基调：冷感、压抑、反击爽感。\n7. 目标受众：偏好复仇爱情和身份反转的海外女性用户。\n8. 视觉风格：冷色豪门宴会、红毯羞辱、黑车反转。",
  characters:
    '{"relationshipDiagram":"林晚 -> 复仇对象 -> 林薇；沈烬 -> 秘密盟友 -> 林晚；林薇 + 周衡 -> 联手夺权","characters":[{"name":"林晚","role":"女主","identity":"隐藏继承人，母亲遗产的真正受益人","goal":"夺回公司，公开继妹和未婚夫的阴谋","weakness":"仍然在意曾经的爱情","secret":"掌握父亲失踪前的录音","arc":"从忍耐求证到公开反击","conflict":"被继妹顶替身份，被未婚夫背叛","entrance":"订婚宴红毯尽头，她被保安拦下","line":"你们抢走的，今晚一件件还回来。","appearancePrompt":"25岁亚洲女性，冷白皮，黑色长发，湿透白色礼服，克制愤怒的眼神，红毯雨夜，电影感侧光"},{"name":"沈烬","role":"男主","identity":"跨国基金负责人","goal":"查清旧案并保护林晚","weakness":"不轻易相信任何人","secret":"他早已知道林晚的真实身份","arc":"从旁观者变成共同复仇者","conflict":"和反派家族存在旧账","entrance":"黑车停在雨中，他递出董事会文件","line":"你要复仇，我要真相。","appearancePrompt":"30岁亚洲男性，黑色西装，冷峻克制，雨夜黑车旁，手持文件袋，低饱和电影光"}]}',
  structure_model:
    "## 推荐结构模型\n主模型：三幕结构 + Save the Cat 15 节拍。\n辅助模型：韩剧式人物关系驱动。\n\n## 选择理由\n- 三幕结构适合投资人快速判断主线闭环。\n- Save the Cat 节拍能保证每 1-2 集有明确情绪转折。\n- 人物关系驱动适合豪门复仇、继承权、爱情误会等高频短剧题材。\n\n## 三幕结构骨架\n1. 开端：订婚宴羞辱，女主被夺走身份，男主递出董事文件。\n2. 对抗：女主以投资人身份回归，逐步拆穿继妹和未婚夫的局。\n3. 结局：董事会翻盘，旧案真相公开，女主完成身份与情感复位。\n\n## 关键转折点\n- 触发事件：女主被挡在自己的订婚宴外。\n- 第一幕转折：黑车文件证明她才是真正董事。\n- 中点反转：男主父亲疑似参与母亲旧案。\n- 第二幕低谷：女主公开证据被反派反咬为伪造。\n- 终局反转：母亲录音与股权文件同时曝光。\n\n## 结构风险\n- 男主秘密不能过早解释完。\n- 继妹反扑要持续升级，避免女主一路碾压。\n- 每集结尾必须保留身份、证据或情感钩子。",
  beat_cards:
    "## 节拍 1：开场羞辱\n- 所属模型：Save the Cat / Opening Image\n- 覆盖集数：第 1 集\n- 功能：用强画面建立女主处境和复仇动机。\n- 冲突：女主赶到订婚宴，却被保安拦在门外。\n- 价值变化：期待 -> 公开羞辱。\n- 情绪推进：震惊、窒息、克制愤怒。\n- 画面提示：雨夜红毯，白裙湿透，婚戒滚进红酒。\n- 集尾钩子：黑车门打开，男主递出董事文件。\n\n## 节拍 2：身份反转\n- 所属模型：三幕结构 / 第一幕转折\n- 覆盖集数：第 2-3 集\n- 功能：让女主第一次公开反击。\n- 冲突：继妹要求赶人，男主公开授权文件。\n- 价值变化：羞辱 -> 掌控。\n- 情绪推进：压抑、反击、爽感。\n- 画面提示：宴会门被推开，文件印章特写，宾客集体沉默。\n- 集尾钩子：旧录音里出现男主父亲的声音。\n\n## 节拍 3：旧案阴影\n- 所属模型：B Story / 情感与真相副线\n- 覆盖集数：第 4-6 集\n- 功能：把爱情线和旧案悬疑绑定。\n- 冲突：女主需要男主帮助，却发现他可能隐瞒关键事实。\n- 价值变化：信任 -> 怀疑。\n- 情绪推进：暧昧、试探、刺痛。\n- 画面提示：停车场冷光，录音笔红点闪烁，男主沉默。\n- 集尾钩子：女主发现母亲死亡前最后一个电话来自男主家族。",
  series_outline:
    "1. 全剧主线：林晚从订婚宴羞辱开始，逐步拿回股份、爱情和真相。\n2. 三幕结构：开端：订婚宴背叛与新身份入场；对抗：证据升级、关系拉扯、董事会夺权；结局：身份公开、旧案翻盘、情绪释放。\n3. 八段式 Treatment：1 羞辱开场；2 新身份入场；3 初次反击；4 反派反扑；5 男主秘密暴露；6 女主低谷；7 董事会翻盘；8 旧案真相与情绪释放。\n4. 关键反转清单：未婚夫背叛、男主隐藏帮助、继妹伪造病历、董事会投票翻盘。\n5. 情绪升级曲线：羞辱 -> 忍耐 -> 反击 -> 误会 -> 爆发 -> 终局胜利。\n6. 分集大纲：\n第 1 集 / 订婚宴羞辱 / 女主被赶出宴会 / 婚戒滚落 / 黑车中递出董事文件\n第 2 集 / 投资人入场 / 女主重返宴会 / 继妹失态 / 股东名单出现女主姓名\n第 3 集 / 录音线索 / 旧案浮出水面 / 男主身份存疑 / 录音里出现男主父亲声音",
  existing_script:
    "1. 已有剧本范围：已覆盖第 1 集订婚宴羞辱到董事文件登场。\n2. 已有剧情摘要：林晚被保安拦下；宴会大屏公开周衍与林薇婚照；婚戒落入红酒；沈烬在黑车中递出董事文件。\n3. 已有 Scene List：订婚宴门口 / 建立羞辱与背叛 / 希望转为羞辱 / 黑车文件推动身份反转。\n4. 人物当前状态：林晚压抑愤怒；林薇以胜利者姿态顶替她；周衍试图切割旧关系；沈烬掌握关键文件。\n5. 当前悬念：董事文件是否真实；沈烬为何帮助林晚；继妹是否知道旧案真相。\n6. 续写起点：第 2 集从林晚重新走入宴会厅开始，所有人以为她已经被赶走。",
  chinese_script:
    "## 第 1 集\n片长：2 分钟\n### Scene List\n- 场次：订婚宴门口\n- 功能：建立羞辱开场和女主目标\n- 冲突：女主被保安阻拦，继妹顶替她的位置\n- 价值变化：期待 -> 羞辱\n- 前后因果：女主赶到订婚宴，发现未婚夫背叛；这一场导致她接受新身份入场\n### 场景 1\n- 画面：红毯尽头，林晚的白裙被雨水打湿。\n- 人物：林晚、保安、宾客。\n- 动作：保安伸手挡住她，宴会厅大屏正在播放她未婚夫和继妹的婚照。\n- 情绪：羞辱、窒息。\n- 对白：林晚：“今天，是我的订婚宴。” 保安：“名单上没有你。”\n- 镜头提示：婚戒从她掌心滑落，滚进红酒。\n### 集尾钩子\n黑车门打开，沈烬递出文件：“林董事，该您入场了。”",
  continuation_script:
    "## 第 2 集\n片长：2 分钟\n### Scene List\n- 场次：订婚宴大厅\n- 功能：承接第 1 集身份反转，让女主第一次公开反击\n- 冲突：林薇要求保安赶人，沈烬公开董事授权\n- 价值变化：羞辱 -> 反击\n- 前后因果：沈烬递出文件，导致林晚重新入场；董事授权迫使宴会所有人转向她\n### 场景 1\n- 画面：宴会厅门被推开，冷光从林晚身后压进来。\n- 人物：林晚、沈烬、林薇、周衍、宾客。\n- 动作：林薇笑容僵住，周衍下意识挡住大屏。\n- 情绪：压迫、反击爽感。\n- 对白：林薇：“你怎么还敢回来？” 林晚：“回来拿我的东西。”\n- 镜头提示：董事授权书特写，林晚姓名被红色印章盖住。\n### 集尾钩子\n沈烬低声：“你母亲去世前，见过周衍的父亲。”",
  translation:
    "## Episode 1\nDuration: 2 minutes\n### Scene List\n- Scene: Entrance of the engagement party\n- Function: Establish public humiliation and the heroine's goal\n- Conflict: Lin Wan is blocked while her stepsister takes her place\n- Value Shift: Hope -> Humiliation\n- Cause and Effect: Lin Wan arrives and discovers the betrayal; this pushes her to accept her new identity\n### Scene 1\n- Visual: At the end of the red carpet, Lin Wan's white dress is soaked by rain.\n- Characters: Lin Wan, security guards, guests.\n- Action: A guard blocks her while the banquet screen shows her fiance's wedding photo with her stepsister.\n- Emotion: Humiliation, suffocation.\n- Dialogue: Lin Wan: “This is my engagement party.” Guard: “Your name is not on the list.”\n### Ending Hook\nThe black car door opens. Shen Jin hands her a document: “Director Lin, it is your turn to enter.”",
  localization:
    "1. 本土化优化版剧本\n## Episode 1\nDuration: 2 minutes\n### Scene List\n- Scene: Outside the ballroom\n- Function: Establish public humiliation and a revenge trigger\n- Conflict: Lin Wan is erased from her own engagement party\n- Value Shift: Hope -> Public disgrace\n- Cause and Effect: The betrayal forces Lin Wan to reclaim her voting power\n### Scene 1\n- Visual: Rain hits the red carpet as Lin Wan stands outside the ballroom, frozen in a soaked white dress.\n- Characters: Lin Wan, security guards, guests.\n- Action: A guard blocks her. On the giant screen inside, her fiance smiles beside her stepsister in a wedding portrait.\n- Emotion: Public humiliation, shock, controlled rage.\n- Dialogue: Lin Wan: “This is my engagement party.” Guard: “Not anymore.”\n### Ending Hook\nA black car door opens. Shen Jin hands her a sealed board document: “Director Lin, they are waiting for you.”\n2. 已调整的表达：将家族继承改为董事文件和投票权。\n3. 仍需人工确认的风险：法律细节保持简化。",
  test_script:
    "## 测试剧本\n## Episode 1\nDuration: 2 minutes\n### Scene List\n- Scene: Outside the ballroom\n- Function: Test public humiliation hook and identity reversal\n- Conflict: Lin Wan is blocked from her own engagement party\n- Value Shift: Hope -> Public disgrace\n- Cause and Effect: The betrayal triggers the board document reveal\n### Scene 1\n- Visual: Rain hits the red carpet as Lin Wan stands outside the ballroom, frozen in a soaked white dress.\n- Dialogue: Lin Wan: “This is my engagement party.” Guard: “Not anymore.”\n### 测试观察点\n- Hook：5 秒内明确背叛\n- 风险：董事文件是否太抽象\n- 爽点：结尾身份反转",
  quality_evaluation:
    "1. Hook 强度：9/10。\n2. 情绪密度：8/10。\n3. 反转频率：8/10。\n4. 漫剧画面感：8/10。\n5. 目标市场适配度：8.5/10。\n6. 诊断修订：因果清楚，但男主动机需要提前埋线；女主弧线从受辱到反击成立；第 1 集节奏紧；场景价值从希望转为羞辱，推进有效。\n7. 计时与删减：预计 2 分 15 秒，删掉宾客重复嘲笑，保留婚戒滚落和黑车文件。\n8. 最终剧本修订指令：增加男主看到女主伤口的特写；把 board document 改为 voting rights packet；删掉重复解释。",
  final_script:
    "经过评估修订后的最终剧本\n\n## Episode 1\nDuration: 2 minutes\n### Scene List\n- Scene: Outside the ballroom\n- Function: Establish public humiliation and a clean revenge trigger\n- Conflict: Lin Wan is erased from her own engagement party\n- Value Shift: Hope -> Public disgrace -> Controlled resolve\n- Cause and Effect: The betrayal forces Lin Wan to reclaim her voting power\n### Scene 1\n- Visual: Rain hits the red carpet. Lin Wan stands outside the ballroom in a soaked white dress, one scratch visible on her wrist.\n- Dialogue: Lin Wan: “This is my engagement party.” Guard: “Not anymore.”\n### Ending Hook\nA black car door opens. Shen Jin notices the wound, then hands her a sealed voting rights packet: “Director Lin, they are waiting for you.”",
  format_check:
    "## 格式问题清单\n1. 场景标题完整：已包含场景位置和场景功能，但可补充 INT./EXT. 标记以贴近 Hollywood screenplay。\n2. 动作段落：画面感明确，建议每段控制在 1-2 行，适合竖屏拆镜。\n3. 对白长度：对白短，符合漫剧节奏。\n4. Scene List：已包含功能、冲突、价值变化和前后因果。\n5. 钩子：第 1 集结尾身份反转清晰。\n\n## 修改建议\n- 把“Outside the ballroom”统一为“EXT. BALLROOM ENTRANCE - NIGHT”。\n- 每场戏开头增加镜头情绪关键词，方便后续分镜。\n- 删除重复解释董事文件的对白，用文件特写和宾客反应传达。\n\n## 可直接替换的格式修订\n### EXT. BALLROOM ENTRANCE - NIGHT\nRain hammers the red carpet. Lin Wan stands in a soaked white dress, one scratch bright on her wrist.\nLIN WAN: This is my engagement party.\nGUARD: Not anymore.",
  storyboard_script:
    "## 第 1 集\n### 镜头 1\n- 景别：特写\n- 画面：婚戒滚进红酒杯，溅起暗红色液体。\n- 人物/动作：林晚的手停在半空，指尖发抖。\n- 台词/字幕：字幕：她来参加自己的订婚宴，却成了外人。\n- 音效/情绪：玻璃轻响，压抑。\n- 转场：切到宴会大屏。\n- AI 生成提示词：特写，婚戒落入红酒杯，暗红液体飞溅，雨夜豪门宴会，冷色电影光，强羞辱感，竖屏构图\n### 镜头 2\n- 景别：中景\n- 画面：大屏上是未婚夫和继妹的婚照。\n- 人物/动作：宾客转头看她，窃笑。\n- 台词/字幕：继妹：“姐姐，你来晚了。”\n- 音效/情绪：人群低笑，羞辱感拉满。\n- 转场：推近林晚眼神。\n- AI 生成提示词：豪门宴会大屏婚照，白裙女主被众人凝视，冷色调，高反差，竖屏漫画剧风格",
  final_delivery:
    "1. 故事概况：隐藏继承人林晚在订婚宴被背叛后，以董事身份回归复仇。\n2. 大纲交付范围：三幕结构、八段式 Treatment、分集大纲。\n3. 最终剧本版本清单：中文版本、英文版本、双语版本。\n4. 分镜交付范围：按集拆分，每集包含镜头、台词、音效和 AI 生成提示词。\n5. 现场演示建议：先展示附件导入，再一键推进到分镜和交付下载。",
};
