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
  | "song_development_chat"
  | "novel_development_chat"
  | "novel_brief"
  | "novel_bible"
  | "novel_characters"
  | "novel_volume_outline"
  | "novel_chapter_outline"
  | "novel_chapter_draft"
  | "novel_revision"
  | "novel_export"
  | "creation_development_chat"
  | "creation_background_world"
  | "creation_character_bible"
  | "creation_plot_outline"
  | "creation_novel_unit"
  | "creation_screenplay_unit"
  | "creation_translate_unit"
  | "creation_localize_unit"
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
  interfaceLanguage?: string;
  contentMode?: "novel" | "screenplay";
  translationLanguage?: string;
  screenplayLanguage?: string;
  dialogueLanguage?: string;
  screenplayFormat?: "international_production" | "hollywood_spec" | "asian_production";
  generationScope?: "unit" | "arc";
  unitNo?: number;
  arcTitle?: string;
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
  song_development_chat: "歌曲创作对话",
  novel_development_chat: "小说创作对话",
  novel_brief: "小说背景",
  novel_bible: "小说世界观及大纲",
  novel_characters: "角色 Bible",
  novel_volume_outline: "小说分卷大纲",
  novel_chapter_outline: "小说章节大纲",
  novel_chapter_draft: "小说正文",
  novel_revision: "小说章节修改",
  novel_export: "小说导出",
  creation_development_chat: "创作对话",
  creation_background_world: "背景及世界观",
  creation_character_bible: "角色圣经",
  creation_plot_outline: "剧情及大纲",
  creation_novel_unit: "正文",
  creation_screenplay_unit: "正文",
  creation_translate_unit: "翻译",
  creation_localize_unit: "本土化及雷同查验",
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
  "你是 Kiikis 的歌曲创作助手，专门生成可复制到 Suno 的歌词和单一 Music Prompt。",
  "只输出生成内容本身，不输出解释、教程、免责声明或 AI 回复套话。",
  "必须严格使用用户要求的输出语言；如果是 Bilingual，歌词应提供清晰双语段落。",
  "不得输出真实歌手、艺人、乐队、唱片公司或受版权保护作品名称；只能使用安全的声音、唱法、曲风、编曲描述。",
  "歌词必须原创，避免照抄用户输入中的长句，避免套用知名歌词、影视台词或可识别的版权表达。",
  "Suno 标签要清晰、短促、可复制；Music Prompt 是 Suno style 输入框使用的一段精炼提示词，必须少于 1000 bytes。",
  "输出格式必须稳定，严格包含：---LYRICS---、---MUSIC_PROMPT--- 两个分隔标题。",
].join("\n");

const novelRules = [
  "你是 Kiikis 的小说创作助手，专门服务网文作者、短剧编剧和内容工作室。",
  "只输出生成内容本身，不输出解释、教程、免责声明或 AI 回复套话。",
  "面向长篇连载、章节持续生产、人物连续性、伏笔埋设和后续短剧改编。",
  "必须尊重用户输入、已确认 Bible、角色状态、locked canon 和 Universe 继承内容。",
  "不得静默覆盖用户设定；如果需要新增设定，必须在连续性备注中标明。",
  "输出格式要稳定，使用清晰标题、编号、短段落或表格，便于前端保存版本和后续编辑。",
].join("\n");

