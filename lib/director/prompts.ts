/**
 * TRAE-V2-04 AI Director 专用 Prompt
 * 输出严格 JSON schema，包含所有 Director 维度字段
 */

import type { DirectorBreakdownRequest } from "./types.ts";

// ============================================================
// System Prompt
// ============================================================

export function buildDirectorSystemPrompt(): string {
  return `你是一位资深短剧导演与镜头设计师，精通 9:16 竖屏短剧的镜头语言。

你的任务是将剧本拆解为 Scene 和 Shot，并为每个 Shot 提供完整的导演设计。

## 输出格式（严格 JSON，不要 markdown 包裹）

{
  "scenes": [
    {
      "heading": "场景标题（如：第1场-咖啡馆-日）",
      "location": "地点",
      "time_of_day": "日/夜/黄昏/黎明",
      "summary": "场景摘要（1-2句）",
      "source_text": "原文引用",
      "characters": ["角色名1", "角色名2"],
      "props": ["道具1"],
      "scene_function": "建立|推进|转折|高潮|收束",
      "conflict": "冲突描述",
      "emotion": "情绪基调",
      "value_shift": "价值变化（从X到Y）",
      "blocking": "走位/调度",
      "source_quote_range": {"start": 0, "end": 100},
      "shots": [
        {
          "source_text": "原文",
          "story_beat": "故事节拍",
          "visual_description": "画面描述",
          "characters": ["角色名"],
          "location": "地点",
          "props": [],
          "shot_size": "景别：远景/全景/中景/近景/特写/大特写",
          "camera_movement": "运镜：固定/推/拉/摇/移/跟/升/降/手持",
          "angle": "角度：平视/俯视/仰视/斜角",
          "duration_seconds": 5,
          "dialogue": "对白",
          "emotion": "情绪",
          "continuity": "连续性注意",
          "focal_length": "焦段（如 35mm）",
          "blocking": "人物调度",
          "camera_start": "机位起点",
          "movement_path": "运动路径",
          "speed_curve": "速度曲线",
          "parallax": "前后景视差",
          "focus_change": "焦点变化",
          "end_frame": "落幅画面",
          "transition_interface": "转场：硬切/叠化/匹配剪辑",
          "lighting": "光影",
          "color": "色彩",
          "sound_effects": "音效层"
        }
      ]
    }
  ]
}

## 规则

1. 默认画幅 9:16，每个 Shot 的构图必须以竖屏为真实画面比例
2. 运镜不得只输出"缓慢推进"，必须明确起幅、路径、速度曲线、落幅
3. 先定义叙事和情绪功能，再输出镜头参数
4. 每个 Scene 必须有明确的 scene_function 和 conflict
5. 每个 Shot 必须有完整的 director 字段（focal_length/movement_path/speed_curve/end_frame/lighting/color 等）
6. duration_seconds 在 2-10 秒之间
7. 输出语言跟随用户指定的 outputLanguage
8. 只输出 JSON，不要任何解释文字、不要 markdown 代码块`;
}

// ============================================================
// User Prompt
// ============================================================

export function buildDirectorUserPrompt(request: DirectorBreakdownRequest): string {
  const parts: string[] = [];

  parts.push(`## 剧本源文`);
  parts.push(request.source);

  parts.push(`\n## 生产规范`);
  parts.push(`- 画幅: ${request.aspectRatio}`);
  parts.push(`- 目标总时长: ${request.targetDurationSeconds} 秒`);
  parts.push(`- 视觉风格: ${request.visualStyle || "现代短剧"}`);
  parts.push(`- 输出语言: ${request.outputLanguage}`);

  if (request.mode === "scene" && request.sceneId) {
    parts.push(`\n## 重新分析模式`);
    parts.push(`- 仅重新分析 sceneId: ${request.sceneId}`);
    parts.push(`- 其他场景保持不变`);
  }

  if (request.lockedSceneIds && request.lockedSceneIds.length > 0) {
    parts.push(`\n## 已锁定场景（不要覆盖）`);
    parts.push(request.lockedSceneIds.join(", "));
  }
  if (request.lockedShotIds && request.lockedShotIds.length > 0) {
    parts.push(`\n## 已锁定镜头（不要覆盖）`);
    parts.push(request.lockedShotIds.join(", "));
  }

  parts.push(`\n## 任务`);
  parts.push(`请将上述剧本拆解为 Scene 和 Shot，为每个 Shot 提供完整的导演设计。`);
  parts.push(`只输出 JSON，不要任何解释文字。`);

  return parts.join("\n");
}

// ============================================================
// Output Parser
// ============================================================

export function parseDirectorOutput(raw: string): unknown {
  // 去除可能的 markdown 代码块包裹
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  // 提取第一个 { 到最后一个 }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("AI 输出不含合法 JSON 对象");
  }
  cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  return JSON.parse(cleaned);
}
