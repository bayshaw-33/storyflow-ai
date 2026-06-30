export type TaskType =
  | "market_analysis"
  | "script_import"
  | "brief"
  | "characters"
  | "structure_model"
  | "beat_cards"
  | "series_outline"
  | "existing_script"
  | "chinese_script"
  | "continuation_script"
  | "translation"
  | "localization"
  | "test_script"
  | "quality_evaluation"
  | "final_script"
  | "format_check"
  | "storyboard_script"
  | "final_delivery"
  | "song_workbench"
  | "novel_brief"
  | "novel_bible"
  | "novel_characters"
  | "novel_volume_outline"
  | "novel_chapter_outline"
  | "novel_chapter_draft"
  | "novel_revision"
  | "novel_export"
  | "viral_video_analysis"
  | "viral_structure_remake"
  | "viral_export_package";

export type ChineseScriptRange = "first3" | "first15" | "first_half" | "full";
export type FinalScriptVersion = "chinese" | "foreign" | "bilingual";
export type LocalizationMode = "script" | "revision";

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
  localizationMode?: LocalizationMode;
  optimizeInstruction?: string;
  targetWordCount?: number;
  platform?: string;
  chapterNo?: number;
};

export type ByoApiProvider = "auto" | "deepseek" | "minimax" | "custom";

export type ByoApiConfig = {
  provider?: ByoApiProvider;
  connectionId?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  minimaxApiKey?: string;
  minimaxModel?: string;
  minimaxBaseUrl?: string;
  customProviderName?: string;
  customApiKey?: string;
  customModel?: string;
  customBaseUrl?: string;
};

export type GeneratePayload = {
  taskType: TaskType;
  projectId?: string;
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
  byoApi?: ByoApiConfig;
};

