/**
 * Storyboard analyze — AI prompt construction.
 *
 * Task card: KIIKIS-P1-KIMI-002 §1
 *
 * The system prompt demands ONLY a JSON object (no markdown fences, no
 * commentary) of the strict AiAnalyzeOutput shape. The user message carries
 * the generation parameters plus the FULL script (mode="full") or ONLY the
 * target scene's sourceText (mode="scene").
 *
 * Short-drama pacing: shots 2–8s, total ≈ targetDurationSeconds, dialogue
 * kept VERBATIM in its original language (never translated), no dropped
 * dialogue or key actions.
 *
 * ERASABLE SYNTAX ONLY (Node type-stripping).
 */

import type { ValidatedAnalyzeRequest } from "./types.ts";

const OUTPUT_SHAPE = `{
  "scenes": [
    {
      "heading": "INT. 别墅客厅 - 夜",
      "location": "别墅客厅",
      "timeOfDay": "夜",
      "summary": "本场剧情一句话概括",
      "sourceText": "本场对应的剧本原文（逐字摘录，不可改写）",
      "characters": ["角色名"],
      "props": ["关键道具名"],
      "shots": [
        {
          "sourceText": "本镜头对应的剧本原文（逐字摘录）",
          "storyBeat": "叙事节拍，如：女主发现秘密",
          "visualDescription": "画面内容的具体描述（主体、动作、环境）",
          "characters": ["出镜角色名"],
          "location": "本镜头所在场景名（与 assets.locations 中的 name 对应）",
          "props": ["本镜头出现的关键道具名"],
          "shotSize": "景别，如 特写/近景/中景/全景/远景",
          "cameraMovement": "镜头运动，如 固定/推/拉/摇/移/跟",
          "angle": "机位角度，如 平视/俯拍/仰拍",
          "durationSeconds": 4,
          "dialogue": "本镜头台词，逐字保留原文语言，无台词则为空字符串",
          "emotion": "情绪，如 震惊 / 隐忍 / 爆发",
          "continuity": "连贯性限制（服装、发型、道具状态、时间线）"
        }
      ]
    }
  ],
  "assets": {
    "characters": [
      {
        "name": "角色名（全剧唯一）",
        "aliases": ["别名/称呼"],
        "scriptBasis": "剧本中支撑该角色设定的原文摘录",
        "description": "外貌、年龄、服装、气质的具体描写（用于生成参考图）",
        "visualKeywords": ["关键词1", "关键词2"]
      }
    ],
    "locations": [
      {
        "name": "场景名（全剧唯一）",
        "aliases": [],
        "scriptBasis": "剧本中支撑该场景设定的原文摘录",
        "description": "空间、装修风格、时间、氛围的具体描写",
        "visualKeywords": ["关键词1"]
      }
    ],
    "props": [
      {
        "name": "关键道具名",
        "aliases": [],
        "scriptBasis": "剧本中该道具出现的原文摘录",
        "description": "材质、年代、品牌档次、细节的具体描写",
        "visualKeywords": ["关键词1"]
      }
    ]
  }
}`;

export function buildAnalyzeSystemPrompt(request: ValidatedAnalyzeRequest): string {
  const sceneOnly = request.mode === "scene";
  return [
    "你是一名短剧分镜导演，把剧本拆解为结构化的分镜 JSON。",
    "",
    "硬性要求：",
    "1. 只输出一个 JSON 对象：不要 markdown 代码块、不要任何解释文字、不要注释。第一个字符必须是 {，最后一个字符必须是 }。",
    "2. JSON 必须严格符合以下结构（字段名、层级完全一致；字符串用双引号；durationSeconds 用数字）：",
    OUTPUT_SHAPE,
    "3. 短剧节奏：每个镜头 2–8 秒；所有镜头时长之和 ≈ " +
      `${request.targetDurationSeconds} 秒；不得遗漏任何台词或关键动作。`,
    "4. 台词（dialogue）必须逐字保留剧本原文语言：中文保持中文、西班牙语保持西班牙语、英语保持英语，绝不翻译、绝不改写。",
    "5. sourceText 必须逐字摘自输入剧本；不得虚构剧本中不存在的台词或情节。",
    "6. 角色/场景/道具的 name 在全部 scenes 与 assets 中保持一致；shot 中引用的名字必须能在 assets 里找到（或在 shot.characters/props 中如实给出原名）。",
    "7. 只收录对剧情关键的道具（反复出现或推动剧情的物件），不要把桌椅等背景陈设列为道具。",
    `8. 视觉风格：${request.visualStyle || "写实短剧"}；画幅：${request.aspectRatio}；输出语言（summary/storyBeat/visualDescription/emotion/continuity 等描述字段）：${request.outputLanguage}。description 字段请写具体、可直接用于图像生成的外貌/空间/材质描写。`,
    sceneOnly
      ? "9. 本次只重新分析用户消息中给出的【单场】剧本：scenes 数组只返回这一个场景（shots 为该场的完整新分镜），assets 只返回该场涉及的角色/场景/道具。"
      : "9. scenes 按剧本顺序排列；每场的 shots 按镜头顺序排列。",
  ].join("\n");
}

export function buildAnalyzeUserPrompt(
  request: ValidatedAnalyzeRequest,
  scope: { sceneSourceText?: string },
): string {
  const lines = [
    `目标总时长：${request.targetDurationSeconds} 秒`,
    `画幅：${request.aspectRatio}`,
    `视觉风格：${request.visualStyle || "写实短剧"}`,
    `输出语言：${request.outputLanguage}`,
    "",
  ];
  if (request.mode === "scene") {
    lines.push("【待重新分析的单场剧本原文】", scope.sceneSourceText ?? "");
  } else {
    lines.push("【剧本原文全文】", request.source);
  }
  return lines.join("\n");
}
