import type { ChineseScriptRange, TaskType } from "./ai/prompts";

export type ProjectStatus = "draft" | "generating" | "ready" | "error";

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
};

export type DramaProject = {
  id: string;
  title: string;
  market: string;
  genre: string;
  episodeDuration: string;
  episodeCount: number;
  chineseScriptRange: ChineseScriptRange;
  targetLanguage: string;
  benchmarkTitle: string;
  benchmarkLink: string;
  idea: string;
  marketAnalysis: string;
  brief: string;
  characters: string;
  characterCards: CharacterCard[];
  outline: string;
  episodes: string;
  chineseScript: string;
  translation: string;
  localization: string;
  finalScript: string;
  qualityEvaluation: string;
  storyboardScript: string;
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

export const taskFieldMap: Record<TaskType, keyof DramaProject> = {
  market_analysis: "marketAnalysis",
  brief: "brief",
  characters: "characters",
  series_outline: "outline",
  chinese_script: "chineseScript",
  translation: "translation",
  localization: "localization",
  final_script: "finalScript",
  quality_evaluation: "qualityEvaluation",
  storyboard_script: "storyboardScript",
};

export const workflowSteps: Array<{ key: TaskType; field: keyof DramaProject; label: string; short: string }> = [
  { key: "market_analysis", field: "marketAnalysis", label: "市场分析", short: "市场" },
  { key: "brief", field: "brief", label: "创意 Brief / 自动剧名", short: "创意" },
  { key: "characters", field: "characterCards", label: "角色卡", short: "角色" },
  { key: "series_outline", field: "outline", label: "全剧大纲 / 分集大纲", short: "大纲" },
  { key: "chinese_script", field: "chineseScript", label: "中文剧本", short: "中文剧本" },
  { key: "translation", field: "translation", label: "翻译", short: "翻译" },
  { key: "localization", field: "localization", label: "本土化", short: "本土化" },
  { key: "final_script", field: "finalScript", label: "最终剧本", short: "最终剧本" },
  { key: "quality_evaluation", field: "qualityEvaluation", label: "评估", short: "评估" },
  { key: "storyboard_script", field: "storyboardScript", label: "分镜", short: "分镜" },
];

export function createProject(overrides: Partial<DramaProject> = {}): DramaProject {
  const now = new Date().toISOString();

  return {
    id: createId(),
    title: "未命名短剧项目",
    market: "北美",
    genre: "逆袭复仇",
    episodeDuration: "2 分钟",
    episodeCount: 12,
    chineseScriptRange: "first3",
    targetLanguage: "英文",
    benchmarkTitle: "",
    benchmarkLink: "",
    idea: "",
    marketAnalysis: "",
    brief: "",
    characters: "",
    characterCards: [],
    outline: "",
    episodes: "",
    chineseScript: "",
    translation: "",
    localization: "",
    finalScript: "",
    qualityEvaluation: "",
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
    genre: "逆袭复仇",
    episodeDuration: "2 分钟",
    episodeCount: 12,
    chineseScriptRange: "first3",
    targetLanguage: "英文",
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
    `集数：${project.episodeCount}`,
    `每集片长：${project.episodeDuration}`,
    `中文剧本范围：${getChineseScriptRangeLabel(project.chineseScriptRange)}`,
    `翻译语言：${project.targetLanguage}`,
    `项目状态：${project.status}`,
    "",
    "## 竞品",
    project.benchmarkTitle || "未填写",
    project.benchmarkLink ? `链接：${project.benchmarkLink}` : "",
    "",
    "## 市场分析",
    project.marketAnalysis || "未生成",
    "",
    "## 故事创意",
    project.idea || "未填写",
    "",
    "## 创意 Brief",
    project.brief || "未生成",
    "",
    "## 角色",
    characterCardsToMarkdown(project.characterCards) || project.characters || "未生成",
    "",
    "## 全剧大纲 / 分集大纲",
    project.outline || project.episodes || "未生成",
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
    "## 最终剧本",
    project.finalScript || "未生成",
    "",
    "## 评估",
    project.qualityEvaluation || "未生成",
    "",
    "## 分镜",
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
  if (taskType === "characters") {
    return characterCardsToMarkdown(project.characterCards) || project.characters || "";
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
    nextProject.characterCards = parseCharacterCards(content);
    nextProject.characters = characterCardsToMarkdown(nextProject.characterCards) || content;
  }

  if (taskType === "series_outline") {
    nextProject.episodes = content;
  }

  return nextProject;
}

export function getCompletedStepCount(project: DramaProject) {
  return workflowSteps.filter((step) => {
    if (step.key === "characters") return project.characterCards.length > 0 || Boolean(project.characters.trim());
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
      ].join("\n"),
    )
    .join("\n\n");
}

export function getChineseScriptRangeLabel(value: ChineseScriptRange) {
  return CHINESE_SCRIPT_RANGE_OPTIONS.find((option) => option.value === value)?.label || value;
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
  const cards = project.characterCards?.length
    ? project.characterCards.map(normalizeCharacterCard)
    : parseCharacterCards(project.characters || steps.characters?.content || "");

  return createProject({
    id: project.id || createId(),
    title: project.title || "未命名短剧项目",
    market: normalizeMarket(project.market),
    genre: normalizeGenre(project.genre),
    episodeDuration: normalizeEpisodeDuration(project.episodeDuration),
    episodeCount: Number(project.episodeCount || 12),
    chineseScriptRange: normalizeChineseScriptRange(project.chineseScriptRange || project.scriptMode),
    targetLanguage: normalizeLanguage(project.targetLanguage),
    benchmarkTitle: project.benchmarkTitle || "",
    benchmarkLink: project.benchmarkLink || "",
    idea: project.idea || project.storyIdea || "",
    marketAnalysis: legacyMarketAnalysis,
    brief: project.brief || steps.brief?.content || "",
    characters: characterCardsToMarkdown(cards) || project.characters || steps.characters?.content || "",
    characterCards: cards,
    outline: project.outline || project.seriesOutline || steps.series_outline?.content || "",
    episodes: project.episodes || project.episodeOutline || steps.episode_outline?.content || "",
    chineseScript: legacyChineseScript,
    translation: project.translation || "",
    localization: project.localization || project.rewrittenScript || "",
    finalScript: project.finalScript || "",
    qualityEvaluation: project.qualityEvaluation || steps.quality_evaluation?.content || project.logicCheck || "",
    storyboardScript: project.storyboardScript || "",
    status: project.status || "draft",
    createdAt: project.createdAt || now,
    updatedAt: project.updatedAt || now,
  });
}

function parseCharacterCards(content: string): CharacterCard[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as Array<Partial<CharacterCard>>;
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeCharacterCard).filter((card) => card.name.trim());
    }
  } catch {
    // Fallback to Markdown parsing below.
  }

  const sections = trimmed
    .split(/\n(?=###\s+)/)
    .map((section) => section.trim())
    .filter(Boolean);

  return sections.map((section) => {
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
    });
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
  };
}

