import type { TaskType } from "./ai/prompts";

export type ProjectStatus = "draft" | "generating" | "ready" | "error";

export type DramaProject = {
  id: string;
  title: string;
  market: string;
  genre: string;
  benchmarkTitle: string;
  benchmark: string;
  benchmarkLink: string;
  idea: string;
  brief: string;
  marketPrediction: string;
  characters: string;
  outline: string;
  episodes: string;
  script: string;
  qualityEvaluation: string;
  translation: string;
  localization: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

type LegacyProject = Partial<DramaProject> & {
  storyIdea?: string;
  tone?: string;
  benchmarkTitle?: string;
  seriesOutline?: string;
  episodeOutline?: string;
  episodeOneScript?: string;
  rewrittenScript?: string;
  logicCheck?: string;
  steps?: Partial<Record<string, { content?: string }>>;
};

export const STORAGE_KEY = "storyflow-ai-projects-v1";

export const MARKET_OPTIONS = ["中国大陆", "北美", "欧洲", "东南亚", "中东", "其他"];

export const GENRE_OPTIONS = [
  "Billionaire Romance",
  "Hidden Heiress",
  "Revenge Romance",
  "Fake Marriage",
  "Secret Baby",
  "Mafia Love",
  "Werewolf Alpha",
  "Fantasy Romance",
  "Urban Drama",
  "Other",
];

export const taskFieldMap: Record<TaskType, keyof DramaProject> = {
  market_positioning: "marketPrediction",
  benchmark_analysis: "benchmark",
  brief: "brief",
  market_prediction: "marketPrediction",
  characters: "characters",
  series_outline: "outline",
  episode_scripts: "script",
  quality_evaluation: "qualityEvaluation",
  translation: "translation",
  localization: "localization",
};

export const workflowSteps: Array<{ key: TaskType; field: keyof DramaProject; label: string; short: string }> = [
  { key: "market_positioning", field: "marketPrediction", label: "市场定位", short: "市场" },
  { key: "benchmark_analysis", field: "benchmark", label: "竞品分析", short: "竞品" },
  { key: "brief", field: "brief", label: "故事创意 / Brief", short: "Brief" },
  { key: "market_prediction", field: "marketPrediction", label: "市场预判", short: "预判" },
  { key: "characters", field: "characters", label: "角色设定", short: "角色" },
  { key: "series_outline", field: "outline", label: "全剧大纲 / 12 集大纲", short: "大纲" },
  { key: "episode_scripts", field: "script", label: "前 3 集试生产", short: "前3集" },
  { key: "quality_evaluation", field: "qualityEvaluation", label: "AI 质量评估", short: "评估" },
  { key: "translation", field: "translation", label: "翻译", short: "翻译" },
  { key: "localization", field: "localization", label: "本土化", short: "本土化" },
];

export function createProject(overrides: Partial<DramaProject> = {}): DramaProject {
  const now = new Date().toISOString();

  return {
    id: createId(),
    title: "未命名短剧项目",
    market: "北美",
    genre: "Revenge Romance",
    benchmarkTitle: "",
    benchmark: "",
    benchmarkLink: "",
    idea: "",
    brief: "",
    marketPrediction: "",
    characters: "",
    outline: "",
    episodes: "",
    script: "",
    qualityEvaluation: "",
    translation: "",
    localization: "",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function demoProject(): DramaProject {
  return createProject({
    title: "Midnight Heiress",
    market: "北美",
    genre: "Hidden Heiress",
    benchmarkTitle: "ReelShort 热门豪门复仇短剧",
    benchmarkLink: "https://www.reelshort.com/",
    idea: "重生后发现未婚夫背叛自己，女主以隐藏继承人的身份回归，在订婚宴上夺回家族公司和爱情主动权。",
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
  return [
    `# ${project.title}`,
    "",
    `导出时间：${new Date().toLocaleString("zh-CN")}`,
    `目标市场：${project.market}`,
    `题材：${project.genre}`,
    `项目状态：${project.status}`,
    "",
    "## 竞品",
    project.benchmarkTitle || "未填写",
    project.benchmarkLink ? `链接：${project.benchmarkLink}` : "",
    project.benchmark ? `\n${project.benchmark}` : "",
    "",
    "## 故事创意",
    project.idea || "未填写",
    "",
    "## 项目 Brief",
    project.brief || "未生成",
    "",
    "## 市场预判",
    project.marketPrediction || "未生成",
    "",
    "## 角色设定",
    project.characters || "未生成",
    "",
    "## 全剧大纲",
    project.outline || "未生成",
    "",
    "## 12 集大纲",
    project.episodes || project.outline || "未生成",
    "",
    "## 前 3 集剧本",
    project.script || "未生成",
    "",
    "## AI 质量评估",
    project.qualityEvaluation || "未生成",
    "",
    "## 翻译",
    project.translation || "未生成",
    "",
    "## 本土化",
    project.localization || "未生成",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
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
  return String(project[taskFieldMap[taskType]] || "");
}

export function setStepContent(project: DramaProject, taskType: TaskType, content: string): DramaProject {
  const nextProject = {
    ...project,
    [taskFieldMap[taskType]]: content,
    updatedAt: new Date().toISOString(),
  };

  if (taskType === "series_outline") {
    nextProject.episodes = content;
  }

  return nextProject;
}

export function getCompletedStepCount(project: DramaProject) {
  return workflowSteps.filter((step) => String(project[step.field] || "").trim()).length;
}

function normalizeProject(project: LegacyProject): DramaProject {
  const now = new Date().toISOString();
  const steps = project.steps || {};

  return createProject({
    id: project.id || createId(),
    title: project.title || "未命名短剧项目",
    market: project.market || "北美",
    genre: project.genre || "Revenge Romance",
    benchmarkTitle: project.benchmarkTitle || "",
    benchmark: project.benchmark || steps.benchmark_analysis?.content || "",
    benchmarkLink: project.benchmarkLink || "",
    idea: project.idea || project.storyIdea || "",
    brief: project.brief || steps.brief?.content || "",
    marketPrediction:
      project.marketPrediction ||
      steps.market_positioning?.content ||
      steps.market_prediction?.content ||
      "",
    characters: project.characters || steps.characters?.content || "",
    outline: project.outline || project.seriesOutline || steps.series_outline?.content || "",
    episodes: project.episodes || project.episodeOutline || steps.episode_outline?.content || "",
    script: project.script || project.episodeOneScript || steps.episode_script?.content || "",
    qualityEvaluation: project.qualityEvaluation || steps.quality_evaluation?.content || project.logicCheck || "",
    translation: project.translation || "",
    localization: project.localization || "",
    status: project.status || "draft",
    createdAt: project.createdAt || now,
    updatedAt: project.updatedAt || now,
  });
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const demoStepContent: Record<TaskType, string> = {
  market_positioning:
    "【示例内容】\n1. 目标市场判断：北美短剧用户对豪门复仇、隐藏身份、强羞辱开场接受度高。\n2. 题材适配度：Hidden Heiress + Revenge Romance 适合竖屏快节奏。\n3. 风险：法律和继承权表达需要简化，避免复杂公司治理。",
  benchmark_analysis:
    "【示例内容】\n1. 题材分析：竞品主打豪门压迫、身份反转和连续打脸。\n2. 人物结构：女主受辱，男主提供资源但保留秘密，反派不断加压。\n3. 成功因素：前三集冲突密度高，每集结尾都有身份信息钩子。",
  brief:
    "【示例内容】\n1. 故事定位：隐藏继承人回归复仇。\n2. 一句话卖点：被夺走一切的女人，以新董事身份回到订婚宴。\n3. 核心冲突：女主夺回公司与身份，反派阻止真相公开。\n4. 视觉风格：冷色豪门宴会、红毯羞辱、黑车反转。",
  market_prediction:
    "【示例内容】\n1. 市场匹配度：8.8/10。\n2. 推荐标签：Revenge Romance / Hidden Identity / CEO Drama。\n3. 潜在风险：前三集如果复仇启动太慢，用户流失会高。\n4. 优化建议：第 1 集结尾直接给女主新身份反转。",
  characters:
    "【示例内容】\n女主：林晚，隐藏继承人。目标是夺回母亲留下的公司。弱点是不愿牵连无辜。秘密是她掌握父亲失踪前的录音。\n男主：沈烬，跨国基金负责人。目标是查清旧案。典型对白：“你要复仇，我要真相。”\n反派：林薇，继妹。目标是彻底抹掉女主继承权。",
  series_outline:
    "【示例内容】\nAct 1：女主在订婚宴被替换，被迫签放弃继承权，却在门外收到投资人身份文件。\nAct 2：女主回归公司，用资金和证据逐步反击。\nAct 3：女主公开继承人身份，揭开父亲失踪真相。\n12 集大纲：第 1 集订婚宴羞辱；第 2 集投资人入场；第 3 集录音曝光线索；第 4-12 集逐步升级复仇。",
  episode_scripts:
    "【示例内容】\nEpisode 1\n场景：豪门订婚宴。\n人物：林晚、未婚夫、林薇、沈烬。\n动作：婚照被撕下，戒指滚落，林薇踩住戒指。\n对白：林晚：这是什么意思？ 林薇：姐姐，你来晚了。\n分镜提示：红毯、碎花、黑车、投资协议。\n集尾钩子：男人递来文件：“林董，该您入场了。”\n\nEpisode 2\n女主以投资人代表身份回到宴会厅，未婚夫当场失态。\n\nEpisode 3\n女主拿出旧录音，林薇第一次露出恐惧。",
  quality_evaluation:
    "【示例内容】\nHook 强度：9/10。羞辱开场明确，身份反转强。\n情绪密度：8/10。女主受压与反击节奏清楚。\n反转频率：8/10。建议每集结尾都留下身份或证据钩子。\n优化建议：男主动机需更早埋线。",
  translation:
    "【示例内容】\nTarget Language Version:\nShe was not late to her engagement party. She had been replaced.\nKey Line:\nLin Wei: Sister, you came too late.\nEmotion Note: Keep the humiliation direct and sharp.",
  localization:
    "【示例内容】\n1. 发现问题：继承权和公司控制权表达过于中国式家族企业。\n2. 修改建议：改为 board vote、trust fund、shareholder agreement。\n3. 自动修正：女主不是“拿回户口本”，而是拿回 voting shares。\n4. 风险：法律细节需简化，避免影响爽感。",
};
