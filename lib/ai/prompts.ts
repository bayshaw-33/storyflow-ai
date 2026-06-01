export type TaskType =
  | "market_positioning"
  | "benchmark_analysis"
  | "brief"
  | "market_prediction"
  | "characters"
  | "series_outline"
  | "quality_evaluation"
  | "translation"
  | "localization"
  | "final_script"
  | "storyboard_script";

export type ScriptMode = "first3_with_outline" | "full_script";

export type GenerateOptions = {
  market?: string;
  genre?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  benchmarkTitle?: string;
  benchmarkLink?: string;
  episodeDuration?: string;
  episodeCount?: number;
  scriptMode?: ScriptMode;
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
  series_outline: "全剧大纲",
  quality_evaluation: "AI 质量评估",
  translation: "翻译",
  localization: "本土化优化",
  final_script: "生成剧本",
  storyboard_script: "分镜头脚本",
};

const commonRules = [
  "你是 StoryFlow AI 的海外漫剧研发助手。",
  "必须使用中文输出，除非任务明确要求生成目标语言版本。",
  "面向“漫剧”和海外竖屏短剧，不是普通小说、长剧、网文大纲或营销文案。",
  "只输出可直接放进创作后台编辑的正文，不输出解释过程、思考过程、免责声明或教程。",
  "强调强画面感、强冲突、强情绪、短对白、连续钩子、集尾反转。",
  "输出格式要稳定，使用清晰标题、编号、短段落，便于前端展示和后续编辑。",
  "不要输出 Markdown 表格。",
].join("\n");

const promptByTask: Record<TaskType, string> = {
  market_positioning: [
    "任务：根据 input、context、options 生成市场定位。",
    "输出结构：",
    "1. 目标市场判断",
    "2. 题材适配度",
    "3. 目标受众画像",
    "4. 平台与内容语感",
    "5. 文化风险与规避方式",
    "要求：必须结合目标市场、中文题材、每集片长和集数，不要泛泛而谈。",
  ].join("\n"),

  benchmark_analysis: [
    "任务：进行 Benchmark Analysis 竞品分析。",
    "输出结构：",
    "1. 竞品基本判断",
    "2. 题材与卖点拆解",
    "3. 人物关系结构",
    "4. 前 3 集钩子设计",
    "5. 情绪曲线",
    "6. 可借鉴但不能照搬的点",
    "7. 对本项目的创作启发",
    "要求：结合竞品名称和链接。如果链接内容不可访问，只基于用户提供信息分析，并明确依据不足。",
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
    "要求：剧名要短、有冲突、有记忆点；Brief 要能指导后续角色、大纲和剧本生成。",
  ].join("\n"),

  market_prediction: [
    "任务：生成市场预判。",
    "输出结构：",
    "1. 市场匹配度：0-10 分，并说明原因",
    "2. 推荐标签",
    "3. 潜在风险",
    "4. 前 5 秒 Hook 建议",
    "5. 前 3 集强化建议",
    "6. 集数和片长适配建议",
    "要求：结论要具体，能指导下一步角色和大纲生成。",
  ].join("\n"),

  characters: [
    "任务：生成角色设定。",
    "至少输出：女主、男主或关键关系对象、主反派、关键配角。",
    "每个角色格式：",
    "### 角色名",
    "- 身份：",
    "- 目标：",
    "- 弱点：",
    "- 秘密：",
    "- 成长弧线：",
    "- 与其他角色的冲突关系：",
    "- 首次登场画面：",
    "- 典型短对白：",
    "要求：角色必须服务强冲突和连续反转，不能只是人物小传。",
  ].join("\n"),

  series_outline: [
    "任务：生成全剧大纲，并按 options.episodeCount 生成分集大纲；如果没有 episodeCount，默认 12 集。",
    "输出结构：",
    "1. 全剧主线",
    "2. Act 1：建立羞辱、危机和欲望",
    "3. Act 2：反击升级、关系拉扯和身份误会",
    "4. Act 3：身份揭露、终局反转和情绪释放",
    "5. 关键反转清单",
    "6. 分集大纲",
    "每集格式：第 X 集 / 核心事件 / 主要冲突 / 情绪爆点 / 集尾钩子",
    "要求：分集数量必须等于 options.episodeCount；每集结尾都要有推动下一集的钩子。",
  ].join("\n"),

  quality_evaluation: [
    "任务：进行 AI 质量评估。",
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

  translation: [
    "任务：翻译当前剧本或项目内容。",
    "输出结构：",
    "1. 目标语言版本",
    "2. 关键台词翻译",
    "3. 需要保留的情绪表达",
    "4. 翻译风险提示",
    "要求：默认保留漫剧节奏、短对白和强情绪，不直译中文长句。",
  ].join("\n"),

  localization: [
    "任务：进行本土化检查与自动优化。",
    "检查项：文化表达、称谓、职业、法律、宗教、习惯用语、目标市场情绪偏好。",
    "输出结构：",
    "1. 发现问题",
    "2. 修改建议",
    "3. 自动优化版本",
    "4. 仍需人工确认的风险",
    "要求：必须结合目标市场，不要泛泛提示；保留原剧情，只优化表达、对白、节奏和画面感。",
  ].join("\n"),

  final_script: [
    "任务：在本土化优化之后生成正式剧本。",
    "根据 options.scriptMode 选择范围：",
    "- first3_with_outline：生成前 3 集完整漫剧剧本，并补充全局剧本大纲。",
    "- full_script：按 options.episodeCount 生成全局剧本。若集数较多，每集至少给出关键场景、冲突、对白、画面和集尾钩子。",
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
    "要求：剧本必须强画面、强冲突、强情绪、短对白；不要改写原核心剧情。",
  ].join("\n"),

  storyboard_script: [
    "任务：把已生成剧本一键转成分镜头脚本。",
    "输出结构：",
    "## 第 X 集分镜头脚本",
    "### 镜头 1",
    "- 景别：",
    "- 画面：",
    "- 人物/动作：",
    "- 台词/字幕：",
    "- 音效/情绪：",
    "- 转场：",
    "要求：每集至少 12 个镜头；画面要能直接交给漫剧制作或 AI 视频生成；保留原剧情和对白，不新增大段剧情。",
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
    episodeDuration: payload.options?.episodeDuration || "2 分钟",
    episodeCount: payload.options?.episodeCount || 12,
    scriptMode: payload.options?.scriptMode || "first3_with_outline",
  };
}
