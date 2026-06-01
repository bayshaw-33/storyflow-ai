export type TaskType =
  | "market_analysis"
  | "brief"
  | "characters"
  | "series_outline"
  | "chinese_script"
  | "translation"
  | "localization"
  | "final_script"
  | "quality_evaluation"
  | "storyboard_script";

export type ChineseScriptRange = "first3" | "first15" | "first_half" | "full";

export type GenerateOptions = {
  market?: string;
  genre?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  benchmarkTitle?: string;
  benchmarkLink?: string;
  episodeDuration?: string;
  episodeCount?: number;
  chineseScriptRange?: ChineseScriptRange;
};

export type GeneratePayload = {
  taskType: TaskType;
  input?: string;
  context?: string;
  options?: GenerateOptions;
  projectTitle?: string;
  market?: string;
  genre?: string;
  benchmarkTitle?: string;
  benchmarkLink?: string;
  idea?: string;
  allSteps?: Partial<Record<TaskType, string>>;
};

export const taskNames: Record<TaskType, string> = {
  market_analysis: "市场分析",
  brief: "创意 Brief",
  characters: "角色设定",
  series_outline: "全剧大纲",
  chinese_script: "中文剧本",
  translation: "翻译",
  localization: "本土化",
  final_script: "最终剧本",
  quality_evaluation: "评估",
  storyboard_script: "分镜",
};

const commonRules = [
  "你是 StoryFlow AI 的海外漫剧研发助手。",
  "必须使用中文输出，翻译任务除外；翻译任务按目标语言输出主体内容。",
  "面向漫剧和海外竖屏短剧，不是普通小说、长剧、网文大纲或营销文案。",
  "只输出生成内容本身。严禁输出“好的”“以下是”“这是根据您提供的信息生成的”等 AI 回复套话。",
  "不输出解释过程、思考过程、免责声明、教程或营销文案。",
  "强调强画面感、强冲突、强情绪、短对白、连续钩子、集尾反转。",
  "输出格式要稳定，使用清晰标题、编号、短段落，便于前端展示和后续编辑。",
  "不要输出 Markdown 表格。",
].join("\n");

const promptByTask: Record<TaskType, string> = {
  market_analysis: [
    "任务：把市场定位、竞品分析、市场预判合并成一个简洁的市场分析。",
    "输出结构：",
    "1. 目标市场：一句话判断目标市场的内容偏好",
    "2. 题材机会：说明所选题材为什么适合该市场",
    "3. 竞品启发：结合竞品名称或链接，总结 3 个可借鉴点",
    "4. 风险提醒：列出 2-3 个文化、节奏或题材风险",
    "5. 创作建议：给出前 3 集 Hook 和整体爽点建议",
    "要求：简洁、可执行，不要写长篇行业分析。",
  ].join("\n"),

  brief: [
    "任务：根据故事创意生成项目 Brief，并自动生成剧名。",
    "输出结构必须严格包含：",
    "剧名：给出一个适合海外漫剧传播的中文暂定剧名",
    "1. 故事定位",
    "2. 一句话卖点",
    "3. 核心冲突",
    "4. 主角目标",
    "5. 反派阻力",
    "6. 情绪基调",
    "7. 目标受众",
    "8. 视觉风格",
    "要求：剧名短、有冲突、有记忆点；Brief 能直接指导角色、大纲和剧本。",
  ].join("\n"),

  characters: [
    "任务：生成角色设定。",
    "只输出 JSON 数组，不要 Markdown，不要代码块。",
    "数组中至少包含女主、男主或关键关系对象、主反派、关键配角。",
    "每个角色对象必须包含以下字段：",
    "name：角色名",
    "role：角色功能，例如女主、男主、反派、关键配角",
    "identity：身份",
    "goal：目标",
    "weakness：弱点",
    "secret：秘密",
    "arc：成长弧线",
    "conflict：与其他角色的冲突关系",
    "entrance：首次登场画面",
    "line：典型短对白",
    "要求：所有字段用中文；角色必须服务强冲突和连续反转，不能只是人物小传。",
  ].join("\n"),

  series_outline: [
    "任务：生成全剧大纲，并按 options.episodeCount 生成分集大纲；如果没有 episodeCount，默认 12 集。",
    "输出结构：",
    "1. 全剧主线",
    "2. 三幕结构",
    "3. 关键反转清单",
    "4. 情绪升级曲线",
    "5. 分集大纲",
    "每集格式：第 X 集 / 核心事件 / 主要冲突 / 情绪爆点 / 集尾钩子",
    "要求：分集数量必须等于 options.episodeCount；每集结尾都要有推动下一集的钩子。",
  ].join("\n"),

  chinese_script: [
    "任务：根据大纲生成中文漫剧剧本。",
    "根据 options.chineseScriptRange 控制生成范围：",
    "- first3：生成前 3 集中文剧本",
    "- first15：生成前 15 集中文剧本",
    "- first_half：生成前半部中文剧本，集数为 options.episodeCount 的一半",
    "- full：生成全剧中文剧本",
    "每集格式：",
    "## 第 X 集",
    "片长：使用 options.episodeDuration",
    "### 场景 1",
    "- 画面：",
    "- 人物：",
    "- 动作：",
    "- 情绪：",
    "- 对白：短句，适合竖屏漫剧",
    "- 镜头提示：",
    "### 集尾钩子",
    "要求：中文输出；强画面、强冲突、强情绪、短对白；不改变大纲核心剧情。",
  ].join("\n"),

  translation: [
    "任务：将中文剧本翻译为 options.targetLanguage。",
    "输出结构：",
    "1. 目标语言剧本",
    "2. 关键台词翻译",
    "3. 需要保留的情绪表达",
    "4. 翻译风险提示",
    "要求：主体内容使用目标语言；保留漫剧节奏、短对白和强情绪，不直译中文长句。",
  ].join("\n"),

  localization: [
    "任务：对翻译后的剧本进行目标市场本土化优化。",
    "检查项：文化表达、称谓、职业、法律、宗教、习惯用语、情绪表达、目标市场爽点。",
    "输出结构：",
    "1. 本土化优化版剧本",
    "2. 已调整的表达",
    "3. 仍需人工确认的风险",
    "要求：保留原剧情，只优化表达、对白、节奏和画面感。",
  ].join("\n"),

  final_script: [
    "任务：生成最终剧本。",
    "输入会包含本土化优化后的剧本。",
    "输出标题必须为：经过本土化优化之后的剧本",
    "输出内容：整理为可下载、可交付的最终剧本版本。",
    "要求：保留本土化后的语言和剧情；统一格式；删掉过程说明、问题清单和无关提示。",
  ].join("\n"),

  quality_evaluation: [
    "任务：对最终剧本进行评估。",
    "输出结构：",
    "1. Hook 强度：0-10 分",
    "2. 情绪密度：0-10 分",
    "3. 反转频率：0-10 分",
    "4. 漫剧画面感：0-10 分",
    "5. 目标市场适配度：0-10 分",
    "6. 最大问题清单",
    "7. 可执行修改建议",
    "要求：不要只打分，必须给出能直接修改的建议。",
  ].join("\n"),

  storyboard_script: [
    "任务：把最终剧本一键转成分镜头脚本。",
    "输出结构：",
    "## 第 X 集分镜头脚本",
    "### 镜头 1",
    "- 景别：",
    "- 画面：",
    "- 人物/动作：",
    "- 台词/字幕：",
    "- 音效/情绪：",
    "- 转场：",
    "要求：每集至少 12 个镜头；画面可直接交给漫剧制作或 AI 视频生成；保留原剧情和对白，不新增大段剧情。",
  ].join("\n"),
};