export const taskNames: Record<TaskType, string> = {
  market_analysis: "市场",
  script_import: "剧本导入",
  brief: "创意",
  characters: "角色",
  structure_model: "结构模型",
  beat_cards: "节拍卡",
  series_outline: "大纲",
  existing_script: "已有剧本",
  chinese_script: "中文剧本",
  continuation_script: "续写剧本",
  translation: "翻译",
  localization: "本土化",
  test_script: "测试剧本",
  quality_evaluation: "评估",
  final_script: "最终剧本",
  format_check: "格式检查",
  storyboard_script: "分镜",
  final_delivery: "最终交付",
  song_workbench: "歌曲创作",
  novel_brief: "小说创意 Brief",
  novel_bible: "小说 Bible",
  novel_characters: "小说角色卡",
  novel_volume_outline: "小说分卷大纲",
  novel_chapter_outline: "小说章节大纲",
  novel_chapter_draft: "小说章节正文",
  novel_revision: "小说章节修改",
  novel_export: "小说导出包",
  viral_video_analysis: "爆款结构分析",
  viral_structure_remake: "同结构改写",
  viral_export_package: "爆款创作交付",
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

const songRules = [
  "你是 Kiikis 的歌曲创作助手，专门生成可复制到 Suno 的歌词、Style Prompt 和 Composition Prompt。",
  "只输出生成内容本身，不输出解释、教程、免责声明或 AI 回复套话。",
  "必须严格使用用户要求的输出语言；如果是 Bilingual，歌词应提供清晰双语段落。",
  "不得输出真实歌手、艺人、乐队、唱片公司或受版权保护作品名称；只能使用安全的声音、唱法、曲风、编曲描述。",
  "歌词必须原创，避免照抄用户输入中的长句，避免套用知名歌词、影视台词或可识别的版权表达。",
  "Suno 标签要清晰、短促、可复制；Style Prompt 控制在 250 字符左右，Composition Prompt 控制在 350 字符左右。",
  "输出格式必须稳定，严格包含：---LYRICS---、---STYLE_PROMPT---、---COMPOSITION_PROMPT--- 三个分隔标题。",
].join("\n");

const novelRules = [
  "你是 Kiikis 的小说创作助手，专门服务网文作者、短剧编剧和内容工作室。",
  "只输出生成内容本身，不输出解释、教程、免责声明或 AI 回复套话。",
  "面向长篇连载、章节持续生产、人物连续性、伏笔埋设和后续短剧改编。",
  "必须尊重用户输入、已确认 Bible、角色状态、locked canon 和 Universe 继承内容。",
  "不得静默覆盖用户设定；如果需要新增设定，必须在连续性备注中标明。",
  "输出格式要稳定，使用清晰标题、编号、短段落，便于前端保存版本和后续编辑。",
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
    "创意原则：必须优先响应用户 input 和优化要求，不要套用默认豪门复仇模板。",
    "差异化要求：除非用户明确要求，否则不要默认使用重生、订婚宴羞辱、继妹顶替、隐藏继承人、董事文件、雨夜黑车等高频桥段。",
    "如果用户给出修改意见，必须让剧名、主角职业/身份、核心冲突、开场钩子、反派阻力、视觉风格至少 4 项发生清晰变化。",
    "如果题材选项较常见，也要给出一个反套路锚点，例如特殊职业、罕见地域、非典型亲密关系、道德两难、超现实规则或独特视觉母题。",
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
    "9. 差异化锚点：列出 3 个让该项目区别于同类短剧的具体设定",
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

  structure_model: [
    "任务：为当前项目选择并生成专业剧作结构模型。",
    "必须结合 input、context、options，面向海外竖屏短剧/漫剧，不要写成电影论文。",
    "可使用并混合以下模型：三幕结构、救猫咪 15 节拍、英雄之旅、弗赖塔格金字塔、豪格六阶段、韩剧人物关系驱动。",
    "输出结构必须包含：",
    "1. 推荐结构模型：说明主模型和辅助模型",
    "2. 选择理由：为什么适合当前题材、市场、集数和片长",
    "3. 三幕骨架：开端 / 对抗 / 结局，每幕写清主要转折点",
    "4. 救猫咪节拍表：Opening Image、Theme Stated、Set-up、Catalyst、Debate、Break into Two、B Story、Fun and Games、Midpoint、Bad Guys Close In、All Is Lost、Dark Night of the Soul、Break into Three、Finale、Final Image",
    "5. B 故事：情感副线、主题线、关系变化线",
    "6. 韩剧式关系驱动：主角目标、阻碍者、配角功能、情绪推进",
    "7. 风险提示：列出可能导致后续剧本跑偏的 3 个结构风险",
    "要求：格式稳定、短句、可直接作为下一步节拍卡输入。",
  ].join("\n"),

  beat_cards: [
    "任务：根据结构模型、角色和项目 Brief 生成可执行的节拍卡 Beat Cards。",
    "每张节拍卡必须是一个清晰模块，便于后续生成大纲、剧本和分镜。",
    "输出格式：",
    "## 节拍 1：节拍名称",
    "- 所属模型：三幕 / 救猫咪 / 英雄之旅 / 韩剧关系驱动",
    "- 所属集数：第 X 集或全局",
    "- 预计时长：按 options.episodeDuration 估算",
    "- 戏剧功能：这张节拍在故事中承担什么功能",
    "- 核心冲突：人物之间的直接冲突",
    "- 价值变化：例如信任 -> 怀疑、羞辱 -> 反击、希望 -> 绝望",
    "- 情绪爆点：观众应感受到的主要情绪",
    "- 参与角色：角色名列表",
    "- 画面提示：适合漫剧/竖屏短剧的强画面",
    "- 钩子：推动下一张节拍或下一集的悬念",
    "必须覆盖 Opening Image、Catalyst、Midpoint、All Is Lost、Finale 等关键节点。",
    "如果 options.episodeCount 较多，优先生成全局节拍和前 15 集核心节拍，不要泛泛而谈。",
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
    "根据 options.localizationMode 输出：",
    "- script：只输出本土化修改后的完整剧本，不输出修改说明。",
    "- revision：输出已完成修改的剧本，并把改动后的词句用 <span class=\"revision-mark\">红色标注内容</span> 包裹；可在相关场景后用【批注：】说明修改原因。",
    "要求：保留原剧情，只优化表达、对白、节奏和画面感；不要输出过程说明；revision 模式必须直接给出改后正文，不要只列修改清单。",
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
    "任务：对本土化后的剧本进行评估，并形成可用于下一步最终剧本修订的明确要求。",
    "输出结构必须包含：",
    "1. Hook 强度：0-10 分",
    "2. 情绪密度：0-10 分",
    "3. 反转频率：0-10 分",
    "4. 漫剧画面感：0-10 分",
    "5. 目标市场适配度：0-10 分",
    "6. 诊断修订：检查因果、人物弧线、节奏、重复和每场戏的价值推进",
    "7. 查重防抄袭：标出疑似直接复用、过度相似、套路化套壳或可能侵权的桥段，并给出原创化改写方向",
    "8. 计时与删减：按屏幕时间估算长度，删掉重复、停滞或不推动故事的部分",
    "9. 最终剧本修订指令：用清单写出下一步必须修改的内容",
    "要求：评估内容要能直接作为最终剧本生成的修订依据。",
  ].join("\n"),

  final_script: [
    "任务：根据本土化剧本和评估要求生成最终剧本。",
    "必须严格执行用户手动编辑后的评估内容。",
    "根据 options.finalScriptVersion 输出不同版本：",
    "- chinese：只输出中文剧本，不输出外语正文",
    "- foreign：只输出外语剧本，使用 options.targetLanguage，不输出中文正文",
    "- bilingual：输出双语剧本，每句或每段保留中文和目标语言对照",
    "输出标题必须为：经过评估修订后的最终剧本",
    "标题下一行必须标明版本：中文剧本 / 外语剧本 / 双语剧本。",
    "要求：保留 Scene List；落实诊断修订和计时删减；统一格式；删掉过程说明、问题清单和无关提示。",
  ].join("\n"),

  format_check: [
    "任务：检查当前剧本是否符合专业交付格式，并给出可执行修复建议。",
    "重点检查 Hollywood Screenplay、亚洲剧本格式、漫剧脚本格式三类适配问题。",
    "必须检查：",
    "1. 场景标题：是否有 INT./EXT.、地点、DAY/NIGHT 或对应中文场景信息",
    "2. 动作段落：是否现在时、可视化、不过长",
    "3. 人物名：是否统一，英文版是否大写，是否有角色名混乱",
    "4. 对白：是否短句、符合角色、是否有过多解释",
    "5. 括号提示：是否过多，是否误写成导演说明",
    "6. 转场：FADE IN、CUT TO、DISSOLVE TO、FADE OUT、THE END 是否需要补充",
    "7. Scene List：每场戏是否有功能、冲突、价值变化、前后因果",
    "8. 竖屏漫剧适配：是否有强画面、强冲突、集尾钩子",
    "输出结构：",
    "## 格式问题清单",
    "按严重程度列出问题。",
    "## 一键修复建议",
    "列出可自动修复的具体动作。",
    "## 推荐输出格式",
    "给出最适合当前项目的格式：漫剧 / Asian / Hollywood / 双语。",
    "## 修复后的片段示例",
    "只示范 1-2 个关键片段，不要重写全剧。",
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

  song_workbench: [
    "任务：根据歌曲项目设定，生成 Suno-ready 歌词、Style Prompt 和 Composition Prompt。",
    "输出必须严格使用以下结构：",
    "---LYRICS---",
    "完整歌词。根据 lyricsMode 输出：suno_enhanced 使用 [Intro]、[Verse]、[Chorus] 等 Suno 段落标签和少量括号演唱/编曲提示；plain_lyrics 保留段落标签但减少括号提示；no_tags 不使用标签。",
    "---STYLE_PROMPT---",
    "一行可复制到 Suno 的风格提示词，包含曲风、情绪、声线、安全歌手描述、主要乐器、律动、调性和混音方向。",
    "---COMPOSITION_PROMPT---",
    "一段编曲提示词，说明 intro、verse、pre-chorus、chorus、bridge、final chorus、outro 的推进方式。",
    "要求：歌词要有清晰 hook，副歌适合重复；不要使用真实艺人名字；不要输出解释。",
  ].join("\n"),

  novel_brief: [
    "任务：根据小说创意生成 Novel Brief，并自动生成暂定书名。",
    "输出结构必须包含：",
    "书名：",
    "1. 类型定位",
    "2. 目标平台与读者",
    "3. 一句话卖点",
    "4. 主角欲望",
    "5. 主冲突",
    "6. 情感线",
    "7. 金手指 / 身份秘密 / 反转设定",
    "8. 前 3 章爆点",
    "9. 留存钩子",
    "要求：适合长篇连载，不要写成短剧 Brief；必须给出可连续生产章节的主线动力。",
  ].join("\n"),

  novel_bible: [
    "任务：生成小说 Bible。",
    "输出结构必须包含：",
    "1. 世界观",
    "2. 核心规则",
    "3. 主要阵营 / 组织",
    "4. 角色关系总览",
    "5. 伏笔清单",
    "6. locked canon：列出不能被后续章节覆盖的事实",
    "7. 语言风格",
    "8. 节奏规则",
    "9. Universe Inbox 候选项：列出建议抽取到 Universe Inbox 的角色、地点、关系、事件和规则",
    "要求：不要直接写入 canon，只列为候选；设定要能支撑分卷和章节生产。",
  ].join("\n"),

  novel_characters: [
    "任务：生成小说角色卡。",
    "输出结构必须包含：",
    "## 主角",
    "- 身份：",
    "- 外显目标：",
    "- 内在欲望：",
    "- 弱点：",
    "- 秘密：",
    "- 成长线：",
    "- 与主冲突关系：",
    "## 反派 / 阻力角色",
    "## 关键配角",
    "## 关系网",
    "## 角色状态追踪规则",
    "要求：角色必须能支撑长线变化、误会、反转和章节连续性。",
  ].join("\n"),

  novel_volume_outline: [
    "任务：生成分卷大纲与长线结构。",
    "输出结构必须包含：",
    "1. 全书主线",
    "2. 分卷结构：每卷包含卷名、卷目标、主要矛盾、关键反转、情感推进、结尾状态",
    "3. 阶段性爽点 / 虐点",
    "4. 伏笔埋设与回收表",
    "5. 结局方向",
    "要求：至少生成 3 卷；每卷都要有可拆成章节的推进目标。",
  ].join("\n"),

  novel_chapter_outline: [
    "任务：生成当前章节大纲。",
    "输出结构必须包含：",
    "---CHAPTER_TITLE---",
    "章节标题",
    "---CHAPTER_OUTLINE---",
    "1. 本章目标",
    "2. 场景列表",
    "3. 主要冲突",
    "4. 角色状态变化",
    "5. 伏笔埋设 / 回收",
    "---ENDING_HOOK---",
    "本章结尾钩子",
    "---CONTINUITY_NOTES---",
    "连续性备注",
    "要求：必须承接上一章摘要、当前卷目标和已有人物状态。",
  ].join("\n"),

  novel_chapter_draft: [
    "任务：生成当前章节正文。",
    "输出必须严格使用以下结构：",
    "---CHAPTER_TITLE---",
    "章节标题",
    "---CHAPTER_OUTLINE---",
    "简要大纲",
    "---CHAPTER_DRAFT---",
    "章节正文",
    "---ENDING_HOOK---",
    "结尾钩子",
    "---CONTINUITY_NOTES---",
    "角色状态、伏笔、canon 影响和下章承接点",
    "要求：正文要有网文连载节奏、场景推进、情绪转折和结尾钩子；不要只写梗概。",
  ].join("\n"),

  novel_revision: [
    "任务：按用户修改指令重写当前章节。",
    "输出必须严格使用以下结构：",
    "---CHAPTER_TITLE---",
    "---CHAPTER_OUTLINE---",
    "---CHAPTER_DRAFT---",
    "---ENDING_HOOK---",
    "---CONTINUITY_NOTES---",
    "要求：必须执行 optimizeInstruction 中的具体要求，返回完整改写后的章节，不要只列修改建议。",
  ].join("\n"),

  novel_export: [
    "任务：整理小说项目导出包。",
    "输出结构必须包含：",
    "1. Novel Brief",
    "2. 小说 Bible",
    "3. 角色卡",
    "4. 分卷大纲",
    "5. 章节清单",
    "6. 连续性备注",
    "7. 可转短剧 Brief",
    "8. Universe Inbox 候选项",
    "要求：这是导出包目录和内容摘要，不要新增未确认的 canon 事实。",
  ].join("\n"),

  viral_video_analysis: [
    "任务：分析短视频的爆款结构。",
    "输出必须是稳定 JSON，包含 f1_hook、f2_body、f3_action、f4_result、f5_memory、raw_storyboard。",
    "重点拆解前 3 秒钩子、节奏推进、动作转折、结果呈现、记忆点和可复用结构公式。",
    "不要输出解释性开场白。",
  ].join("\n"),

  viral_structure_remake: [
    "任务：基于爆款结构分析和用户改写要求，生成同结构改写分镜。",
    "输出包含开场、主体、结尾记忆点、旁白/字幕建议和拍摄执行建议。",
    "保持结构一致，但内容表达必须原创，不照搬原视频具体台词或镜头。",
  ].join("\n"),

  viral_export_package: [
    "任务：整理爆款创作工作台的交付版本。",
    "输出包含结构分析摘要、改写分镜、图片提示词方向和执行提醒。",
    "不要新增未确认的结构事实。",
  ].join("\n"),
};

export function buildPrompt(payload: GeneratePayload) {
  const rules = payload.taskType === "song_workbench" ? songRules : isNovelTask(payload.taskType) ? novelRules : commonRules;

  return [
    rules,
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

function isNovelTask(taskType: TaskType) {
  return taskType.startsWith("novel_");
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
    payload.options?.optimizeInstruction
      ? `优化要求：${payload.options.optimizeInstruction}\n执行要求：必须产生可见结构变化，不能只润色措辞；如果与前序内容冲突，以优化要求为准。`
      : "",
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
    localizationMode: payload.options?.localizationMode || "script",
    optimizeInstruction: payload.options?.optimizeInstruction || "",
    targetWordCount: payload.options?.targetWordCount || 1800,
    platform: payload.options?.platform || "",
    chapterNo: payload.options?.chapterNo || 1,
  };
}