function creationRules(interfaceLanguage?: string) {
  const languageRule = /^(en|en-|english)/i.test(interfaceLanguage || "")
    ? "Respond entirely in English. The interface language controls the assistant conversation only; generated work follows the configured content languages."
    : "全部回复必须使用简体中文。界面语言只控制助手对话，作品正文严格使用已配置的创作语言。";
  return [
    "你是 Kiikis 创作工作台的制片统筹型 AI 助手。",
    languageRule,
    "共享前期文档严格按此顺序推进：背景及世界观、角色圣经、剧情及大纲。",
    "小说与剧本分别保存；只处理当前阶段和当前章/集，不得静默覆盖其他内容。",
    "用户要求生成结构化内容时，只输出指定机器标记，不输出解释性开场白。",
  ].join("\n");
}

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
    "任务：将中文内容翻译为 options.targetLanguage，并保留中文原文，输出双语核对版。",
    "如果 context 显示这是小说项目，必须按小说正文翻译，不要改成剧本格式。",
    "输出结构：",
    "1. 双语正文",
    "每个场景必须按以下格式输出：",
    "【中文原文】",
    "保留原中文结构；如果是小说，保留章节/段落；如果是剧本，保留 Scene List、画面、动作、对白。",
    "【目标语言译文】",
    "使用 options.targetLanguage 翻译同一段内容。",
    "2. 关键台词对照",
    "3. 需要保留的情绪表达",
    "4. 翻译风险提示",
    "要求：不要删除中文；中文和目标语言必须对应，方便人工核对；小说要保留叙事声音和人物口吻；剧本要保留 Scene List、漫剧节奏、短对白和强情绪。",
  ].join("\n"),

  localization: [
    "任务：对翻译后的内容进行目标市场本土化优化，并完成雷同查验。",
    "如果 context 显示这是小说项目，必须按小说正文、章节节奏、叙事口吻和海外读者阅读习惯处理；不要改成剧本格式。",
    "检查项：文化表达、称谓、职业、法律、宗教、习惯用语、情绪表达、目标市场爽点、雷同桥段、套路化套壳、潜在侵权风险。",
    "根据 options.localizationMode 输出：",
    "- script：输出本土化修改后的完整正文，并在末尾追加“雷同查验报告”。",
    "- revision：输出已完成修改的正文，并把改动后的词句用 <span class=\"revision-mark\">红色标注内容</span> 包裹；可在相关段落后用【批注：】说明修改原因；末尾追加“雷同查验报告”。",
    "雷同查验报告必须包含：疑似高频套路、与常见作品的潜在相似风险、原创化改写建议、可保留的安全表达。",
    "要求：保留原剧情，只优化表达、对白、节奏、文化适配和原创度；不要只列修改清单。",
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
    "任务：根据歌曲项目设定与创作对话记录，生成 Suno-ready 歌词和一个可直接复制到 Suno style 输入框的 Music Prompt。",
    "输出必须严格使用以下结构：",
    "---LYRICS---",
    "完整歌词。根据 lyricsMode 输出：suno_enhanced 使用 [Intro]、[Verse]、[Chorus] 等 Suno 段落标签和少量括号演唱/编曲提示；plain_lyrics 保留段落标签但减少括号提示；no_tags 不使用标签。",
    "---MUSIC_PROMPT---",
    "一段可复制到 Suno style 输入框的提示词，合并曲风、情绪、声线、安全歌手描述、主要乐器、律动、调性、结构推进和混音方向。",
    "要求：Music Prompt 必须少于 1000 bytes，语言精炼，不堆砌形容词；歌词要有清晰 hook，副歌适合重复；不要使用真实艺人名字；不要输出解释。",
  ].join("\n"),

  song_development_chat: [
    "任务：你正在和创作负责人进行歌曲创作前期沟通，不要直接输出最终歌词。",
    "你的语气应像专业但好懂的音乐制作助理：帮助新手把模糊感受变成歌曲方向。",
    "不要要求用户填写专业参数；通过自然追问归纳项目类型、主情绪、曲风、乐器、声线、歌词语言、使用场景和参考画面。",
    "输出结构必须包含：",
    "## 我理解到的方向",
    "- 用 3-6 条整理用户刚刚输入的新信息。",
    "## 已经可以确定",
    "- 只列已经足够明确、可用于生成歌词和 Suno style 的信息。",
    "## 我建议补充",
    "- 提出 2-4 个新手也能回答的问题。",
    "## 下一步建议",
    "- 告诉用户可以继续聊天，或直接生成/更新歌词与音乐提示词。",
  ].join("\n"),

  novel_development_chat: [
    "任务：你正在和创作负责人进行小说项目前期沟通，不要直接输出最终文档。",
    "你的语气应像制片统筹型创作助理：先复述你理解到的创作方向，再指出缺口，再给出下一步建议。",
    "必须围绕 Kiikis 的前期创作三件套推进：小说背景、小说世界观及大纲、角色 Bible。",
    "输出结构必须包含：",
    "## 我理解到的方向",
    "- 用 3-6 条整理用户刚刚输入的新信息。",
    "## 可以确认的设定",
    "- 只列已经足够明确、可进入后续文档的设定。",
    "## 还需要追问",
    "- 提出 2-4 个具体问题，优先问会影响剧情结构、角色关系、目标市场或叙事规模的问题。",
    "## 建议下一步",
    "- 明确建议用户继续聊，或可以生成当前阶段文档。",
    "要求：不要编造成最终设定；不要输出长篇故事正文；不要使用 Markdown 表格。",
  ].join("\n"),

  novel_brief: [
    "任务：根据创作沟通记录和小说创意，生成《项目名》小说背景文档。",
    "该文档对应 Kiikis 前期创作三件套中的第一件：项目背景文档。",
    "输出结构必须包含：",
    "# 《暂定书名》小说背景文档",
    "一、项目标识（Project ID）",
    "- 项目中文名",
    "- 英文名/目标市场名",
    "- 版本",
    "- 形态",
    "- 叙事规模：单部完结 / 多部系列 / 多季剧 / 上下篇 / 试播项目 / 开放式",
    "- 目标平台",
    "- 目标市场",
    "- 目标语言",
    "- 核心类型",
    "二、最终创作结论",
    "- 主角",
    "- 关键配角",
    "- 核心关系",
    "- 核心秘密",
    "- 当前确认制作范围",
    "- 结尾爆点或阶段终点",
    "三、一句话简介（Logline）",
    "四、长简介（Series Synopsis）",
    "五、核心卖点（Audience Hooks）",
    "六、最终世界观原则",
    "七、主要角色一览",
    "八、叙事规模与总体规划",
    "九、阶段结构规则",
    "十、当前确认范围关键剧情节点",
    "十一、视觉美学规则",
    "十二、情绪张力/感官场面策略",
    "十三、语言与对白策略",
    "十四、制作红线",
    "要求：使用 Markdown 标题和短段落；叙事规模必须按用户已确认信息决定，不能强行扩展成三季；如信息不足，用“待确认”标注。",
  ].join("\n"),

  novel_bible: [
    "任务：生成《项目名》小说世界观与剧情大纲。",
    "该文档对应 Kiikis 前期创作三件套中的第二件：世界观与剧情大纲。",
    "输出结构必须包含：",
    "# 《项目名》小说世界观与剧情大纲",
    "一、世界观总述",
    "二、核心旧案/前史/原始秘密",
    "三、主角如何知道关键信息",
    "四、核心场景地图",
    "五、当前确认叙事单元详细阶段大纲",
    "六、后续叙事单元规划",
    "七、全剧终局或可扩展方向",
    "八、关键配角的结构功能",
    "九、阶段终点与爆点设计",
    "十、locked canon",
    "十一、Universe Inbox 候选项",
    "要求：必须与小说背景文档一致；如果只做一部，使用“全剧”作为叙事单元；如果后续未确认，写“可扩展方向”，不要写成最终事实。",
  ].join("\n"),

  novel_characters: [
    "任务：生成《项目名》角色圣经 Character Bible。",
    "该文档对应 Kiikis 前期创作三件套中的第三件：角色圣经。",
    "输出结构必须包含：",
    "# 《项目名》角色圣经 Character Bible",
    "一、角色圣经使用规则",
    "二、创作红线",
    "三、角色层级图",
    "四、信息差矩阵",
    "五、主角圣经",
    "每个主角必须包含：基本信息、Want 外在欲望、Need 内在需求、Fear 恐惧、Secret 秘密、叙事弧线、视觉与语言。",
    "六、核心配角圣经",
    "每个配角必须包含：身份、出场时间、关系、人物气质、核心标签、剧情功能、风险控制。",
    "七、关系矩阵",
    "八、情绪张力/感官场面角色分配",
    "九、角色对白样式",
    "十、当前确认范围阶段角色推进表",
    "要求：必须与前两份文档一致；每个角色都必须有剧情功能；信息差必须明确谁知道、谁不知道、观众何时知道。",
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
    "任务：生成小说正文。",
    "输出必须严格使用以下结构：",
    "---CHAPTER_TITLE---",
    "章节或正文段落标题",
    "---CHAPTER_OUTLINE---",
    "简要大纲。如果用户未要求单章，可写当前正文范围的大纲。",
    "---CHAPTER_DRAFT---",
    "小说正文。必须承接小说背景、世界观大纲、角色 Bible 和创作沟通记录。",
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
    "1. 小说背景",
    "2. 小说世界观及大纲",
    "3. 角色 Bible",
    "4. 小说正文",
    "5. 小说译文",
    "6. 本土化及雷同查验",
    "7. 连续性备注",
    "8. 可转短剧 Brief",
    "9. Universe Inbox 候选项",
    "要求：这是导出包目录和内容摘要，不要新增未确认的 canon 事实。",
  ].join("\n"),

  creation_development_chat: [
    "任务：与创作者自然沟通，逐步明确当前阶段，不直接生成未请求的最终文档。",
    "先简短复述已确认方向，再提出最多 3 个会实质影响创作的问题，最后说明可以继续聊天或生成当前阶段。",
    "必须围绕背景及世界观、角色圣经、剧情及大纲推进，并说明本次反馈针对哪个阶段。",
    "不要使用 Markdown 表格，不要擅自增加叙事规模或已锁定事实。",
  ].join("\n"),

  creation_background_world: [
    "任务：生成或更新共享文档《背景及世界观》。",
    "包含项目定位、叙事规模、目标市场、Logline、长简介、世界规则、历史前史、地理/社会边界、视觉与语言规则、locked canon 和制作红线。",
    "只输出可直接保存的 Markdown；未确认信息标记为“待确认”，不得默认三季结构。",
  ].join("\n"),

  creation_character_bible: [
    "任务：在《背景及世界观》约束下生成或更新《角色圣经》。",
    "包含角色层级、信息差、Want/Need/Fear/Secret、人物弧线、关系矩阵、对白样式、视觉锚点、当前状态与风险控制。",
    "只输出可直接保存的 Markdown；每个角色必须有明确剧情功能。",
  ].join("\n"),

  creation_plot_outline: [
    "任务：在《背景及世界观》和《角色圣经》约束下生成或更新《剧情及大纲》。",
    "包含全局主线、关键因果、反转与终局，并使用“## 大章 N｜标题”和“### 第 N 章/集｜标题”输出可解析结构。",
    "大章数量和每章/集数量按用户确认内容决定，不得强制固定规模。只输出可直接保存的 Markdown。",
  ].join("\n"),

  creation_novel_unit: [
    "任务：按当前结构生成小说正文。默认一次只生成一个章；generationScope=arc 时可生成当前大章，但每章仍须独立返回。",
    "叙述与对白统一使用 options.sourceLanguage，承接前三份共享文档、前序锁定单元摘要和连续性备注。",
    "单章必须严格输出：<CREATION_OUTPUT> 后接 JSON 对象，再以 </CREATION_OUTPUT> 结束。",
    "JSON 字段仅包含 number、title、outline、content；content 是完整正文，不是梗概。大章批量时标记内改为 JSON 数组。",
  ].join("\n"),

  creation_screenplay_unit: [
    "Task: create one structured screenplay mother model for the current episode. Never invent three separate format drafts.",
    "Scene/action/production text uses options.screenplayLanguage. Spoken dialogue uses options.dialogueLanguage and each dialogue block includes its screenplay-language translation.",
    "The same mother model will later render as international_production, hollywood_spec, or asian_production; screenplayFormat selects preview only.",
    "Return only <CREATION_OUTPUT> JSON </CREATION_OUTPUT>. Fields: number, title, outline, content, screenplay.",
    "screenplay fields: id, episodeNo, title, logline, scenes[]. Each scene has id, sceneNo, interiorExterior (INT/EXT/INT/EXT), location, timeOfDay, characters[], blocks[]. Each block has id, type, character, text, translation.",
  ].join("\n"),

  creation_translate_unit: [
    "任务：翻译当前章/集的完整内容，从 options.sourceLanguage 翻译为 options.translationLanguage。",
    "翻译阶段为 optional（可跳过），但一旦执行必须保留结构、段落、角色口吻、专名和剧情事实，不得摘要或本土化改写。",
    "只输出完整译文，不输出原文复述或说明。",
  ].join("\n"),

  creation_localize_unit: [
    "任务：对当前章/集同时完成目标市场本土化、修改留痕和雷同风险检查。优先使用已有译文；没有译文则处理原文。",
    "严格按以下三个标记输出，三部分必须来自同一次处理并绑定同一版本：",
    "---LOCALIZED_CONTENT---",
    "本土化后的完整内容",
    "---LOCALIZATION_CHANGES---",
    "逐项说明修改前、修改后、原因和影响范围",
    "---SIMILARITY_REPORT---",
    "高频套路、潜在相似风险、原创化建议和可安全保留表达",
    "不得改变核心剧情事实、角色关系、场景顺序或关键钩子。",
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
  const rules = payload.taskType === "song_workbench"
    ? songRules
    : isCreationTask(payload.taskType)
      ? creationRules(payload.options?.interfaceLanguage)
      : isNovelTask(payload.taskType)
        ? novelRules
        : commonRules;

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

function isCreationTask(taskType: TaskType) {
  return taskType.startsWith("creation_");
}

export function isTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(taskNames, value);
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
    interfaceLanguage: payload.options?.interfaceLanguage || "zh-CN",
    contentMode: payload.options?.contentMode || "novel",
    translationLanguage: payload.options?.translationLanguage || "",
    screenplayLanguage: payload.options?.screenplayLanguage || payload.options?.sourceLanguage || "中文",
    dialogueLanguage: payload.options?.dialogueLanguage || payload.options?.sourceLanguage || "中文",
    screenplayFormat: payload.options?.screenplayFormat || "international_production",
    generationScope: payload.options?.generationScope || "unit",
    unitNo: payload.options?.unitNo || payload.options?.chapterNo || 1,
    arcTitle: payload.options?.arcTitle || "",
  };
}
