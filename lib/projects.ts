import type { ScriptMode, TaskType } from "./ai/prompts";

export type ProjectStatus = "draft" | "generating" | "ready" | "error";

export type DramaProject = {
  id: string;
  title: string;
  market: string;
  genre: string;
  episodeDuration: string;
  episodeCount: number;
  scriptMode: ScriptMode;
  benchmarkTitle: string;
  benchmark: string;
  benchmarkLink: string;
  idea: string;
  brief: string;
  marketPrediction: string;
  characters: string;
  outline: string;
  episodes: string;
  qualityEvaluation: string;
  translation: string;
  localization: string;
  finalScript: string;
  storyboardScript: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

type LegacyProject = Partial<DramaProject> & {
  storyIdea?: string;
  tone?: string;
  seriesOutline?: string;
  episodeOutline?: string;
  episodeOneScript?: string;
  rewrittenScript?: string;
  script?: string;
  logicCheck?: string;
  steps?: Partial<Record<string, { content?: string }>>;
};

export const STORAGE_KEY = "storyflow-ai-projects-v1";

export const MARKET_OPTIONS = ["北美", "欧洲", "东南亚", "中东", "拉美", "日本", "韩国", "其他"];

export const GENRE_OPTIONS = [
  "亿万富豪爱情",
  "隐藏继承人",
  "复仇爱情",
  "契约婚姻",
  "秘密宝宝",
  "黑帮爱情",
  "狼人 Alpha",
  "奇幻爱情",
  "都市情感",
  "其他",
];

export const EPISODE_DURATION_OPTIONS = ["60 秒", "90 秒", "2 分钟", "3 分钟", "5 分钟"];

export const EPISODE_COUNT_OPTIONS = [12, 24, 36, 60, 80, 100];

export const SCRIPT_MODE_OPTIONS: Array<{ value: ScriptMode; label: string; description: string }> = [
  {
    value: "first3_with_outline",
    label: "生成前 3 集剧本 + 全局大纲",
    description: "适合投资人演示，速度更稳，能展示完整链路。",
  },
  {
    value: "full_script",
    label: "生成全局剧本",
    description: "按所选集数生成全剧剧本框架，耗时和 token 消耗更高。",
  },
];

export const taskFieldMap: Record<TaskType, keyof DramaProject> = {
  market_positioning: "marketPrediction",
  benchmark_analysis: "benchmark",
  brief: "brief",
  market_prediction: "marketPrediction",
  characters: "characters",
  series_outline: "outline",
  quality_evaluation: "qualityEvaluation",
  translation: "translation",
  localization: "localization",
  final_script: "finalScript",
  storyboard_script: "storyboardScript",
};

export const workflowSteps: Array<{ key: TaskType; field: keyof DramaProject; label: string; short: string }> = [
  { key: "market_positioning", field: "marketPrediction", label: "市场定位", short: "市场" },
  { key: "benchmark_analysis", field: "benchmark", label: "竞品分析", short: "竞品" },
  { key: "brief", field: "brief", label: "创意 Brief / 自动剧名", short: "Brief" },
  { key: "market_prediction", field: "marketPrediction", label: "市场预判", short: "预判" },
  { key: "characters", field: "characters", label: "角色设定", short: "角色" },
  { key: "series_outline", field: "outline", label: "全剧大纲 / 分集大纲", short: "大纲" },
  { key: "quality_evaluation", field: "qualityEvaluation", label: "AI 质量评估", short: "评估" },
  { key: "translation", field: "translation", label: "翻译", short: "翻译" },
  { key: "localization", field: "localization", label: "本土化优化", short: "本土化" },
  { key: "final_script", field: "finalScript", label: "生成剧本", short: "剧本" },
  { key: "storyboard_script", field: "storyboardScript", label: "分镜头脚本", short: "分镜" },
];

export function createProject(overrides: Partial<DramaProject> = {}): DramaProject {
  const now = new Date().toISOString();

  return {
    id: createId(),
    title: "未命名短剧项目",
    market: "北美",
    genre: "复仇爱情",
    episodeDuration: "2 分钟",
    episodeCount: 12,
    scriptMode: "first3_with_outline",
    benchmarkTitle: "",
    benchmark: "",
    benchmarkLink: "",
    idea: "",
    brief: "",
    marketPrediction: "",
    characters: "",
    outline: "",
    episodes: "",
    qualityEvaluation: "",
    translation: "",
    localization: "",
    finalScript: "",
    storyboardScript: "",
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
    genre: "隐藏继承人",
    episodeDuration: "2 分钟",
    episodeCount: 12,
    scriptMode: "first3_with_outline",
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
  const scriptModeLabel =
    SCRIPT_MODE_OPTIONS.find((option) => option.value === project.scriptMode)?.label || project.scriptMode;

  return [
    `# ${project.title}`,
    "",
    `导出时间：${new Date().toLocaleString("zh-CN")}`,
    `目标市场：${project.market}`,
    `题材：${project.genre}`,
    `集数：${project.episodeCount}`,
    `每集片长：${project.episodeDuration}`,
    `剧本生成范围：${scriptModeLabel}`,
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
    "## 全剧大纲 / 分集大纲",
    project.outline || project.episodes || "未生成",
    "",
    "## AI 质量评估",
    project.qualityEvaluation || "未生成",
    "",
    "## 翻译",
    project.translation || "未生成",
    "",
    "## 本土化优化",
    project.localization || "未生成",
    "",
    "## 生成剧本",
    project.finalScript || "未生成",
    "",
    "## 分镜头脚本",
    project.storyboardScript || "未生成",
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
  const legacyScript = project.finalScript || project.script || project.episodeOneScript || steps.episode_script?.content || "";

  return createProject({
    id: project.id || createId(),
    title: project.title || "未命名短剧项目",
    market: normalizeMarket(project.market),
    genre: normalizeGenre(project.genre),
    episodeDuration: project.episodeDuration || "2 分钟",
    episodeCount: Number(project.episodeCount || 12),
    scriptMode: project.scriptMode || "first3_with_outline",
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
    qualityEvaluation: project.qualityEvaluation || steps.quality_evaluation?.content || project.logicCheck || "",
    translation: project.translation || "",
    localization: project.localization || project.rewrittenScript || "",
    finalScript: legacyScript,
    storyboardScript: project.storyboardScript || "",
    status: project.status || "draft",
    createdAt: project.createdAt || now,
    updatedAt: project.updatedAt || now,
  });
}

function normalizeMarket(market?: string) {
  if (!market) return "北美";
  const map: Record<string, string> = {
    "中国大陆": "北美",
    北美: "北美",
    欧洲: "欧洲",
    东南亚: "东南亚",
    中东: "中东",
    其他: "其他",
  };
  return map[market] || market;
}

function normalizeGenre(genre?: string) {
  if (!genre) return "复仇爱情";
  const map: Record<string, string> = {
    "Billionaire Romance": "亿万富豪爱情",
    "Hidden Heiress": "隐藏继承人",
    "Revenge Romance": "复仇爱情",
    "Fake Marriage": "契约婚姻",
    "Secret Baby": "秘密宝宝",
    "Mafia Love": "黑帮爱情",
    "Werewolf Alpha": "狼人 Alpha",
    "Fantasy Romance": "奇幻爱情",
    "Urban Drama": "都市情感",
    Other: "其他",
  };
  return map[genre] || genre;
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const demoStepContent: Record<TaskType, string> = {
  market_positioning:
    "【示例内容】\n1. 目标市场判断：北美用户对豪门复仇、隐藏身份、强羞辱开场接受度高。\n2. 题材适配度：隐藏继承人 + 复仇爱情适合竖屏快节奏。\n3. 目标受众画像：18-34 岁女性，偏好身份反转、强情绪爽点和高密度钩子。\n4. 平台语感：对白短，冲突直接，第一集必须在 30 秒内给出羞辱和反转。\n5. 风险：法律和继承权表达需要简化，避免复杂公司治理。",
  benchmark_analysis:
    "【示例内容】\n1. 竞品基本判断：ReelShort 热门豪门复仇短剧主打羞辱、身份反转和连续打脸。\n2. 题材与卖点：未婚夫背叛、姐妹夺爱、女主隐藏继承人。\n3. 人物关系：女主受压，男主掌握资源但保留秘密，反派持续加压。\n4. 前 3 集钩子：订婚宴羞辱、投资人入场、录音证据曝光。\n5. 可借鉴：前 3 集冲突密度高，每集结尾都有身份信息钩子。",
  brief:
    "剧名：午夜继承人\n1. 故事定位：隐藏继承人回归复仇的竖屏漫剧。\n2. 一句话卖点：被夺走一切的女人，以新董事身份回到订婚宴。\n3. 核心冲突：女主夺回公司与身份，反派阻止真相公开。\n4. 主角目标：拿回母亲留下的股份和尊严。\n5. 反派阻力：继妹与未婚夫联手制造女主精神失常的假象。\n6. 情绪基调：冷感、压抑、反击爽感。\n7. 目标受众：偏好复仇爱情和身份反转的海外女性用户。\n8. 视觉风格：冷色豪门宴会、红毯羞辱、黑车反转。",
  market_prediction:
    "【示例内容】\n1. 市场匹配度：8.8/10。题材清晰，爽点前置，适合北美短剧用户。\n2. 推荐标签：复仇爱情 / 隐藏身份 / 豪门继承 / CEO Drama。\n3. 潜在风险：如果复仇启动太慢，用户会在第 1 集流失。\n4. 前 5 秒 Hook：婚戒滚到红酒里，女主被当众宣布“替身上位”。\n5. 前 3 集强化建议：第 1 集结尾直接给女主新身份反转。",
  characters:
    "### 林晚\n- 身份：隐藏继承人，母亲遗产的真正受益人。\n- 目标：夺回公司、公开继妹和未婚夫的阴谋。\n- 弱点：仍然在意曾经的爱情。\n- 秘密：掌握父亲失踪前的录音。\n- 成长弧线：从忍耐求证到公开反击。\n- 与其他角色的冲突关系：被继妹顶替身份，被未婚夫背叛。\n- 首次登场画面：订婚宴红毯尽头，她被保安拦下。\n- 典型短对白：“你们抢走的，今晚一件件还回来。”\n\n### 沈烬\n- 身份：跨国基金负责人。\n- 目标：查清旧案并保护林晚。\n- 弱点：不轻易相信任何人。\n- 秘密：他早已知道林晚的真实身份。\n- 成长弧线：从旁观者变成共同复仇者。\n- 与其他角色的冲突关系：和反派家族存在旧账。\n- 首次登场画面：黑车停在雨中，他递出董事会文件。\n- 典型短对白：“你要复仇，我要真相。”",
  series_outline:
    "【示例内容】\n1. 全剧主线：林晚从订婚宴羞辱开始，逐步拿回股份、爱情和真相。\n2. Act 1：女主被替换，签署放弃继承权的文件，却收到新董事身份文件。\n3. Act 2：女主回归公司，用资金和证据逐步反击。\n4. Act 3：女主公开继承人身份，揭开父亲失踪真相。\n5. 关键反转：未婚夫背叛、男主隐藏帮助、继妹伪造病历、董事会投票翻盘。\n6. 分集大纲：\n第 1 集 / 订婚宴羞辱 / 女主被赶出宴会 / 婚戒滚落 / 黑车中递出董事文件\n第 2 集 / 投资人入场 / 女主重返宴会 / 继妹失态 / 股东名单出现女主姓名\n第 3 集 / 录音线索 / 旧案浮出水面 / 男主身份存疑 / 录音里出现男主父亲声音\n第 4-12 集 / 证据升级、关系拉扯、董事会终局反转。",
  quality_evaluation:
    "【示例内容】\n1. Hook 强度：9/10。羞辱开场明确，身份反转强。\n2. 情绪密度：8/10。女主受压与反击节奏清楚。\n3. 反转频率：8/10。建议每集结尾都留下身份或证据钩子。\n4. 漫剧画面感：8/10。红毯、黑车、董事会文件具有可视化价值。\n5. 最大问题：男主动机需要更早埋线。\n6. 修改建议：第 1 集增加男主看到女主伤口的特写，建立情绪连接。",
  translation:
    "【示例内容】\nTarget Language Version:\nShe was not late to her engagement party. She had been replaced.\nKey Line:\nLin Wei: Sister, you came too late.\nEmotion Note: Keep the humiliation direct and sharp.",
  localization:
    "【示例内容】\n1. 发现问题：继承权和公司控制权表达过于中式家族企业。\n2. 修改建议：改为 board vote、trust fund、shareholder agreement。\n3. 自动优化版本：女主不是拿回户口本，而是拿回 voting shares。\n4. 仍需人工确认：法律细节需简化，避免影响爽感。",
  final_script:
    "【示例内容】\n## 第 1 集\n片长：2 分钟\n### 场景 1\n- 画面：红毯尽头，林晚的白裙被雨水打湿。\n- 人物：林晚、保安、宾客。\n- 动作：保安伸手挡住她，宴会厅大屏正在播放她未婚夫和继妹的婚照。\n- 情绪：羞辱、窒息。\n- 对白：林晚：“今天，是我的订婚宴。” 保安：“名单上没有你。”\n- 镜头提示：婚戒从她掌心滑落，滚进红酒。\n### 集尾钩子\n黑车门打开，沈烬递出文件：“林董事，该您入场了。”\n\n## 第 2 集\n林晚以投资人代表身份重返宴会，继妹第一次失控。\n\n## 第 3 集\n录音证据出现，旧案线索指向沈家。",
  storyboard_script:
    "【示例内容】\n## 第 1 集分镜头脚本\n### 镜头 1\n- 景别：特写\n- 画面：婚戒滚进红酒杯，溅起暗红色液体。\n- 人物/动作：林晚的手停在半空，指尖发抖。\n- 台词/字幕：字幕：她来参加自己的订婚宴，却成了外人。\n- 音效/情绪：玻璃轻响，压抑。\n- 转场：切到宴会大屏。\n### 镜头 2\n- 景别：中景\n- 画面：大屏上是未婚夫和继妹的婚照。\n- 人物/动作：宾客转头看她，窃笑。\n- 台词/字幕：继妹：“姐姐，你来晚了。”\n- 音效/情绪：人群低笑，羞辱感拉满。\n- 转场：推近林晚眼神。",
};