function normalizeMarket(market?: string) {
  if (!market) return "北美";
  return MARKET_OPTIONS.includes(market) ? market : market;
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

function normalizeLanguage(language?: string) {
  if (!language) return "英文";
  const map: Record<string, string> = { 英语: "英文", English: "英文", 中文: "中文" };
  return map[language] || language;
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
  brief:
    "剧名：午夜继承人\n1. 故事定位：隐藏继承人回归复仇的竖屏漫剧。\n2. 一句话卖点：被夺走一切的女人，以新董事身份回到订婚宴。\n3. 核心冲突：女主夺回公司与身份，反派阻止真相公开。\n4. 主角目标：拿回母亲留下的股份和尊严。\n5. 反派阻力：继妹与未婚夫联手制造女主精神失常的假象。\n6. 情绪基调：冷感、压抑、反击爽感。\n7. 目标受众：偏好复仇爱情和身份反转的海外女性用户。\n8. 视觉风格：冷色豪门宴会、红毯羞辱、黑车反转。",
  characters:
    '[{"name":"林晚","role":"女主","identity":"隐藏继承人，母亲遗产的真正受益人","goal":"夺回公司，公开继妹和未婚夫的阴谋","weakness":"仍然在意曾经的爱情","secret":"掌握父亲失踪前的录音","arc":"从忍耐求证到公开反击","conflict":"被继妹顶替身份，被未婚夫背叛","entrance":"订婚宴红毯尽头，她被保安拦下","line":"你们抢走的，今晚一件件还回来。"},{"name":"沈烬","role":"男主","identity":"跨国基金负责人","goal":"查清旧案并保护林晚","weakness":"不轻易相信任何人","secret":"他早已知道林晚的真实身份","arc":"从旁观者变成共同复仇者","conflict":"和反派家族存在旧账","entrance":"黑车停在雨中，他递出董事会文件","line":"你要复仇，我要真相。"}]',
  series_outline:
    "1. 全剧主线：林晚从订婚宴羞辱开始，逐步拿回股份、爱情和真相。\n2. 三幕结构：Act 1 订婚宴背叛与新身份入场；Act 2 证据升级、关系拉扯、董事会夺权；Act 3 身份公开、旧案翻盘、情绪释放。\n3. 关键反转清单：未婚夫背叛、男主隐藏帮助、继妹伪造病历、董事会投票翻盘。\n4. 情绪升级曲线：羞辱 -> 忍耐 -> 反击 -> 误会 -> 爆发 -> 终局胜利。\n5. 分集大纲：\n第 1 集 / 订婚宴羞辱 / 女主被赶出宴会 / 婚戒滚落 / 黑车中递出董事文件\n第 2 集 / 投资人入场 / 女主重返宴会 / 继妹失态 / 股东名单出现女主姓名\n第 3 集 / 录音线索 / 旧案浮出水面 / 男主身份存疑 / 录音里出现男主父亲声音",
  chinese_script:
    "## 第 1 集\n片长：2 分钟\n### 场景 1\n- 画面：红毯尽头，林晚的白裙被雨水打湿。\n- 人物：林晚、保安、宾客。\n- 动作：保安伸手挡住她，宴会厅大屏正在播放她未婚夫和继妹的婚照。\n- 情绪：羞辱、窒息。\n- 对白：林晚：“今天，是我的订婚宴。” 保安：“名单上没有你。”\n- 镜头提示：婚戒从她掌心滑落，滚进红酒。\n### 集尾钩子\n黑车门打开，沈烬递出文件：“林董事，该您入场了。”",
  translation:
    "## Episode 1\nDuration: 2 minutes\n### Scene 1\n- Visual: At the end of the red carpet, Lin Wan's white dress is soaked by rain.\n- Characters: Lin Wan, security guards, guests.\n- Action: A guard blocks her while the banquet screen shows her fiance's wedding photo with her stepsister.\n- Emotion: Humiliation, suffocation.\n- Dialogue: Lin Wan: “This is my engagement party.” Guard: “Your name is not on the list.”\n### Ending Hook\nThe black car door opens. Shen Jin hands her a document: “Director Lin, it is your turn to enter.”",
  localization:
    "1. 本土化优化版剧本\n## Episode 1\nDuration: 2 minutes\n### Scene 1\n- Visual: Rain hits the red carpet as Lin Wan stands outside the ballroom, frozen in a soaked white dress.\n- Characters: Lin Wan, security guards, guests.\n- Action: A guard blocks her. On the giant screen inside, her fiance smiles beside her stepsister in a wedding portrait.\n- Emotion: Public humiliation, shock, controlled rage.\n- Dialogue: Lin Wan: “This is my engagement party.” Guard: “Not anymore.”\n### Ending Hook\nA black car door opens. Shen Jin hands her a sealed board document: “Director Lin, they are waiting for you.”\n2. 已调整的表达：将家族继承改为董事文件和投票权，减少中式表达。\n3. 仍需人工确认的风险：法律细节保持简化，不展开公司治理。",
  final_script:
    "经过本土化优化之后的剧本\n\n## Episode 1\nDuration: 2 minutes\n### Scene 1\n- Visual: Rain hits the red carpet as Lin Wan stands outside the ballroom, frozen in a soaked white dress.\n- Characters: Lin Wan, security guards, guests.\n- Action: A guard blocks her. On the giant screen inside, her fiance smiles beside her stepsister in a wedding portrait.\n- Emotion: Public humiliation, shock, controlled rage.\n- Dialogue: Lin Wan: “This is my engagement party.” Guard: “Not anymore.”\n### Ending Hook\nA black car door opens. Shen Jin hands her a sealed board document: “Director Lin, they are waiting for you.”",
  quality_evaluation:
    "1. Hook 强度：9/10。羞辱开场明确，身份反转强。\n2. 情绪密度：8/10。女主受压与反击节奏清楚。\n3. 反转频率：8/10。建议每集结尾都留下身份或证据钩子。\n4. 漫剧画面感：8/10。红毯、黑车、董事会文件具有可视化价值。\n5. 目标市场适配度：8.5/10。复仇和身份反转适合北美短剧用户。\n6. 最大问题清单：男主动机需要更早埋线。\n7. 可执行修改建议：第 1 集增加男主看到女主伤口的特写，建立情绪连接。",
  storyboard_script:
    "## 第 1 集分镜头脚本\n### 镜头 1\n- 景别：特写\n- 画面：婚戒滚进红酒杯，溅起暗红色液体。\n- 人物/动作：林晚的手停在半空，指尖发抖。\n- 台词/字幕：字幕：她来参加自己的订婚宴，却成了外人。\n- 音效/情绪：玻璃轻响，压抑。\n- 转场：切到宴会大屏。\n### 镜头 2\n- 景别：中景\n- 画面：大屏上是未婚夫和继妹的婚照。\n- 人物/动作：宾客转头看她，窃笑。\n- 台词/字幕：继妹：“姐姐，你来晚了。”\n- 音效/情绪：人群低笑，羞辱感拉满。\n- 转场：推近林晚眼神。",
};
