export type TaskType =
  | "market_positioning"
  | "benchmark_analysis"
  | "brief"
  | "market_prediction"
  | "characters"
  | "series_outline"
  | "episode_scripts"
  | "quality_evaluation"
  | "translation"
  | "localization";

export type GenerateOptions = {
  market?: string;
  genre?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  benchmarkTitle?: string;
  benchmarkLink?: string;
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
  market_positioning: "市场定位",
  benchmark_analysis: "竞品分析",
  brief: "项目 Brief",
  market_prediction: "市场预判",
  characters: "角色设定",
  series_outline: "全剧大纲与 12 集大纲",
  episode_scripts: "前 3 集剧本",
  quality_evaluation: "AI 质量评估",
  translation: "翻译",
  localization: "本土化",
};

const commonRules = [
  "你是 StoryFlow AI 的海外短剧研发助手。",
  "必须使用中文输出，除非任务要求翻译成目标语言。",
  "面向海外短剧和漫剧研发，不输出官网文案、营销话术、教程或解释过程。",
  "输出格式必须稳定，使用清晰标题、编号和短段落，便于前端展示和后续编辑。",
  "强调强画面感、强冲突、强情绪、短对白、连续钩子。",
  "不要输出 Markdown 表格。",
].join("\n");

const promptByTask: Record<TaskType, string> = {
  market_positioning: [
    "任务：根据 input、context、options 生成市场定位。",
    "输出结构：",
    "1. 目标市场判断",
    "2. 题材适配度",
    "3. 目标受众画像",
    "4. 观看平台与内容语感",
    "5. 需要规避的文化风险",
    "要求：必须结合所选市场与题材，不要泛泛而谈。",
  ].join("\n"),
  benchmark_analysis: [
    "任务：进行 Benchmark Analysis 竞品分析。",
    "输出结构：",
    "1. 题材分析",
    "2. 人物结构",
    "3. 核心卖点",
    "4. 情绪曲线",
    "5. 节奏分析",
    "6. 成功因素",
    "7. 可借鉴但不能照搬的点",
    "要求：结合竞品名称和链接；如果链接内容不可访问，只基于用户提供的信息做分析并说明依据不足。",
  ].join("\n"),
  brief: [
    "任务：根据故事创意生成项目 Brief。",
    "输出结构：",
    "1. 故事定位",
    "2. 一句话卖点",
    "3. 核心冲突",
    "4. 主角目标",
    "5. 反派阻力",
    "6. 情绪基调",
    "7. 目标受众",
    "8. 视觉风格",
    "要求：像创作后台里的可执行 Brief，不要像融资介绍。",
  ].join("\n"),
  market_prediction: [
    "任务：生成市场预判。",
    "输出结构：",
    "1. 市场匹配度：0-10 分，并说明原因",
    "2. 推荐标签",
    "3. 潜在风险",
    "4. 优化建议",
    "5. 前 3 集强化建议",
    "要求：结论要具体，能指导下一步角色和大纲生成。",
  ].join("\n"),
  characters: [
    "任务：生成角色设定。",
    "输出角色：女主、男主或关键关系对象、主反派、关键配角。",
    "每个角色输出字段：",
    "- 身份",
    "- 目标",
    "- 弱点",
    "- 秘密",
    "- 成长弧线",
    "- 与其他角色的冲突关系",
    "- 首次登场画面",
    "- 典型短对白",
  ].join("\n"),
  series_outline: [
    "任务：生成全剧大纲，并同时生成 12 集大纲。",
    "输出结构：",
    "1. Act 1：建立冲突与羞辱/危机",
    "2. Act 2：反击升级与关系拉扯",
    "3. Act 3：身份揭露、终局反转与情绪释放",
    "4. 关键反转清单",
    "5. 12 集大纲",
    "每集格式：第 X 集 / 核心事件 / 冲突 / 钩子",
    "要求：12 集大纲必须完整，不少于 12 集；每集结尾都要有点击下一集的钩子。",
  ].join("\n"),
  episode_scripts: [
    "任务：生成前 3 集试生产剧本：Episode 1、Episode 2、Episode 3。",
    "每集输出结构：",
    "1. 场景",
    "2. 人物",
    "3. 动作",
    "4. 对白",
    "5. 分镜提示",
    "6. 集尾钩子",
    "要求：每集至少 12 个分镜；对白短；每集都必须有强冲突和集尾反转。",
  ].join("\n"),
  quality_evaluation: [
    "任务：进行 AI 质量评估。",
    "输出结构：",
    "1. Hook 强度：0-10 分",
    "2. 情绪密度：0-10 分",
    "3. 反转频率：0-10 分",
    "4. 市场适配度：0-10 分",
    "5. 完播率预测",
    "6. 最大问题清单",
    "7. 优化建议",
    "要求：不要只打分，必须给可执行修改建议。",
  ].join("\n"),
  translation: [
    "任务：翻译当前剧本或项目内容。",
    "输出结构：",
    "1. 目标语言版本",
    "2. 关键台词翻译",
    "3. 需要保留的情绪表达",
    "4. 翻译风险提示",
    "要求：默认保留短剧节奏和短对白，不直译中文长句。",
  ].join("\n"),
  localization: [
    "任务：进行本土化检查与自动修正。",
    "检查项：文化表达、称谓、职业、法律、宗教、习惯用语。",
    "输出结构：",
    "1. 发现问题",
    "2. 修改建议",
    "3. 自动修正版本",
    "4. 仍需人工确认的风险",
    "要求：必须结合目标市场，不要泛泛提示。",
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
    targetLanguage: payload.options?.targetLanguage || "英语",
    benchmarkTitle: payload.options?.benchmarkTitle || payload.benchmarkTitle || "",
    benchmarkLink: payload.options?.benchmarkLink || payload.benchmarkLink || "",
  };
}
