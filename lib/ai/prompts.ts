export type TaskType =
  | "market_analysis"
  | "script_import"
  | "brief"
  | "characters"
  | "series_outline"
  | "existing_script"
  | "chinese_script"
  | "continuation_script"
  | "translation"
  | "localization"
  | "test_script"
  | "quality_evaluation"
  | "final_script"
  | "storyboard_script"
  | "final_delivery";

export type ChineseScriptRange = "first3" | "first15" | "first_half" | "full";
export type FinalScriptVersion = "chinese" | "foreign" | "bilingual";

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
  finalScriptVersion?: FinalScriptVersion;
  optimizeInstruction?: string;
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
  market_analysis: "市场",
  script_import: "剧本导入",
  brief: "创意",
  characters: "角色",
  series_outline: "大纲",
  existing_script: "已有剧本",
  chinese_script: "中文剧本",
  continuation_script: "续写剧本",
  translation: "翻译",
  localization: "本土化",
  test_script: "测试剧本",
  quality_evaluation: "评估",
  final_script: "最终剧本",
  storyboard_script: "分镜",
  final_delivery: "最终交付",
};

const commonRules = [
  "你是 StoryFlow AI 的海外漫剧研发助手。",
  "必须使用中文输出，翻译和外语剧本任务除外；翻译任务按目标语言输出主体内容。",
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

  script_import: [
    "任务：解析用户导入的已有小说、剧本或故事材料，整理成可用于续写的项目底稿。",
    "输出结构必须包含：",
    "1. 原始材料类型判断：小说 / 剧本 / 大纲 / 混合材料",
    "2. 已有剧情概况：用 5-8 条概括已经发生的关键事件",
    "3. 核心人物与关系：列出主要人物、关系、目标、秘密和冲突",
    "4. 当前剧情停点：明确故事停在什么情绪点、冲突点或悬念点",
    "5. 可续写方向：给出 3 个可继续推进的方向，每个方向包含冲突和钩子",
    "6. 需要保留的风格：对白长度、情绪强度、画面调性、叙事节奏",
    "7. 续写风险：列出可能破坏因果、人物弧线或原文设定的风险",
    "要求：不要照抄原文长段落；要提炼成续写可用的信息；面向漫剧分镜和短剧节奏。",
  ].join("\n"),

  brief: [
    "任务：根据故事创意或附件文本生成项目 Brief，并自动生成剧名。",
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
    "要求：如果 input 是小说或剧本附件文本，要先提炼核心故事，不要照抄原文。",
  ].join("\n"),

  characters: [
    "任务：生成角色设定。",
    "只输出 JSON 对象，不要 Markdown，不要代码块。",
    "JSON 对象结构：",
    "{",
    '  "relationshipDiagram": "用文字描述人物关系图，可包含箭头关系，如：林晚 -> 复仇对象 -> 林薇",',
    '  "characters": [',
    "    {",
    '      "name": "角色名",',
    '      "role": "角色功能，例如女主、男主、反派、关键配角",',
    '      "identity": "身份",',
    '      "goal": "目标",',
    '      "weakness": "弱点",',
    '      "secret": "秘密",',
    '      "arc": "成长弧线",',
    '      "conflict": "与其他角色的冲突关系",',
    '      "entrance": "首次登场画面",',
    '      "line": "典型短对白",',
    '      "appearancePrompt": "人物形象提示词，适合 AI 生成角色图，包含年龄、气质、服装、发型、色彩、镜头感"',
    "    }",
    "  ]",
    "}",
    "至少包含女主、男主或关键关系对象、主反派、关键配角。",
    "要求：所有字段用中文；角色必须服务强冲突和连续反转。",
  ].join("\n"),

  series_outline: [
    "任务：生成全剧大纲，并按 options.episodeCount 生成分集大纲；如果没有 episodeCount，默认 12 集。",
    "输出结构必须包含：",
    "1. 全剧主线",
    "2. 三幕结构：把故事分成开端、对抗、结局，确定主要转折点",
    "3. 八段式 Treatment：把三幕细分成 8 个叙事段落，检查节奏和因果",
    "4. 关键反转清单",
    "5. 情绪升级曲线",
    "6. 分集大纲",
    "每集格式：第 X 集 / 核心事件 / 主要冲突 / 情绪爆点 / 集尾钩子",
    "要求：分集数量必须等于 options.episodeCount；每集结尾都要有推动下一集的钩子。",
  ].join("\n"),

  existing_script: [
    "任务：根据导入材料和大纲，整理“已有剧本”模块，方便后续从当前停点继续写。",
    "输出结构必须包含：",
    "1. 已有剧本范围：说明已覆盖到第几集/第几场/哪个关键节点",
    "2. 已有剧情摘要：按集或按场列出已经发生的内容",
    "3. 已有 Scene List：列出关键场次的功能、冲突、价值变化和前后因果",
    "4. 人物当前状态：每个主要人物当前目标、误会、秘密、情绪位置",
    "5. 当前悬念：列出必须在续写中承接的悬念和钩子",
    "6. 续写起点：给出下一场或下一集最适合打开的画面",
    "要求：保留原剧情，不新增无关大事件；格式稳定，方便人工编辑。",
  ].join("\n"),

  chinese_script: [
    "任务：根据大纲生成中文漫剧剧本。",
    "根据 options.chineseScriptRange 控制生成范围：first3 前 3 集；first15 前 15 集；first_half 前半部；full 全剧。",
    "每集格式：",
    "## 第 X 集",
    "片长：使用 options.episodeDuration",
    "### Scene List",
    "- 场次：",
    "- 功能：这场戏在故事中的功能",
    "- 冲突：",
    "- 价值变化：例如信任 -> 怀疑、羞辱 -> 反击",
    "- 前后因果：这场戏由什么导致，又导致什么",
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

  continuation_script: [
    "任务：从“已有剧本”的当前停点继续生成中文漫剧续写剧本。",
    "生成范围：默认生成接下来的 3 集；如果 options.chineseScriptRange 或上下文提出范围要求，则按要求执行。",
    "每集格式：",
    "## 第 X 集",
    "片长：使用 options.episodeDuration",
    "### Scene List",
    "- 场次：",
    "- 功能：这场戏在续写中的功能",
    "- 冲突：",
    "- 价值变化：例如信任 -> 怀疑、羞辱 -> 反击",
    "- 前后因果：这场戏由什么导致，又导致什么",
    "### 场景 1",
    "- 画面：",
    "- 人物：",
    "- 动作：",
    "- 情绪：",
    "- 对白：短句，适合竖屏漫剧",
    "- 镜头提示：",
    "### 集尾钩子",
    "要求：必须承接已有剧本的人物状态、悬念和因果；不能推翻原设定；强化画面感、冲突、情绪和连续钩子。",
  ].join("\n"),

  translation: [
    "任务：将中文剧本翻译为 options.targetLanguage，并保留中文原文，输出双语核对版。",
    "输出结构：",
    "1. 双语剧本",
    "每个场景必须按以下格式输出：",
    "【中文原文】",
    "保留原中文 Scene List、画面、动作、对白。",
    "【目标语言译文】",
    "使用 options.targetLanguage 翻译同一段内容。",
    "2. 关键台词对照",
    "3. 需要保留的情绪表达",
    "4. 翻译风险提示",
    "要求：不要删除中文；中文和目标语言必须对应，方便人工核对；保留 Scene List、漫剧节奏、短对白和强情绪。",
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

  test_script: [
    "任务：生成测试剧本。",
    "输入会包含本土化优化后的剧本。",
    "输出结构：",
    "## 测试剧本",
    "1. 用于小范围测试的剧本版本",
    "2. 保留 Scene List",
    "3. 标记可重点观察的 Hook、爽点、风险台词",
    "要求：这是评估前的测试版本，不要写成最终交付版本。",
  ].join("\n"),

  quality_evaluation: [
    "任务：对测试剧本进行评估，并形成可用于下一步最终剧本修订的明确要求。",
    "输出结构必须包含：",
    "1. Hook 强度：0-10 分",
    "2. 情绪密度：0-10 分",
    "3. 反转频率：0-10 分",
    "4. 漫剧画面感：0-10 分",
    "5. 目标市场适配度：0-10 分",
    "6. 诊断修订：检查因果、人物弧线、节奏、重复和每场戏的价值推进",
    "7. 计时与删减：按屏幕时间估算长度，删掉重复、停滞或不推动故事的部分",
    "8. 最终剧本修订指令：用清单写出下一步必须修改的内容",
    "要求：评估内容要能直接作为最终剧本生成的修订依据。",
  ].join("\n"),

  final_script: [
    "任务：根据测试剧本和评估要求生成最终剧本。",
    "必须严格执行用户手动编辑后的评估内容。",
    "根据 options.finalScriptVersion 输出不同版本：",
    "- chinese：只输出中文剧本，不输出外语正文",
    "- foreign：只输出外语剧本，使用 options.targetLanguage，不输出中文正文",
    "- bilingual：输出双语剧本，每句或每段保留中文和目标语言对照",
    "输出标题必须为：经过评估修订后的最终剧本",
    "标题下一行必须标明版本：中文剧本 / 外语剧本 / 双语剧本。",
    "要求：保留 Scene List；落实诊断修订和计时删减；统一格式；删掉过程说明、问题清单和无关提示。",
  ].join("\n"),

  storyboard_script: [
    "任务：把最终剧本转成分集分镜头脚本。",
    "输出必须按集数分开，每集一个模块：",
    "## 第 X 集",
    "### 镜头 1",
    "- 景别：",
    "- 画面：",
    "- 人物/动作：",
    "- 台词/字幕：",
    "- 音效/情绪：",
    "- 转场：",
    "- AI 生成提示词：用于 AI 视频或漫画图生成，包含人物、场景、构图、光线、情绪、风格",
    "要求：每集至少 12 个镜头；保留原剧情和对白，不新增大段剧情。",
  ].join("\n"),

  final_delivery: [
    "任务：整理最终交付说明。",
    "输出结构：",
    "1. 故事概况",
    "2. 大纲交付范围",
    "3. 最终剧本版本清单：中文、外语、双语",
    "4. 分镜交付范围",
    "5. 现场演示建议",
    "要求：这是交付包目录说明，不要重新生成剧本正文。",
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
    payload.options?.optimizeInstruction ? `优化要求：${payload.options.optimizeInstruction}` : "",
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
    finalScriptVersion: payload.options?.finalScriptVersion || "foreign",
    optimizeInstruction: payload.options?.optimizeInstruction || "",
  };
}