export function buildPrompt(payload: GeneratePayload) {
  return [
    commonRules,
    "",
    "【input】",
    payload.input || payload.idea || "未提供 input。",
    "",
    "【context】",
    buildContext(payload),
    "",
    "【options】",
    JSON.stringify(buildOptions(payload), null, 2),
    "",
    `【taskType】${payload.taskType} / ${taskNames[payload.taskType]}`,
    promptByTask[payload.taskType],
  ].join("\n");
}

function buildContext(payload: GeneratePayload) {
  const priorSteps = payload.allSteps
    ? Object.entries(payload.allSteps)
        .filter(([, value]) => Boolean(value?.trim()))
        .map(([taskType, value]) => `【${taskNames[taskType as TaskType]}】\n${value}`)
        .join("\n\n")
    : "";

  return [
    `项目名称：${payload.projectTitle || "未命名项目"}`,
    `目标市场：${payload.market || payload.options?.market || "未选择"}`,
    `题材：${payload.genre || payload.options?.genre || "未选择"}`,
    payload.benchmarkTitle || payload.options?.benchmarkTitle
      ? `竞品名称：${payload.benchmarkTitle || payload.options?.benchmarkTitle}`
      : "",
    payload.benchmarkLink || payload.options?.benchmarkLink
      ? `竞品链接：${payload.benchmarkLink || payload.options?.benchmarkLink}`
      : "",
    payload.idea ? `故事创意：${payload.idea}` : "",
    payload.context ? `补充上下文：\n${payload.context}` : "",
    priorSteps ? `前序步骤内容：\n${priorSteps}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildOptions(payload: GeneratePayload) {
  return {
    market: payload.options?.market || payload.market || "未选择",
    genre: payload.options?.genre || payload.genre || "未选择",
    sourceLanguage: payload.options?.sourceLanguage || "中文",
    targetLanguage: payload.options?.targetLanguage || "英文",
    benchmarkTitle: payload.options?.benchmarkTitle || payload.benchmarkTitle || "",
    benchmarkLink: payload.options?.benchmarkLink || payload.benchmarkLink || "",
    episodeDuration: payload.options?.episodeDuration || "2 分钟",
    episodeCount: payload.options?.episodeCount || 12,
    chineseScriptRange: payload.options?.chineseScriptRange || "first3",
  };
}
